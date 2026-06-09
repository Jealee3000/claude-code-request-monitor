import { extractAgentPayload, type ExtractedAgentPayload } from "./agent-payload.js";
import { parseResponsePreviewFromDetail, type ResponseStreamToolUse } from "./response-stream.js";
import type { RequestDetail } from "./types.js";

export interface TurnDetailToolUse extends ResponseStreamToolUse {
  requestId: number;
}

export interface TurnDetailStep {
  requestId: number;
  stepIndex: number;
  startedAt: string;
  statusCode: number | null;
  durationMs: number | null;
  model: string | null;
  messageCount: number;
  contextChars: number;
  contextDelta: number | null;
  systemChars: number;
  toolSchemaChars: number;
  toolNames: string[];
  responseAssistantText: string;
  responseToolUseCount: number;
  responseUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
}

export interface TurnDetail {
  key: string;
  latestUserText: string | null;
  firstRequestAt: string;
  lastRequestAt: string;
  requestIds: number[];
  requestCount: number;
  finalAssistantText: string;
  toolUses: TurnDetailToolUse[];
  steps: TurnDetailStep[];
}

export function buildTurnDetail(details: RequestDetail[], selectedRequestId: number): TurnDetail | null {
  const extracted = details
    .map((detail) => ({ detail, payload: extractAgentPayload(detail) }))
    .filter((item): item is { detail: RequestDetail; payload: ExtractedAgentPayload } => item.payload !== null);
  const selected = extracted.find((item) => item.detail.id === selectedRequestId);
  if (!selected) {
    return null;
  }

  const key = turnKey(selected.detail, selected.payload);
  const turnItems = extracted
    .filter((item) => turnKey(item.detail, item.payload) === key)
    .sort((left, right) => left.detail.startedAt.localeCompare(right.detail.startedAt) || left.detail.id - right.detail.id);

  if (!turnItems.length) {
    return null;
  }

  let previousContextChars: number | null = null;
  let finalAssistantText = "";
  const toolUses: TurnDetailToolUse[] = [];
  const steps = turnItems.map((item, index) => {
    const response = parseResponsePreviewFromDetail(item.detail);
    const contextDelta = previousContextChars === null
      ? null
      : item.payload.estimatedContextChars - previousContextChars;
    previousContextChars = item.payload.estimatedContextChars;
    if (response.assistantText) {
      finalAssistantText = response.assistantText;
    }
    toolUses.push(...response.toolUses.map((tool) => ({ ...tool, requestId: item.detail.id })));

    return {
      requestId: item.detail.id,
      stepIndex: index + 1,
      startedAt: item.detail.startedAt,
      statusCode: item.detail.statusCode,
      durationMs: item.detail.durationMs,
      model: item.payload.model,
      messageCount: item.payload.messageCount,
      contextChars: item.payload.estimatedContextChars,
      contextDelta,
      systemChars: item.payload.systemChars,
      toolSchemaChars: item.payload.toolSchemaChars,
      toolNames: item.payload.toolNames,
      responseAssistantText: response.assistantText,
      responseToolUseCount: response.toolUses.length,
      responseUsage: response.usage
    };
  });

  return {
    key,
    latestUserText: selected.payload.latestUserText,
    firstRequestAt: turnItems[0].detail.startedAt,
    lastRequestAt: turnItems[turnItems.length - 1].detail.startedAt,
    requestIds: turnItems.map((item) => item.detail.id),
    requestCount: turnItems.length,
    finalAssistantText,
    toolUses,
    steps
  };
}

function turnKey(detail: RequestDetail, payload: ExtractedAgentPayload): string {
  return payload.latestUserText ? `user:${payload.latestUserText}` : `request:${detail.id}`;
}
