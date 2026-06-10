import { analyzeAgentRequest } from "./agent-analysis.js";
import type { RequestDetail } from "./types.js";

export type ContextWaterfallSegmentGroup = "primary" | "system_subsection" | "messages_subsection";

export interface ContextWaterfallSegment {
  id: string;
  label: string;
  group: ContextWaterfallSegmentGroup;
  parentId: string | null;
  chars: number;
  percent: number;
  deltaChars: number | null;
  itemCount: number;
  preview: string | null;
}

export interface ContextWaterfall {
  requestId: number;
  previousRequestId: number | null;
  reason: string | null;
  totalChars: number;
  previousTotalChars: number | null;
  totalDelta: number | null;
  summary: {
    model: string | null;
    messageCount: number;
    toolCount: number;
    toolUseCount: number;
    toolResultCount: number;
    suspectedSkillCount: number;
  };
  segments: ContextWaterfallSegment[];
}

interface SegmentDraft {
  id: string;
  label: string;
  group: ContextWaterfallSegmentGroup;
  parentId: string | null;
  chars: number;
  itemCount: number;
  preview: string | null;
}

interface WaterfallStats {
  totalChars: number;
  summary: ContextWaterfall["summary"];
  segments: SegmentDraft[];
}

export function buildContextWaterfall(previous: RequestDetail | undefined, current: RequestDetail): ContextWaterfall {
  const currentBody = parseRequestBody(current);
  const currentStats = buildStats(currentBody);

  if (!currentStats) {
    return {
      requestId: current.id,
      previousRequestId: previous?.id ?? null,
      reason: "No agent payload captured for this request",
      totalChars: 0,
      previousTotalChars: null,
      totalDelta: null,
      summary: {
        model: null,
        messageCount: 0,
        toolCount: 0,
        toolUseCount: 0,
        toolResultCount: 0,
        suspectedSkillCount: 0
      },
      segments: []
    };
  }

  const previousStats = previous ? buildStats(parseRequestBody(previous)) : null;
  const previousSegments = new Map((previousStats?.segments ?? []).map((segment) => [segment.id, segment]));

  return {
    requestId: current.id,
    previousRequestId: previousStats ? previous?.id ?? null : null,
    reason: null,
    totalChars: currentStats.totalChars,
    previousTotalChars: previousStats?.totalChars ?? null,
    totalDelta: previousStats ? currentStats.totalChars - previousStats.totalChars : null,
    summary: currentStats.summary,
    segments: currentStats.segments.map((segment) => {
      const previousSegment = previousSegments.get(segment.id);
      return {
        ...segment,
        percent: percentOf(segment.chars, currentStats.totalChars),
        deltaChars: previousSegment ? segment.chars - previousSegment.chars : null
      };
    })
  };
}

