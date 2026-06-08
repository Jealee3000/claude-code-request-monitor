import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

export interface LocalClaudeSession {
  sessionId: string;
  projectPath: string;
  filePath: string;
  modifiedAt: string;
  sizeBytes: number;
  latestPrompt: string | null;
}

const SESSION_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

export function defaultClaudeHome(): string {
  return join(homedir(), ".claude");
}

export function listLocalClaudeSessions(claudeHome = defaultClaudeHome()): LocalClaudeSession[] {
  const projectsDir = join(claudeHome, "projects");
  if (!existsSync(projectsDir)) {
    return [];
  }

  const sessions: LocalClaudeSession[] = [];
  for (const projectEntry of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!projectEntry.isDirectory()) {
      continue;
    }

    const projectDir = join(projectsDir, projectEntry.name);
    for (const fileEntry of readdirSync(projectDir, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !SESSION_FILE_RE.test(fileEntry.name)) {
        continue;
      }

      const filePath = join(projectDir, fileEntry.name);
      const stats = statSync(filePath);
      const sessionId = basename(fileEntry.name, ".jsonl");
      sessions.push({
        sessionId,
        projectPath: readProjectPath(filePath) ?? decodeProjectPath(projectEntry.name),
        filePath,
        modifiedAt: stats.mtime.toISOString(),
        sizeBytes: stats.size,
        latestPrompt: readLatestPrompt(filePath)
      });
    }
  }

  return sessions.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

export function decodeProjectPath(encoded: string): string {
  const driveMatch = /^([a-z])--(.+)$/i.exec(encoded);
  if (driveMatch) {
    const drive = driveMatch[1].toUpperCase();
    const rest = driveMatch[2];
    const firstSeparator = rest.indexOf("-");
    if (firstSeparator >= 0) {
      return `${drive}:\\${rest.slice(0, firstSeparator)}\\${rest.slice(firstSeparator + 1)}`;
    }
    return `${drive}:\\${rest}`;
  }
  return encoded.replace(/--/g, "\\");
}

function readProjectPath(filePath: string): string | null {
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    try {
      const record = JSON.parse(line) as unknown;
      if (record && typeof record === "object" && typeof (record as Record<string, unknown>).cwd === "string") {
        return (record as { cwd: string }).cwd;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function readLatestPrompt(filePath: string): string | null {
  const text = readFileSync(filePath, "utf8");
  let latest: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    try {
      const record = JSON.parse(line) as unknown;
      latest = extractPrompt(record) ?? latest;
    } catch {
      continue;
    }
  }

  return latest;
}

function extractPrompt(record: unknown): string | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const value = record as Record<string, unknown>;
  if (typeof value.lastPrompt === "string") {
    return value.lastPrompt;
  }
  return extractContentText(value.message) ?? extractContentText(value.content);
}

function extractContentText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    const text = value.map(extractContentText).filter(Boolean).join("\n").trim();
    return text || null;
  }

  const object = value as Record<string, unknown>;
  if (typeof object.text === "string") {
    return object.text;
  }
  return extractContentText(object.content);
}
