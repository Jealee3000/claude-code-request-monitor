import { buildSystemPromptPreview } from "./system-prompt.js";
import { buildTurnDetail } from "./turn-detail.js";
import type { RequestDetail } from "./types.js";

export type TurnReplayEventKind =
  | "user_prompt"
  | "request_context"
  | "tool_result"
  | "assistant_response"
  | "tool_use";

export interface TurnReplayEvent {
  kind: TurnReplayEventKind;
  title: string;
  requestId: number | null;
  stepIndex: number | null;
  summary: string;
  preview: string | null;
  contextChars: number | null;
  contextDelta: number | null;
  systemChars: number | null;
  toolSchemaChars: number | null;
  toolCount: number | null;
  suspectedSkillCount: number | null;
  inputJson?: string;
  resultChars?: number;
  isError?: boolean;
}

export interface TurnReplay {
  key: string;
  latestUserText: string | null;
  requestIds: number[];
  requestCount: number;
  summary: {
    toolUseCount: number;
    toolResultCount: number;
    finalAssistantPreview: string | null;
  };
  events: TurnReplayEvent[];
}

export function buildTurnReplay(details: RequestDetail[], selectedRequestId: number): TurnReplay | null {
  const turn = buildTurnDetail(details, selectedRequestId);
  if (!turn) {
    return null;
  }

  const detailById = new Map(details.map((detail) => [detail.id, detail]));
  const events: TurnReplayEvent[] = [
    {
      kind: "user_prompt",
      title: "User prompt",
      requestId: null,
      stepIndex: null,
      summary: "The user message that anchors this turn.",
      preview: turn.latestUserText,
      contextChars: null,
      contextDelta: null,
      systemChars: null,
      toolSchemaChars: null,
      toolCount: null,
      suspectedSkillCount: null
    }
  ];

  for (const step of turn.steps) {
    const detail = detailById.get(step.requestId);
    const system = detail ? buildSystemPromptPreview(detail) : null;
    events.push({
      kind: "request_context",
      title: `Request ${step.stepIndex} context assembled`,
      requestId: step.requestId,
      stepIndex: step.stepIndex,
      summary: `Messages: ${step.messageCount}; tools: ${step.toolNames.length}; context chars: ${step.contextChars}.`,
      preview: step.toolNames.join(", ") || null,
      contextChars: step.contextChars,
      contextDelta: step.contextDelta,
      systemChars: step.systemChars,
      toolSchemaChars: step.toolSchemaChars,
      toolCount: system?.toolCount ?? step.toolNames.length,
      suspectedSkillCount: system?.suspectedSkillCount ?? null
    });

    for (const loop of turn.toolLoops.filter((item) => item.resultRequestId === step.requestId)) {
      events.push({
        kind: "tool_result",
        title: `Tool result returned: ${loop.name ?? "unknown tool"}`,
        requestId: step.requestId,
        stepIndex: step.stepIndex,
        summary: `Result from request ${loop.toolUseRequestId} was included in this request.`,
        preview: loop.resultPreview,
        contextChars: step.contextChars,
        contextDelta: loop.contextDeltaAfterResult,
        systemChars: step.systemChars,
        toolSchemaChars: step.toolSchemaChars,
        toolCount: system?.toolCount ?? step.toolNames.length,
        suspectedSkillCount: system?.suspectedSkillCount ?? null,
        resultChars: loop.resultChars,
        isError: loop.isError
      });
    }

    if (step.responseAssistantText) {
      events.push({
        kind: "assistant_response",
        title: "Assistant response text",
        requestId: step.requestId,
        stepIndex: step.stepIndex,
        summary: "Text emitted by Claude in the response stream.",
        preview: truncate(step.responseAssistantText, 500),
        contextChars: step.contextChars,
        contextDelta: step.contextDelta,
        systemChars: step.systemChars,
        toolSchemaChars: step.toolSchemaChars,
        toolCount: system?.toolCount ?? step.toolNames.length,
        suspectedSkillCount: system?.suspectedSkillCount ?? null
      });
    }

    for (const toolUse of turn.toolUses.filter((item) => item.requestId === step.requestId)) {
      events.push({
        kind: "tool_use",
        title: `Tool requested: ${toolUse.name ?? "unknown tool"}`,
        requestId: step.requestId,
        stepIndex: step.stepIndex,
        summary: "Claude requested a tool call in this response.",
        preview: toolUse.inputJson || null,
        contextChars: step.contextChars,
        contextDelta: step.contextDelta,
        systemChars: step.systemChars,
        toolSchemaChars: step.toolSchemaChars,
        toolCount: system?.toolCount ?? step.toolNames.length,
        suspectedSkillCount: system?.suspectedSkillCount ?? null,
        inputJson: toolUse.inputJson
      });
    }
  }

  return {
    key: turn.key,
    latestUserText: turn.latestUserText,
    requestIds: turn.requestIds,
    requestCount: turn.requestCount,
    summary: {
      toolUseCount: turn.toolUses.length,
      toolResultCount: turn.toolLoops.length,
      finalAssistantPreview: turn.finalAssistantText ? truncate(turn.finalAssistantText, 500) : null
    },
    events
  };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}
