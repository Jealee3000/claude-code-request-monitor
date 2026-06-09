import type { RequestDetail } from "./types.js";

export interface ResponseStreamEvent {
  event: string | null;
  type: string | null;
  data: unknown;
}

export interface ResponseStreamToolUse {
  index: number;
  id: string | null;
  name: string | null;
  inputJson: string;
}

export interface ResponseStreamPreview {
  stream: boolean;
  assistantText: string;
  thinkingText: string;
  toolUses: ResponseStreamToolUse[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
  events: ResponseStreamEvent[];
  rawText: string | null;
}

interface MutableToolUse extends ResponseStreamToolUse {
  inputParts: string[];
}

interface SseFrame {
  event: string | null;
  dataText: string;
}

export function parseResponsePreviewFromDetail(detail: RequestDetail): ResponseStreamPreview {
  const stored = detail.payload?.responseBodyJson;
  if (!stored) {
    return emptyPreview(null);
  }

  return parseResponseStream(parseStoredJson(stored));
}

export function parseResponseStream(value: unknown): ResponseStreamPreview {
  if (typeof value !== "string") {
    return emptyPreview(null);
  }

  const frames = parseSseFrames(value);
  if (!frames.length) {
    return emptyPreview(value);
  }

  let assistantText = "";
  let thinkingText = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  const events: ResponseStreamEvent[] = [];
  const tools = new Map<number, MutableToolUse>();

  for (const frame of frames) {
    const data = parseFrameData(frame.dataText);
    const type = valueAt(data, "type");
    events.push({
      event: frame.event,
      type: typeof type === "string" ? type : null,
      data
    });

    const usage = usageFromData(data);
    if (usage.inputTokens !== null) inputTokens = usage.inputTokens;
    if (usage.outputTokens !== null) outputTokens = usage.outputTokens;

    if (!isRecord(data)) continue;

    if (data.type === "content_block_start") {
      const index = numberOrNull(data.index);
      const block = data.content_block;
      if (index !== null && isRecord(block) && block.type === "tool_use") {
        tools.set(index, {
          index,
          id: stringOrNull(block.id),
          name: stringOrNull(block.name),
          inputJson: stringifyInput(block.input),
          inputParts: []
        });
      }
    }

    if (data.type === "content_block_delta" && isRecord(data.delta)) {
      const index = numberOrNull(data.index);
      const delta = data.delta;
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        assistantText += delta.text;
      }
      if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
        thinkingText += delta.thinking;
      }
      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string" && index !== null) {
        const tool = getOrCreateTool(tools, index);
        tool.inputParts.push(delta.partial_json);
        tool.inputJson = tool.inputParts.join("");
      }
    }
  }

  return {
    stream: true,
    assistantText,
    thinkingText,
    toolUses: [...tools.values()]
      .sort((a, b) => a.index - b.index)
      .map(({ inputParts: _inputParts, ...tool }) => tool),
    usage: { inputTokens, outputTokens },
    events,
    rawText: value
  };
}

function emptyPreview(rawText: string | null): ResponseStreamPreview {
  return {
    stream: false,
    assistantText: "",
    thinkingText: "",
    toolUses: [],
    usage: { inputTokens: null, outputTokens: null },
    events: [],
    rawText
  };
}

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseSseFrames(value: string): SseFrame[] {
  const frames: SseFrame[] = [];
  const normalized = value.replace(/\r\n/g, "\n");

  for (const chunk of normalized.split(/\n\n+/)) {
    const lines = chunk.split("\n");
    let event: string | null = null;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    if (event !== null || dataLines.length) {
      frames.push({ event, dataText: dataLines.join("\n") });
    }
  }

  return frames.filter((frame) => frame.dataText !== "[DONE]");
}

function parseFrameData(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function usageFromData(data: unknown): { inputTokens: number | null; outputTokens: number | null } {
  if (!isRecord(data)) return { inputTokens: null, outputTokens: null };

  const usage = isRecord(data.usage)
    ? data.usage
    : isRecord(data.message) && isRecord(data.message.usage)
      ? data.message.usage
      : null;

  if (!usage) return { inputTokens: null, outputTokens: null };
  return {
    inputTokens: numberOrNull(usage.input_tokens),
    outputTokens: numberOrNull(usage.output_tokens)
  };
}

function getOrCreateTool(tools: Map<number, MutableToolUse>, index: number): MutableToolUse {
  const existing = tools.get(index);
  if (existing) return existing;

  const tool: MutableToolUse = {
    index,
    id: null,
    name: null,
    inputJson: "",
    inputParts: []
  };
  tools.set(index, tool);
  return tool;
}

function stringifyInput(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function valueAt(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
