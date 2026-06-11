import { analyzeAgentRequest } from "./agent-analysis.js";
import type { RequestDetail } from "./types.js";

export interface SessionInventoryTool {
  name: string;
  seenCount: number;
  firstRequestId: number;
  lastRequestId: number;
  requestIds: number[];
  schemaChars: number;
  inputSchemaChars: number;
  descriptionPreview: string | null;
  schemaChanged: boolean;
}

export interface SessionInventorySkill {
  name: string;
  description: string;
  seenCount: number;
  firstRequestId: number;
  lastRequestId: number;
  requestIds: number[];
  chars: number;
  preview: string | null;
}

export interface SessionInventory {
  requestCount: number;
  agentRequestCount: number;
  toolCount: number;
  skillCount: number;
  tools: SessionInventoryTool[];
  skills: SessionInventorySkill[];
}

interface ToolDraft {
  name: string;
  seenCount: number;
  firstRequestId: number;
  lastRequestId: number;
  requestIds: Set<number>;
  schemaChars: number;
  inputSchemaChars: number;
  descriptionPreview: string | null;
  schemaVersions: Set<string>;
}

interface SkillDraft {
  name: string;
  description: string;
  seenCount: number;
  firstRequestId: number;
  lastRequestId: number;
  requestIds: Set<number>;
  chars: number;
  preview: string | null;
}

export function buildSessionInventory(details: RequestDetail[]): SessionInventory {
  const ordered = [...details].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id - right.id);
  const tools = new Map<string, ToolDraft>();
  const skills = new Map<string, SkillDraft>();
  let agentRequestCount = 0;

  for (const detail of ordered) {
    const body = parseRequestBody(detail);
    if (!analyzeAgentRequest(body) || !isRecord(body)) {
      continue;
    }
    agentRequestCount += 1;

    for (const tool of Array.isArray(body.tools) ? body.tools : []) {
      recordTool(tools, detail.id, tool);
    }
    for (const skill of extractSuspectedSkills(body.system)) {
      recordSkill(skills, detail.id, skill);
    }
  }

  const toolList = [...tools.values()]
    .map((tool) => ({
      name: tool.name,
      seenCount: tool.seenCount,
      firstRequestId: tool.firstRequestId,
      lastRequestId: tool.lastRequestId,
      requestIds: [...tool.requestIds],
      schemaChars: tool.schemaChars,
      inputSchemaChars: tool.inputSchemaChars,
      descriptionPreview: tool.descriptionPreview,
      schemaChanged: tool.schemaVersions.size > 1
    }))
    .sort((left, right) => right.seenCount - left.seenCount || left.name.localeCompare(right.name));
  const skillList = [...skills.values()]
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      seenCount: skill.seenCount,
      firstRequestId: skill.firstRequestId,
      lastRequestId: skill.lastRequestId,
      requestIds: [...skill.requestIds],
      chars: skill.chars,
      preview: skill.preview
    }))
    .sort((left, right) => right.seenCount - left.seenCount || left.name.localeCompare(right.name));

  return {
    requestCount: ordered.length,
    agentRequestCount,
    toolCount: toolList.length,
    skillCount: skillList.length,
    tools: toolList,
    skills: skillList
  };
}

function recordTool(tools: Map<string, ToolDraft>, requestId: number, value: unknown): void {
  const name = isRecord(value) && typeof value.name === "string" ? value.name : "unnamed";
  const schema = stableJson(value);
  const inputSchema = isRecord(value) ? value.input_schema : null;
  const existing = tools.get(name);

  if (!existing) {
    tools.set(name, {
      name,
      seenCount: 1,
      firstRequestId: requestId,
      lastRequestId: requestId,
      requestIds: new Set([requestId]),
      schemaChars: schema.length,
      inputSchemaChars: stableJson(inputSchema).length,
      descriptionPreview: descriptionPreview(value),
      schemaVersions: new Set([schema])
    });
    return;
  }

  existing.seenCount += 1;
  existing.lastRequestId = requestId;
  existing.requestIds.add(requestId);
  existing.schemaChars = schema.length;
  existing.inputSchemaChars = stableJson(inputSchema).length;
  existing.descriptionPreview = descriptionPreview(value);
  existing.schemaVersions.add(schema);
}

function recordSkill(skills: Map<string, SkillDraft>, requestId: number, value: ExtractedSkill): void {
  const existing = skills.get(value.name);
  if (!existing) {
    skills.set(value.name, {
      name: value.name,
      description: value.description,
      seenCount: 1,
      firstRequestId: requestId,
      lastRequestId: requestId,
      requestIds: new Set([requestId]),
      chars: value.chars,
      preview: value.preview
    });
    return;
  }

  existing.seenCount += 1;
  existing.lastRequestId = requestId;
  existing.requestIds.add(requestId);
  existing.description = value.description;
  existing.chars = value.chars;
  existing.preview = value.preview;
}

interface ExtractedSkill {
  name: string;
  description: string;
  chars: number;
  preview: string | null;
}

function extractSuspectedSkills(system: unknown): ExtractedSkill[] {
  const text = systemText(system);
  if (!text) {
    return [];
  }

  const skills: ExtractedSkill[] = [];
  const pattern = /(?:^|\n)name:\s*([^\n]+)\n(?:[\s\S]{0,1200}?)description:\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const preview = text.slice(match.index, pattern.lastIndex).trim();
    skills.push({
      name: match[1].trim(),
      description: match[2].trim(),
      chars: pattern.lastIndex - match.index,
      preview: truncate(preview, 360)
    });
  }
  return skills;
}

function systemText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(systemText).filter(Boolean).join("\n\n");
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") {
      return value.text;
    }
    if (typeof value.content === "string") {
      return value.content;
    }
    if (value.content !== undefined) {
      return systemText(value.content);
    }
  }
  return "";
}

function parseRequestBody(detail: RequestDetail): unknown {
  const value = detail.payload?.requestBodyJson;
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function descriptionPreview(value: unknown): string | null {
  if (!isRecord(value) || typeof value.description !== "string") {
    return null;
  }
  return truncate(value.description, 220);
}

function stableJson(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return JSON.stringify(value);
}

function truncate(value: string, max: number): string | null {
  if (!value) {
    return null;
  }
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
