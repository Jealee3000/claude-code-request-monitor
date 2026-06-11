import { analyzeAgentRequest } from "./agent-analysis.js";
import type { RequestDetail } from "./types.js";

export interface SessionParameterSnapshot {
  requestId: number;
  startedAt: string;
  model: string | null;
  stream: boolean | null;
  maxTokens: number | null;
  temperature: number | null;
  topP: number | null;
  toolChoice: string | null;
  thinking: string | null;
  messageCount: number;
  toolCount: number;
  estimatedContextChars: number;
  contextDelta: number | null;
  changedFields: string[];
}

export interface SessionParameters {
  requestCount: number;
  agentRequestCount: number;
  latest: SessionParameterSnapshot | null;
  distinct: {
    models: string[];
    maxTokens: number[];
    thinking: string[];
    toolChoices: string[];
  };
  snapshots: SessionParameterSnapshot[];
}

type ComparableField =
  | "model"
  | "stream"
  | "maxTokens"
  | "temperature"
  | "topP"
  | "toolChoice"
  | "thinking"
  | "messageCount"
  | "toolCount"
  | "estimatedContextChars";

const COMPARED_FIELDS: ComparableField[] = [
  "model",
  "stream",
  "maxTokens",
  "temperature",
  "topP",
  "toolChoice",
  "thinking",
  "messageCount",
  "toolCount",
  "estimatedContextChars"
];

export function buildSessionParameters(details: RequestDetail[]): SessionParameters {
  const ordered = [...details].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id - right.id);
  const snapshots: SessionParameterSnapshot[] = [];
  let previous: SessionParameterSnapshot | null = null;

  for (const detail of ordered) {
    const body = parseRequestBody(detail);
    const summary = analyzeAgentRequest(body);
    if (!summary) {
      continue;
    }

    const snapshotBase = {
      requestId: detail.id,
      startedAt: detail.startedAt,
      model: summary.model,
      stream: summary.stream,
      maxTokens: summary.maxTokens,
      temperature: summary.temperature,
      topP: summary.topP,
      toolChoice: summary.toolChoice,
      thinking: summary.thinking,
      messageCount: summary.messageCount,
      toolCount: summary.toolCount,
      estimatedContextChars: summary.estimatedContextChars,
      contextDelta: previous ? summary.estimatedContextChars - previous.estimatedContextChars : null
    };
    const snapshot: SessionParameterSnapshot = {
      ...snapshotBase,
      changedFields: previous ? changedFields(previous, snapshotBase) : []
    };
    snapshots.push(snapshot);
    previous = snapshot;
  }

  return {
    requestCount: ordered.length,
    agentRequestCount: snapshots.length,
    latest: snapshots[snapshots.length - 1] ?? null,
    distinct: {
      models: distinctStrings(snapshots.map((snapshot) => snapshot.model)),
      maxTokens: distinctNumbers(snapshots.map((snapshot) => snapshot.maxTokens)),
      thinking: distinctStrings(snapshots.map((snapshot) => snapshot.thinking)),
      toolChoices: distinctStrings(snapshots.map((snapshot) => snapshot.toolChoice))
    },
    snapshots
  };
}

function changedFields(previous: SessionParameterSnapshot, current: Omit<SessionParameterSnapshot, "changedFields">): string[] {
  return COMPARED_FIELDS.filter((field) => previous[field] !== current[field]);
}

function distinctStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right));
}

function distinctNumbers(values: Array<number | null>): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)))].sort((left, right) => left - right);
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
