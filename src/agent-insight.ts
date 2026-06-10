import { buildSystemPromptPreview } from "./system-prompt.js";
import { buildTurnDetail } from "./turn-detail.js";
import type { RequestDetail } from "./types.js";

export type AgentInsightKind = "context" | "tool_loop" | "skills" | "tools" | "response" | "risk";
export type AgentInsightSeverity = "info" | "warning" | "error";

export interface AgentInsightItem {
  kind: AgentInsightKind;
  severity: AgentInsightSeverity;
  title: string;
  detail: string;
  requestId: number | null;
  values: Record<string, string | number | boolean | null>;
}

export interface AgentInsight {
  key: string;
  latestUserText: string | null;
  requestIds: number[];
  requestCount: number;
  headline: string;
  metrics: {
    model: string | null;
    maxContextChars: number;
    totalContextDelta: number;
    systemChars: number;
    toolSchemaChars: number;
    toolCount: number;
    suspectedSkillCount: number;
    toolUseCount: number;
    toolResultCount: number;
    finalAssistantPreview: string | null;
  };
  insights: AgentInsightItem[];
}

export function buildAgentInsight(details: RequestDetail[], selectedRequestId: number): AgentInsight | null {
  const turn = buildTurnDetail(details, selectedRequestId);
  if (!turn) {
    return null;
  }

  const detailById = new Map(details.map((detail) => [detail.id, detail]));
  const firstStep = turn.steps[0];
  const lastStep = turn.steps[turn.steps.length - 1];
  if (!firstStep || !lastStep) {
    return null;
  }

  const lastDetail = detailById.get(lastStep.requestId);
  const system = lastDetail ? buildSystemPromptPreview(lastDetail) : null;
  const totalContextDelta = Math.max(0, lastStep.contextChars - firstStep.contextChars);
  const maxContextChars = Math.max(...turn.steps.map((step) => step.contextChars));
  const toolNames = [...new Set(lastStep.toolNames)];
  const skillNames = system?.suspectedSkills.map((skill) => skill.name) ?? [];
  const insights: AgentInsightItem[] = [];

  insights.push({
    kind: "context",
    severity: totalContextDelta > 80_000 ? "warning" : "info",
    title: totalContextDelta > 0 ? "Context grew across the turn" : "Context stayed stable across the turn",
    detail: `${turn.requestCount} request(s) carried the same user turn. The last request contained ${lastStep.messageCount} message(s), ${lastStep.contextChars} estimated context chars, and ${formatDelta(totalContextDelta)} chars versus the first request.`,
    requestId: lastStep.requestId,
    values: {
      firstRequestId: firstStep.requestId,
      lastRequestId: lastStep.requestId,
      firstContextChars: firstStep.contextChars,
      lastContextChars: lastStep.contextChars,
      totalContextDelta
    }
  });

  if (turn.toolLoops.length) {
    const names = [...new Set(turn.toolLoops.map((loop) => loop.name ?? "unknown tool"))];
    const totalResultChars = turn.toolLoops.reduce((total, loop) => total + loop.resultChars, 0);
    const errored = turn.toolLoops.filter((loop) => loop.isError).length;
    insights.push({
      kind: "tool_loop",
      severity: errored > 0 ? "warning" : "info",
      title: "Tool result was fed back into context",
      detail: `${turn.toolLoops.length} tool result(s) were included in later requests: ${names.join(", ")}. Result previews contributed ${totalResultChars} captured chars${errored ? ` with ${errored} error result(s)` : ""}.`,
      requestId: turn.toolLoops[turn.toolLoops.length - 1].resultRequestId,
      values: {
        toolLoopCount: turn.toolLoops.length,
        totalResultChars,
        erroredResults: errored
      }
    });
  } else if (turn.toolUses.length) {
    insights.push({
      kind: "risk",
      severity: "warning",
      title: "Tool request has no captured result yet",
      detail: `${turn.toolUses.length} tool use(s) were emitted, but no matching tool_result block was captured in this turn.`,
      requestId: turn.toolUses[turn.toolUses.length - 1].requestId,
      values: { toolUseCount: turn.toolUses.length }
    });
  }

  if (skillNames.length) {
    insights.push({
      kind: "skills",
      severity: "info",
      title: "System prompt included suspected skills",
      detail: `${skillNames.length} suspected skill(s) were present in the latest request: ${skillNames.slice(0, 6).join(", ")}${skillNames.length > 6 ? ", ..." : ""}.`,
      requestId: lastStep.requestId,
      values: {
        suspectedSkillCount: skillNames.length,
        systemChars: system?.systemChars ?? lastStep.systemChars
      }
    });
  }

  insights.push({
    kind: "tools",
    severity: toolNames.length > 40 ? "warning" : "info",
    title: "Tool inventory available to the model",
    detail: `${toolNames.length} tool(s) were available in the latest request: ${toolNames.slice(0, 8).join(", ") || "none"}${toolNames.length > 8 ? ", ..." : ""}. Tool schemas occupied ${lastStep.toolSchemaChars} chars.`,
    requestId: lastStep.requestId,
    values: {
      toolCount: toolNames.length,
      toolSchemaChars: lastStep.toolSchemaChars
    }
  });

  if (turn.finalAssistantText) {
    insights.push({
      kind: "response",
      severity: "info",
      title: "Final assistant response captured",
      detail: truncate(turn.finalAssistantText, 240),
      requestId: lastStep.requestId,
      values: {
        responseChars: turn.finalAssistantText.length
      }
    });
  }

  return {
    key: turn.key,
    latestUserText: turn.latestUserText,
    requestIds: turn.requestIds,
    requestCount: turn.requestCount,
    headline: buildHeadline(turn.requestCount, turn.toolUses.length, turn.toolLoops.length, toolNames),
    metrics: {
      model: lastStep.model,
      maxContextChars,
      totalContextDelta,
      systemChars: system?.systemChars ?? lastStep.systemChars,
      toolSchemaChars: lastStep.toolSchemaChars,
      toolCount: toolNames.length,
      suspectedSkillCount: skillNames.length,
      toolUseCount: turn.toolUses.length,
      toolResultCount: turn.toolLoops.length,
      finalAssistantPreview: turn.finalAssistantText ? truncate(turn.finalAssistantText, 500) : null
    },
    insights
  };
}

function buildHeadline(requestCount: number, toolUseCount: number, toolResultCount: number, toolNames: string[]): string {
  const toolSummary = toolNames.length ? ` with ${toolNames.slice(0, 3).join(", ")} available` : "";
  return `${requestCount} requests, ${toolUseCount} tool use(s), ${toolResultCount} tool result(s)${toolSummary}.`;
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}
