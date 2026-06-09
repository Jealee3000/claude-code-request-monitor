import { extractAgentPayload, type ExtractedAgentPayload } from "./agent-payload.js";
import { parseResponsePreviewFromDetail, type ResponseStreamToolUse } from "./response-stream.js";
import type { RequestDetail } from "./types.js";

export interface TurnDetailToolUse extends ResponseStreamToolUse {
  requestId: number;
}

export interface TurnDetailToolLoop {
  toolUseId: string;
  name: string | null;
  inputJson: string;
  toolUseRequestId: number;
  resultRequestId: number;
  resultPreview: string;
  resultChars: number;
  isError: boolean;
  contextDeltaAfterResult: number | null;
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
  toolLoops: TurnDetailToolLoop[];
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
  const knownToolUses = new Map<string, TurnDetailToolUse>();
  const toolLoops: TurnDetailToolLoop[] = [];
  const steps = turnItems.map((item, index) => {
    const response = parseResponsePreviewFromDetail(item.detail);
    const contextDelta = previousContextChars === null
      ? null
      : item.payload.estimatedContextChars - previousContextChars;
    previousContextChars = item.payload.estimatedContextChars;
    if (response.assistantText) {
      finalAssistantText = response.assistantText;
    }

    for (const result of extractToolResults(item.detail)) {
      const toolUse = knownToolUses.get(result.toolUseId);
      if (!toolUse) {
        continue;
      }
      toolLoops.push({
        toolUseId: result.toolUseId,
        name: toolUse.name,
        inputJson: toolUse.inputJson,
        toolUseRequestId: toolUse.requestId,
        resultRequestId: item.detail.id,
        resultPreview: result.resultPreview,
        resultChars: result.resultChars,
        isError: result.isError,
        contextDeltaAfterResult: contextDelta
      });
    }

    for (const toolUse of response.toolUses.map((tool) => ({ ...tool, requestId: item.detail.id }))) {
      toolUses.push(toolUse);
      if (toolUse.id) {
        knownToolUses.set(toolUse.id, toolUse);
      }
    }

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
    toolLoops,
    steps
  };
}

function turnKey(detail: RequestDetail, payload: ExtractedAgentPayload): string {
  return payload.latestUserText ? `user:${payload.latestUserText}` : `request:${detail.id}`;
}

function extractToolResults(detail: RequestDetail): Array<{
  toolUseId: string;
  resultPreview: string;
  resultChars: number;
  isError: boolean;
}> {
  const body = parseRequestBody(detail);
  const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
  const results: Array<{
    toolUseId: string;
    resultPreview: string;
    resultChars: number;
    isError: boolean;
  }> = [];

  for (const message of messages) {
    if (!isRecord(message)) {
      continue;
    }
    const blocks = Array.isArray(message.content) ? message.content : [message.content];
    for (const block of blocks) {
      if (!isRecord(block) || block.type !== "tool_result" || typeof block.tool_use_id !== "string") {
        continue;
      }
      const text = contentText(block.content);
      results.push({
        toolUseId: block.tool_use_id,
        resultPreview: truncate(text, 500),
        resultChars: text.length,
        isError: block.is_error === true
      });
    }
  }

  return results;
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

function contentText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(contentText).filter(Boolean).join("\n");
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") {
      return value.text;
    }
    if (value.content !== undefined) {
      return contentText(value.content);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
