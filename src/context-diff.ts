import { extractAgentPayload } from "./agent-payload.js";
import type { RequestDetail } from "./types.js";

export interface ContextDiff {
  comparable: boolean;
  reason: string | null;
  previousRequestId: number | null;
  currentRequestId: number;
  deltas: {
    messageCount: number;
    estimatedContextChars: number;
    systemChars: number;
    toolCount: number;
    toolUseCount: number;
    toolResultCount: number;
  } | null;
  tools: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  latestUserTextChanged: boolean;
  previousLatestUserText: string | null;
  currentLatestUserText: string | null;
}

export function buildContextDiff(previous: RequestDetail | undefined, current: RequestDetail): ContextDiff {
  if (!previous) {
    return emptyDiff("No previous request in this session", current.id);
  }

  const previousPayload = extractAgentPayload(previous);
  const currentPayload = extractAgentPayload(current);
  if (!previousPayload || !currentPayload) {
    return emptyDiff("Previous or current request has no agent payload", current.id, previous.id);
  }

  const previousTools = new Set(previousPayload.toolNames);
  const currentTools = new Set(currentPayload.toolNames);

  return {
    comparable: true,
    reason: null,
    previousRequestId: previous.id,
    currentRequestId: current.id,
    deltas: {
      messageCount: currentPayload.messageCount - previousPayload.messageCount,
      estimatedContextChars: currentPayload.estimatedContextChars - previousPayload.estimatedContextChars,
      systemChars: currentPayload.systemChars - previousPayload.systemChars,
      toolCount: currentPayload.toolCount - previousPayload.toolCount,
      toolUseCount: currentPayload.toolUseCount - previousPayload.toolUseCount,
      toolResultCount: currentPayload.toolResultCount - previousPayload.toolResultCount
    },
    tools: {
      added: currentPayload.toolNames.filter((tool) => !previousTools.has(tool)),
      removed: previousPayload.toolNames.filter((tool) => !currentTools.has(tool)),
      unchanged: currentPayload.toolNames.filter((tool) => previousTools.has(tool))
    },
    latestUserTextChanged: previousPayload.latestUserText !== currentPayload.latestUserText,
    previousLatestUserText: previousPayload.latestUserText,
    currentLatestUserText: currentPayload.latestUserText
  };
}

function emptyDiff(reason: string, currentRequestId: number, previousRequestId: number | null = null): ContextDiff {
  return {
    comparable: false,
    reason,
    previousRequestId,
    currentRequestId,
    deltas: null,
    tools: { added: [], removed: [], unchanged: [] },
    latestUserTextChanged: false,
    previousLatestUserText: null,
    currentLatestUserText: null
  };
}
