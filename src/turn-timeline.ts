import { extractAgentPayload } from "./agent-payload.js";
import type { RequestDetail } from "./types.js";

export interface TurnTimelineItem {
  key: string;
  firstRequestAt: string;
  lastRequestAt: string;
  requestIds: number[];
  requestCount: number;
  latestUserPreview: string | null;
  model: string | null;
  toolNames: string[];
  maxContextChars: number;
  toolUseCount: number;
  toolResultCount: number;
}

export function buildTurnTimeline(details: RequestDetail[]): TurnTimelineItem[] {
  const groups = new Map<string, TurnTimelineItem>();

  for (const detail of details) {
    const payload = extractAgentPayload(detail);
    if (!payload) {
      continue;
    }
    const key = payload.latestUserText ? `user:${payload.latestUserText}` : `request:${detail.id}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        firstRequestAt: detail.startedAt,
        lastRequestAt: detail.startedAt,
        requestIds: [detail.id],
        requestCount: 1,
        latestUserPreview: truncate(payload.latestUserText, 180),
        model: payload.model,
        toolNames: [...new Set(payload.toolNames)],
        maxContextChars: payload.estimatedContextChars,
        toolUseCount: payload.toolUseCount,
        toolResultCount: payload.toolResultCount
      });
      continue;
    }

    existing.firstRequestAt = minIso(existing.firstRequestAt, detail.startedAt);
    existing.lastRequestAt = maxIso(existing.lastRequestAt, detail.startedAt);
    existing.requestIds.push(detail.id);
    existing.requestCount += 1;
    existing.model = payload.model ?? existing.model;
    existing.toolNames = [...new Set([...existing.toolNames, ...payload.toolNames])];
    existing.maxContextChars = Math.max(existing.maxContextChars, payload.estimatedContextChars);
    existing.toolUseCount += payload.toolUseCount;
    existing.toolResultCount += payload.toolResultCount;
  }

  return [...groups.values()].sort((left, right) => right.firstRequestAt.localeCompare(left.firstRequestAt));
}

function truncate(value: string | null, max: number): string | null {
  if (!value || value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

function minIso(left: string, right: string): string {
  return left <= right ? left : right;
}

function maxIso(left: string, right: string): string {
  return left >= right ? left : right;
}
