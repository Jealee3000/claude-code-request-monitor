import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { loadRedactionRulesFromFile } from "./redact.js";
import type { MonitorConfig } from "./types.js";

export function parseConfig(argv = hideBin(process.argv)): MonitorConfig {
  const parsed = yargs(argv)
    .option("host", {
      type: "string",
      default: envString("CLAUDE_WATCH_HOST", "127.0.0.1")
    })
    .option("viewer-port", {
      type: "number",
      default: envNumber("CLAUDE_WATCH_VIEWER_PORT", 43110)
    })
    .option("proxy-port", {
      type: "number",
      default: envNumber("CLAUDE_WATCH_PROXY_PORT", 43111)
    })
    .option("data-dir", {
      type: "string",
      default: envString("CLAUDE_WATCH_DATA_DIR", ".claude-watch")
    })
    .option("session-id", {
      type: "string",
      default: envString("CLAUDE_WATCH_SESSION_ID", createSessionId())
    })
    .option("project", {
      type: "string",
      default: envString("CLAUDE_WATCH_PROJECT", process.cwd())
    })
    .option("inspect-body", {
      type: "boolean",
      default: envBoolean("CLAUDE_WATCH_INSPECT_BODY", false)
    })
    .option("redaction-config", {
      type: "string",
      default: envString("CLAUDE_WATCH_REDACTION_CONFIG", "")
    })
    .help()
    .parseSync();

  const dataDir = resolve(String(parsed.dataDir));
  const redactionConfigPath = parsed.redactionConfig ? resolve(String(parsed.redactionConfig)) : null;
  mkdirSync(dataDir, { recursive: true });

  return {
    host: String(parsed.host),
    viewerPort: Number(parsed.viewerPort),
    proxyPort: Number(parsed.proxyPort),
    dataDir,
    dbPath: resolve(dataDir, "requests.sqlite"),
    sessionId: String(parsed.sessionId),
    projectPath: resolve(String(parsed.project)),
    inspectBody: Boolean(parsed.inspectBody),
    redactionConfigPath,
    redactionRules: redactionConfigPath ? loadRedactionRulesFromFile(redactionConfigPath) : {}
  };
}

export function createSessionId(date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `session-${stamp}-${suffix}`;
}

function envString(name: string, fallback: string): string {
  return process.env[name] && process.env[name] !== "" ? process.env[name] : fallback;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
