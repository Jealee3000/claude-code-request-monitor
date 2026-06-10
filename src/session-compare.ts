import { buildSystemPromptPreview } from "./system-prompt.js";
import { buildTurnDetail } from "./turn-detail.js";
import { buildTurnTimeline } from "./turn-timeline.js";
import type { RequestDetail, SessionRecord } from "./types.js";

export interface SessionCompareSide {
  sessionId: string;
  startedAt: string;
  projectPath: string;
  requestCount: number;
  turnCount: number;
  maxContextChars: number;
  toolNames: string[];
  suspectedSkillNames: string[];
}

export interface MatchedPromptCompare {
  prompt: string;
  currentRequestIds: number[];
  baselineRequestIds: number[];
  contextDelta: number;
  toolDiff: StringDiff;
  skillDiff: StringDiff;
  finalResponseChanged: boolean;
  currentFinalAssistantPreview: string | null;
  baselineFinalAssistantPreview: string | null;
}

export interface StringDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface SessionCompare {
  comparable: boolean;
  reason: string | null;
  headline: string;
  current: SessionCompareSide;
  baseline: SessionCompareSide | null;
  deltas: {
    requestCount: number;
    turnCount: number;
    contextChars: number;
    toolCount: number;
    suspectedSkillCount: number;
    matchedPromptCount: number;
  } | null;
  toolDiff: StringDiff;
  skillDiff: StringDiff;
  matchedPrompts: MatchedPromptCompare[];
  onlyCurrentPrompts: string[];
  onlyBaselinePrompts: string[];
}

interface SessionTurnSide {
  key: string;
  prompt: string | null;
  requestIds: number[];
  maxContextChars: number;
  toolNames: string[];
  suspectedSkillNames: string[];
  finalAssistantPreview: string | null;
}

export function buildSessionCompare(
  currentSession: SessionRecord,
  currentDetails: RequestDetail[],
  baselineSession: SessionRecord | null,
  baselineDetails: RequestDetail[]
): SessionCompare {
  const currentTurns = summarizeTurns(currentDetails);
  const current = summarizeSession(currentSession, currentDetails, currentTurns);

  if (!baselineSession) {
    return {
      comparable: false,
      reason: "No baseline session to compare",
      headline: "No baseline session available.",
      current,
      baseline: null,
      deltas: null,
      toolDiff: { added: [], removed: [], unchanged: [] },
      skillDiff: { added: [], removed: [], unchanged: [] },
      matchedPrompts: [],
      onlyCurrentPrompts: prompts(currentTurns),
      onlyBaselinePrompts: []
    };
  }

  const baselineTurns = summarizeTurns(baselineDetails);
  const baseline = summarizeSession(baselineSession, baselineDetails, baselineTurns);
  const matchedPrompts = compareMatchedPrompts(currentTurns, baselineTurns);
  const onlyCurrentPrompts = prompts(currentTurns.filter((turn) => !baselineTurns.some((item) => item.key === turn.key)));
  const onlyBaselinePrompts = prompts(baselineTurns.filter((turn) => !currentTurns.some((item) => item.key === turn.key)));
  const toolDiff = diffStrings(baseline.toolNames, current.toolNames);
  const skillDiff = diffStrings(baseline.suspectedSkillNames, current.suspectedSkillNames);
  const deltas = {
    requestCount: current.requestCount - baseline.requestCount,
    turnCount: current.turnCount - baseline.turnCount,
    contextChars: current.maxContextChars - baseline.maxContextChars,
    toolCount: current.toolNames.length - baseline.toolNames.length,
    suspectedSkillCount: current.suspectedSkillNames.length - baseline.suspectedSkillNames.length,
    matchedPromptCount: matchedPrompts.length
  };

  return {
    comparable: true,
    reason: null,
    headline: [
      `${formatDelta(deltas.turnCount)} turns`,
      `${formatDelta(deltas.contextChars)} context chars`,
      `${matchedPrompts.length} repeated prompt(s)`
    ].join(", "),
    current,
    baseline,
    deltas,
    toolDiff,
    skillDiff,
    matchedPrompts,
    onlyCurrentPrompts,
    onlyBaselinePrompts
  };
}

function summarizeSession(session: SessionRecord, details: RequestDetail[], turns: SessionTurnSide[]): SessionCompareSide {
  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    projectPath: session.projectPath,
    requestCount: details.length,
    turnCount: turns.length,
    maxContextChars: turns.reduce((max, turn) => Math.max(max, turn.maxContextChars), 0),
    toolNames: sortedUnique(turns.flatMap((turn) => turn.toolNames)),
    suspectedSkillNames: sortedUnique(turns.flatMap((turn) => turn.suspectedSkillNames))
  };
}

function summarizeTurns(details: RequestDetail[]): SessionTurnSide[] {
  return buildTurnTimeline(details)
    .map((turn) => {
      const selectedRequestId = turn.requestIds[turn.requestIds.length - 1];
      const detail = buildTurnDetail(details, selectedRequestId);
      if (!detail) {
        return null;
      }
      const lastRequestId = detail.requestIds[detail.requestIds.length - 1];
      const lastDetail = details.find((item) => item.id === lastRequestId);
      const system = lastDetail ? buildSystemPromptPreview(lastDetail) : null;
      return {
        key: detail.key,
        prompt: detail.latestUserText,
        requestIds: detail.requestIds,
        maxContextChars: Math.max(...detail.steps.map((step) => step.contextChars)),
        toolNames: sortedUnique(detail.steps.flatMap((step) => step.toolNames)),
        suspectedSkillNames: sortedUnique(system?.suspectedSkills.map((skill) => skill.name) ?? []),
        finalAssistantPreview: detail.finalAssistantText ? truncate(detail.finalAssistantText, 500) : null
      };
    })
    .filter((turn): turn is SessionTurnSide => turn !== null);
}

function compareMatchedPrompts(currentTurns: SessionTurnSide[], baselineTurns: SessionTurnSide[]): MatchedPromptCompare[] {
  const baselineByKey = new Map(baselineTurns.map((turn) => [turn.key, turn]));
  return currentTurns
    .map((current) => {
      const baseline = baselineByKey.get(current.key);
      if (!baseline || !current.prompt) {
        return null;
      }
      return {
        prompt: current.prompt,
        currentRequestIds: current.requestIds,
        baselineRequestIds: baseline.requestIds,
        contextDelta: current.maxContextChars - baseline.maxContextChars,
        toolDiff: diffStrings(baseline.toolNames, current.toolNames),
        skillDiff: diffStrings(baseline.suspectedSkillNames, current.suspectedSkillNames),
        finalResponseChanged: current.finalAssistantPreview !== baseline.finalAssistantPreview,
        currentFinalAssistantPreview: current.finalAssistantPreview,
        baselineFinalAssistantPreview: baseline.finalAssistantPreview
      };
    })
    .filter((item): item is MatchedPromptCompare => item !== null);
}

function prompts(turns: SessionTurnSide[]): string[] {
  return turns.map((turn) => turn.prompt).filter((prompt): prompt is string => Boolean(prompt));
}

function diffStrings(previous: string[], current: string[]): StringDiff {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  return {
    added: current.filter((value) => !previousSet.has(value)),
    removed: previous.filter((value) => !currentSet.has(value)),
    unchanged: current.filter((value) => previousSet.has(value))
  };
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}
