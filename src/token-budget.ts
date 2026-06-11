import { analyzeAgentRequest } from "./agent-analysis.js";
import { buildContextWaterfall, type ContextWaterfallSegmentGroup } from "./context-waterfall.js";
import { buildTurnDetail } from "./turn-detail.js";
import type { RequestDetail } from "./types.js";

export interface TokenBudgetSection {
  id: string;
  label: string;
  group: ContextWaterfallSegmentGroup;
  parentId: string | null;
  chars: number;
  estimatedTokens: number;
  percent: number;
  deltaChars: number | null;
  deltaTokens: number | null;
  itemCount: number;
  preview: string | null;
}

export interface TokenBudgetCurvePoint {
  requestId: number;
  stepIndex: number;
  startedAt: string;
  contextChars: number;
  estimatedContextTokens: number;
  contextDeltaChars: number | null;
  contextDeltaTokens: number | null;
  systemTokens: number;
  toolSchemaTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface TokenBudget {
  requestId: number;
  previousRequestId: number | null;
  reason: string | null;
  latestUserText: string | null;
  requestCount: number;
  model: string | null;
  maxTokens: number | null;
  thinkingBudgetTokens: number | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
  summary: {
    contextChars: number;
    estimatedContextTokens: number;
    contextDeltaChars: number | null;
    contextDeltaTokens: number | null;
    toolSchemaTokens: number;
    toolSchemaPercent: number;
    messagesTokens: number;
    messagesPercent: number;
    systemTokens: number;
    systemPercent: number;
    capturedTurnOutputTokens: number;
  };
  sections: TokenBudgetSection[];
  curve: TokenBudgetCurvePoint[];
}

export function buildTokenBudget(details: RequestDetail[], selectedRequestId: number): TokenBudget {
  const ordered = [...details].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id - right.id);
  const currentIndex = ordered.findIndex((detail) => detail.id === selectedRequestId);
  const current = currentIndex >= 0 ? ordered[currentIndex] : undefined;
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;

  if (!current) {
    return emptyBudget(selectedRequestId, null, "Request not found");
  }

  const body = parseRequestBody(current);
  const agent = analyzeAgentRequest(body);
  if (!agent) {
    return emptyBudget(current.id, previous?.id ?? null, "No agent payload captured for this request");
  }

  const waterfall = buildContextWaterfall(previous, current);
  const turn = buildTurnDetail(ordered, selectedRequestId);
  const selectedStep = turn?.steps.find((step) => step.requestId === selectedRequestId) ?? null;
  const sectionById = new Map(waterfall.segments.map((segment) => [segment.id, segment]));
  const toolsSection = sectionById.get("tools_schema");
  const messagesSection = sectionById.get("messages");
  const systemSection = sectionById.get("system");

  return {
    requestId: current.id,
    previousRequestId: waterfall.previousRequestId,
    reason: waterfall.reason,
    latestUserText: turn?.latestUserText ?? null,
    requestCount: turn?.requestCount ?? 1,
    model: agent.model,
    maxTokens: agent.maxTokens,
    thinkingBudgetTokens: thinkingBudgetTokens(body),
    usage: {
      inputTokens: selectedStep?.responseUsage.inputTokens ?? null,
      outputTokens: selectedStep?.responseUsage.outputTokens ?? null
    },
    summary: {
      contextChars: waterfall.totalChars,
      estimatedContextTokens: estimateTokens(waterfall.totalChars),
      contextDeltaChars: waterfall.totalDelta,
      contextDeltaTokens: estimateDeltaTokens(waterfall.totalDelta),
      toolSchemaTokens: estimateTokens(toolsSection?.chars ?? agent.toolSchemaChars),
      toolSchemaPercent: toolsSection?.percent ?? percentOf(agent.toolSchemaChars, waterfall.totalChars),
      messagesTokens: estimateTokens(messagesSection?.chars ?? 0),
      messagesPercent: messagesSection?.percent ?? 0,
      systemTokens: estimateTokens(systemSection?.chars ?? agent.systemChars),
      systemPercent: systemSection?.percent ?? percentOf(agent.systemChars, waterfall.totalChars),
      capturedTurnOutputTokens: sumKnown((turn?.steps ?? []).map((step) => step.responseUsage.outputTokens))
    },
    sections: waterfall.segments.map((segment) => ({
      ...segment,
      estimatedTokens: estimateTokens(segment.chars),
      deltaTokens: estimateDeltaTokens(segment.deltaChars)
    })),
    curve: (turn?.steps ?? []).map((step) => ({
      requestId: step.requestId,
      stepIndex: step.stepIndex,
      startedAt: step.startedAt,
      contextChars: step.contextChars,
      estimatedContextTokens: estimateTokens(step.contextChars),
      contextDeltaChars: step.contextDelta,
      contextDeltaTokens: estimateDeltaTokens(step.contextDelta),
      systemTokens: estimateTokens(step.systemChars),
      toolSchemaTokens: estimateTokens(step.toolSchemaChars),
      inputTokens: step.responseUsage.inputTokens,
      outputTokens: step.responseUsage.outputTokens
    }))
  };
}

export function estimateTokens(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) {
    return 0;
  }
  return Math.ceil(chars / 4);
}

function emptyBudget(requestId: number, previousRequestId: number | null, reason: string): TokenBudget {
  return {
    requestId,
    previousRequestId,
    reason,
    latestUserText: null,
    requestCount: 0,
    model: null,
    maxTokens: null,
    thinkingBudgetTokens: null,
    usage: {
      inputTokens: null,
      outputTokens: null
    },
    summary: {
      contextChars: 0,
      estimatedContextTokens: 0,
      contextDeltaChars: null,
      contextDeltaTokens: null,
      toolSchemaTokens: 0,
      toolSchemaPercent: 0,
      messagesTokens: 0,
      messagesPercent: 0,
      systemTokens: 0,
      systemPercent: 0,
      capturedTurnOutputTokens: 0
    },
    sections: [],
    curve: []
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

function thinkingBudgetTokens(value: unknown): number | null {
  if (!isRecord(value) || !isRecord(value.thinking)) {
    return null;
  }
  const budget = value.thinking.budget_tokens;
  return typeof budget === "number" && Number.isFinite(budget) ? budget : null;
}

function estimateDeltaTokens(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  const sign = value < 0 ? -1 : 1;
  return sign * estimateTokens(Math.abs(value));
}

function sumKnown(values: Array<number | null>): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function percentOf(chars: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((chars / total) * 1000) / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
