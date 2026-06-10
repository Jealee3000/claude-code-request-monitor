import { extractAgentPayload, type ExtractedAgentPayload } from "./agent-payload.js";
import { buildSystemPromptPreview } from "./system-prompt.js";
import { buildTurnDetail, type TurnDetail } from "./turn-detail.js";
import type { RequestDetail } from "./types.js";

export interface TurnCompareSide {
  key: string;
  requestIds: number[];
  requestCount: number;
  latestUserText: string | null;
  firstRequestAt: string;
  lastRequestAt: string;
  model: string | null;
  maxContextChars: number;
  systemChars: number;
  toolSchemaChars: number;
  toolNames: string[];
  suspectedSkillNames: string[];
  toolUseCount: number;
  toolResultCount: number;
  finalAssistantPreview: string | null;
}

export interface TurnCompare {
  comparable: boolean;
  reason: string | null;
  headline: string;
  current: TurnCompareSide;
  baseline: TurnCompareSide | null;
  deltas: {
    requestCount: number;
    contextChars: number;
    systemChars: number;
    toolSchemaChars: number;
    toolCount: number;
    suspectedSkillCount: number;
    toolUseCount: number;
    toolResultCount: number;
  } | null;
  toolDiff: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  skillDiff: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  finalResponseChanged: boolean | null;
}

export function buildTurnCompare(
  details: RequestDetail[],
  selectedRequestId: number,
  baselineRequestId?: number | null
): TurnCompare | null {
  const current = buildTurnDetail(details, selectedRequestId);
  if (!current) {
    return null;
  }

  const baseline = baselineRequestId
    ? buildTurnDetail(details, baselineRequestId)
    : buildPreviousTurnDetail(details, current);
  const currentSide = summarizeTurn(details, current);

  if (!baseline) {
    return {
      comparable: false,
      reason: "No previous agent turn to compare",
      headline: "No baseline turn available.",
      current: currentSide,
      baseline: null,
      deltas: null,
      toolDiff: { added: [], removed: [], unchanged: [] },
      skillDiff: { added: [], removed: [], unchanged: [] },
      finalResponseChanged: null
    };
  }

  const baselineSide = summarizeTurn(details, baseline);
  const toolDiff = diffStrings(baselineSide.toolNames, currentSide.toolNames);
  const skillDiff = diffStrings(baselineSide.suspectedSkillNames, currentSide.suspectedSkillNames);
  const deltas = {
    requestCount: currentSide.requestCount - baselineSide.requestCount,
    contextChars: currentSide.maxContextChars - baselineSide.maxContextChars,
    systemChars: currentSide.systemChars - baselineSide.systemChars,
    toolSchemaChars: currentSide.toolSchemaChars - baselineSide.toolSchemaChars,
    toolCount: currentSide.toolNames.length - baselineSide.toolNames.length,
    suspectedSkillCount: currentSide.suspectedSkillNames.length - baselineSide.suspectedSkillNames.length,
    toolUseCount: currentSide.toolUseCount - baselineSide.toolUseCount,
    toolResultCount: currentSide.toolResultCount - baselineSide.toolResultCount
  };

  return {
    comparable: true,
    reason: null,
    headline: buildHeadline(deltas.toolCount, deltas.contextChars, skillDiff.added.length, skillDiff.removed.length),
    current: currentSide,
    baseline: baselineSide,
    deltas,
    toolDiff,
    skillDiff,
    finalResponseChanged: currentSide.finalAssistantPreview !== baselineSide.finalAssistantPreview
  };
}

function buildPreviousTurnDetail(details: RequestDetail[], current: TurnDetail): TurnDetail | null {
  const currentFirst = current.firstRequestAt;
  const candidates = distinctTurnRepresentatives(details)
    .filter((item) => item.key !== current.key && item.startedAt < currentFirst)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));

  const previous = candidates[0];
  return previous ? buildTurnDetail(details, previous.requestId) : null;
}

function distinctTurnRepresentatives(details: RequestDetail[]): Array<{ key: string; requestId: number; startedAt: string }> {
  const reps = new Map<string, { key: string; requestId: number; startedAt: string }>();

  for (const detail of details) {
    const payload = extractAgentPayload(detail);
    if (!payload) {
      continue;
    }
    const key = turnKey(detail, payload);
    const existing = reps.get(key);
    if (!existing || detail.startedAt < existing.startedAt) {
      reps.set(key, { key, requestId: detail.id, startedAt: detail.startedAt });
    }
  }

  return [...reps.values()];
}

function summarizeTurn(details: RequestDetail[], turn: TurnDetail): TurnCompareSide {
  const detailById = new Map(details.map((detail) => [detail.id, detail]));
  const lastStep = turn.steps[turn.steps.length - 1];
  const lastDetail = detailById.get(lastStep.requestId);
  const system = lastDetail ? buildSystemPromptPreview(lastDetail) : null;
  const toolNames = [...new Set(turn.steps.flatMap((step) => step.toolNames))];

  return {
    key: turn.key,
    requestIds: turn.requestIds,
    requestCount: turn.requestCount,
    latestUserText: turn.latestUserText,
    firstRequestAt: turn.firstRequestAt,
    lastRequestAt: turn.lastRequestAt,
    model: lastStep.model,
    maxContextChars: Math.max(...turn.steps.map((step) => step.contextChars)),
    systemChars: system?.systemChars ?? lastStep.systemChars,
    toolSchemaChars: lastStep.toolSchemaChars,
    toolNames,
    suspectedSkillNames: system?.suspectedSkills.map((skill) => skill.name) ?? [],
    toolUseCount: turn.toolUses.length,
    toolResultCount: turn.toolLoops.length,
    finalAssistantPreview: turn.finalAssistantText ? truncate(turn.finalAssistantText, 500) : null
  };
}

function diffStrings(previous: string[], current: string[]): { added: string[]; removed: string[]; unchanged: string[] } {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  return {
    added: current.filter((value) => !previousSet.has(value)),
    removed: previous.filter((value) => !currentSet.has(value)),
    unchanged: current.filter((value) => previousSet.has(value))
  };
}

function buildHeadline(toolDelta: number, contextDelta: number, skillsAdded: number, skillsRemoved: number): string {
  return [
    `${formatDelta(toolDelta)} tools`,
    `${formatDelta(contextDelta)} context chars`,
    `${formatDelta(skillsAdded - skillsRemoved)} skills`
  ].join(", ");
}

function turnKey(detail: RequestDetail, payload: ExtractedAgentPayload): string {
  return payload.latestUserText ? `user:${payload.latestUserText}` : `request:${detail.id}`;
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}
