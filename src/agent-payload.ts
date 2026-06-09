import { analyzeAgentRequest } from "./agent-analysis.js";
import type { RequestDetail } from "./types.js";

export interface ExtractedAgentPayload {
  requestId: number;
  startedAt: string;
  model: string | null;
  latestUserText: string | null;
  messageCount: number;
  toolNames: string[];
  toolUseCount: number;
  toolResultCount: number;
  estimatedContextChars: number;
  systemChars: number;
  toolSchemaChars: number;
  toolCount: number;
  suspectedSkillCount: number;
}

export function extractAgentPayload(detail: RequestDetail): ExtractedAgentPayload | null {
  const body = parseRequestBody(detail);
  const summary = analyzeAgentRequest(body);
  if (!summary) {
    return null;
  }

  const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];

  return {
    requestId: detail.id,
    startedAt: detail.startedAt,
    model: summary.model,
    latestUserText: latestUserText(messages),
    messageCount: summary.messageCount,
    toolNames: summary.toolNames,
    toolUseCount: summary.toolUseCount,
    toolResultCount: summary.toolResultCount,
    estimatedContextChars: summary.estimatedContextChars,
    systemChars: summary.systemChars,
    toolSchemaChars: summary.toolSchemaChars,
    toolCount: summary.toolCount,
    suspectedSkillCount: summary.suspectedSkillCount
  };
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

function latestUserText(messages: unknown[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message) || message.role !== "user") {
      continue;
    }
    const text = contentText(message.content);
    if (text) {
      return text;
    }
  }
  return null;
}

function contentText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const text = value.map(contentText).filter(Boolean).join("\n").trim();
    return text || null;
  }
  if (isRecord(value) && typeof value.text === "string") {
    return value.text;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
