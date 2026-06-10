import { buildTurnDetail } from "./turn-detail.js";
import type { RequestDetail } from "./types.js";

export type ToolGraphNodeKind =
  | "user_prompt"
  | "request_context"
  | "assistant_response"
  | "tool_use"
  | "tool_result";

export type ToolGraphEdgeRelation =
  | "anchors"
  | "produces_response"
  | "requests_tool"
  | "returns_result"
  | "fed_into_context";

export interface ToolGraphNode {
  id: string;
  kind: ToolGraphNodeKind;
  label: string;
  requestId: number | null;
  stepIndex: number | null;
  toolName: string | null;
  summary: string;
  preview: string | null;
  contextChars: number | null;
  contextDelta: number | null;
}

export interface ToolGraphEdge {
  from: string;
  to: string;
  relation: ToolGraphEdgeRelation;
  label: string;
}

export interface ToolGraph {
  key: string;
  latestUserText: string | null;
  requestIds: number[];
  summary: {
    requestCount: number;
    toolUseCount: number;
    toolResultCount: number;
    nodeCount: number;
    edgeCount: number;
  };
  nodes: ToolGraphNode[];
  edges: ToolGraphEdge[];
}

export function buildToolGraph(details: RequestDetail[], selectedRequestId: number): ToolGraph | null {
  const turn = buildTurnDetail(details, selectedRequestId);
  if (!turn) {
    return null;
  }

  const nodes = new Map<string, ToolGraphNode>();
  const edges: ToolGraphEdge[] = [];

  addNode(nodes, {
    id: "prompt",
    kind: "user_prompt",
    label: "User prompt",
    requestId: null,
    stepIndex: null,
    toolName: null,
    summary: "The user message that anchors this agent turn.",
    preview: turn.latestUserText,
    contextChars: null,
    contextDelta: null
  });

  for (const step of turn.steps) {
    addNode(nodes, {
      id: requestNodeId(step.requestId),
      kind: "request_context",
      label: `Request ${step.stepIndex} context`,
      requestId: step.requestId,
      stepIndex: step.stepIndex,
      toolName: null,
      summary: `Context assembled with ${step.messageCount} message(s), ${step.toolNames.length} tool schema(s), and ${step.contextChars} estimated chars.`,
      preview: step.toolNames.join(", ") || null,
      contextChars: step.contextChars,
      contextDelta: step.contextDelta
    });

    addNode(nodes, {
      id: assistantNodeId(step.requestId),
      kind: "assistant_response",
      label: `Assistant response ${step.stepIndex}`,
      requestId: step.requestId,
      stepIndex: step.stepIndex,
      toolName: null,
      summary: `Response emitted ${step.responseToolUseCount} tool request(s).`,
      preview: truncate(step.responseAssistantText, 500),
      contextChars: step.contextChars,
      contextDelta: step.contextDelta
    });
  }

  for (const toolUse of turn.toolUses) {
    const step = turn.steps.find((item) => item.requestId === toolUse.requestId);
    addNode(nodes, {
      id: toolUseNodeId(toolUse.id, toolUse.requestId),
      kind: "tool_use",
      label: `Tool use: ${toolUse.name ?? "unknown tool"}`,
      requestId: toolUse.requestId,
      stepIndex: step?.stepIndex ?? null,
      toolName: toolUse.name,
      summary: "Claude requested a tool call in the response stream.",
      preview: toolUse.inputJson || null,
      contextChars: step?.contextChars ?? null,
      contextDelta: step?.contextDelta ?? null
    });
  }

  for (const loop of turn.toolLoops) {
    const resultStep = turn.steps.find((item) => item.requestId === loop.resultRequestId);
    addNode(nodes, {
      id: toolResultNodeId(loop.toolUseId, loop.resultRequestId),
      kind: "tool_result",
      label: `Tool result: ${loop.name ?? "unknown tool"}`,
      requestId: loop.resultRequestId,
      stepIndex: resultStep?.stepIndex ?? null,
      toolName: loop.name,
      summary: `Result from request ${loop.toolUseRequestId} was included in request ${loop.resultRequestId}.`,
      preview: loop.resultPreview || null,
      contextChars: resultStep?.contextChars ?? null,
      contextDelta: loop.contextDeltaAfterResult
    });
  }

  const firstStep = turn.steps[0];
  if (firstStep) {
    edges.push({
      from: "prompt",
      to: requestNodeId(firstStep.requestId),
      relation: "anchors",
      label: "anchors"
    });
  }

  for (const step of turn.steps) {
    const requestId = requestNodeId(step.requestId);
    const assistantId = assistantNodeId(step.requestId);

    for (const loop of turn.toolLoops.filter((item) => item.resultRequestId === step.requestId)) {
      const resultId = toolResultNodeId(loop.toolUseId, loop.resultRequestId);
      edges.push({
        from: toolUseNodeId(loop.toolUseId, loop.toolUseRequestId),
        to: resultId,
        relation: "returns_result",
        label: "returns result"
      });
      edges.push({
        from: resultId,
        to: requestId,
        relation: "fed_into_context",
        label: "fed into context"
      });
    }

    edges.push({
      from: requestId,
      to: assistantId,
      relation: "produces_response",
      label: "produces response"
    });

    for (const toolUse of turn.toolUses.filter((item) => item.requestId === step.requestId)) {
      edges.push({
        from: assistantId,
        to: toolUseNodeId(toolUse.id, toolUse.requestId),
        relation: "requests_tool",
        label: "requests tool"
      });
    }
  }

  const nodeList = Array.from(nodes.values());
  return {
    key: turn.key,
    latestUserText: turn.latestUserText,
    requestIds: turn.requestIds,
    summary: {
      requestCount: turn.requestCount,
      toolUseCount: turn.toolUses.length,
      toolResultCount: turn.toolLoops.length,
      nodeCount: nodeList.length,
      edgeCount: edges.length
    },
    nodes: nodeList,
    edges
  };
}

function addNode(nodes: Map<string, ToolGraphNode>, node: ToolGraphNode): void {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function requestNodeId(requestId: number): string {
  return `request:${requestId}`;
}

function assistantNodeId(requestId: number): string {
  return `assistant:${requestId}`;
}

function toolUseNodeId(toolUseId: string | null, requestId: number): string {
  return `tool_use:${toolUseId || `request-${requestId}`}`;
}

function toolResultNodeId(toolUseId: string, requestId: number): string {
  return `tool_result:${toolUseId}:${requestId}`;
}

function truncate(value: string, max: number): string | null {
  if (!value) {
    return null;
  }
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}