function buildStats(body: unknown): WaterfallStats | null {
  const summary = analyzeAgentRequest(body);
  if (!summary || !isRecord(body)) {
    return null;
  }

  const systemBlocks = normalizeSystemBlocks(body.system);
  const systemText = systemBlocks.map((block) => block.text).join("\n\n");
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const skills = extractSuspectedSkillBlocks(systemText);
  const toolResults = toolResultBlocks(messages);
  const latestUserInput = latestUserPrompt(messages);
  const assistantMessages = messages.filter(
    (message): message is Record<string, unknown> => isRecord(message) && message.role === "assistant"
  );

  const systemChars = contentChars(body.system);
  const toolsChars = JSON.stringify(tools).length;
  const messagesChars = contentChars(messages);
  const totalChars = systemChars + toolsChars + messagesChars;

  return {
    totalChars,
    summary: {
      model: summary.model,
      messageCount: summary.messageCount,
      toolCount: summary.toolCount,
      toolUseCount: summary.toolUseCount,
      toolResultCount: summary.toolResultCount,
      suspectedSkillCount: skills.length
    },
    segments: [
      {
        id: "system",
        label: "System",
        group: "primary",
        parentId: null,
        chars: systemChars,
        itemCount: systemBlocks.length,
        preview: truncate(systemText, 360)
      },
      {
        id: "tools_schema",
        label: "Tools Schema",
        group: "primary",
        parentId: null,
        chars: toolsChars,
        itemCount: tools.length,
        preview: truncate(tools.map((tool) => toolName(tool)).join(", "), 360)
      },
      {
        id: "messages",
        label: "Messages",
        group: "primary",
        parentId: null,
        chars: messagesChars,
        itemCount: messages.length,
        preview: truncate(messageRoleSummary(messages), 360)
      },
      {
        id: "skills",
        label: "Skills",
        group: "system_subsection",
        parentId: "system",
        chars: skills.reduce((sum, skill) => sum + skill.chars, 0),
        itemCount: skills.length,
        preview: truncate(skills.map((skill) => skill.name).join(", "), 360)
      },
      {
        id: "tool_results",
        label: "Tool Results",
        group: "messages_subsection",
        parentId: "messages",
        chars: sumContentChars(toolResults),
        itemCount: toolResults.length,
        preview: truncate(toolResults.map((block) => contentText(block)).filter(Boolean).join("\n\n"), 360)
      },
      {
        id: "latest_user_input",
        label: "Latest User Input",
        group: "messages_subsection",
        parentId: "messages",
        chars: latestUserInput ? contentChars(latestUserInput.content) : 0,
        itemCount: latestUserInput ? 1 : 0,
        preview: latestUserInput ? truncate(contentText(latestUserInput.content), 360) : null
      },
      {
        id: "assistant_history",
        label: "Assistant History",
        group: "messages_subsection",
        parentId: "messages",
        chars: sumContentChars(assistantMessages.map((message) => message.content)),
        itemCount: assistantMessages.length,
        preview: truncate(assistantMessages.map((message) => contentText(message.content)).filter(Boolean).join("\n\n"), 360)
      }
    ]
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

function normalizeSystemBlocks(value: unknown): Array<{ type: string; text: string }> {
  if (typeof value === "string") {
    return [{ type: "text", text: value }];
  }
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((block): { type: string; text: string } | null => {
      if (typeof block === "string") {
        return { type: "text", text: block };
      }
      if (!isRecord(block)) {
        return null;
      }
      const text = contentText(block);
      if (!text) {
        return null;
      }
      return {
        type: typeof block.type === "string" ? block.type : "text",
        text
      };
    })
    .filter((block): block is { type: string; text: string } => block !== null);
}

function extractSuspectedSkillBlocks(text: string): Array<{ name: string; chars: number }> {
  const skills: Array<{ name: string; chars: number }> = [];
  const pattern = /(?:^|\n)name:\s*([^\n]+)\n(?:[\s\S]{0,1200}?)description:\s*([^\n]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    skills.push({
      name: match[1].trim(),
      chars: pattern.lastIndex - match.index
    });
  }

  return skills;
}

function toolResultBlocks(messages: unknown[]): unknown[] {
  const blocks: unknown[] = [];
  for (const message of messages) {
    if (!isRecord(message)) {
      continue;
    }
    const contentBlocks = Array.isArray(message.content) ? message.content : [message.content];
    blocks.push(...contentBlocks.filter((block) => isRecord(block) && block.type === "tool_result"));
  }
  return blocks;
}

function latestUserPrompt(messages: unknown[]): { content: unknown } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message) || message.role !== "user") {
      continue;
    }
    const contentBlocks = Array.isArray(message.content) ? message.content : [message.content];
    const onlyToolResults = contentBlocks.length > 0 && contentBlocks.every((block) => isRecord(block) && block.type === "tool_result");
    if (!onlyToolResults) {
      return { content: message.content };
    }
  }
  return null;
}

function contentChars(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length;
  }
  return JSON.stringify(value).length;
}

function sumContentChars(values: unknown[]): number {
  let chars = 0;
  for (const value of values) {
    chars += contentChars(value);
  }
  return chars;
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
    if (typeof value.content === "string") {
      return value.content;
    }
    if (value.content !== undefined) {
      return contentText(value.content);
    }
  }
  return "";
}

function messageRoleSummary(messages: unknown[]): string {
  return messages
    .map((message, index) => {
      const role = isRecord(message) && typeof message.role === "string" ? message.role : "unknown";
      return `${index + 1}. ${role}`;
    })
    .join(", ");
}

function toolName(tool: unknown): string {
  return isRecord(tool) && typeof tool.name === "string" ? tool.name : "unnamed";
}

function percentOf(chars: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((chars / total) * 1000) / 10;
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
