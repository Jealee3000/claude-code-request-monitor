import { buildAgentInsight, type AgentInsightItem } from "./agent-insight.js";
import { buildSessionInventory } from "./session-inventory.js";
import { buildSessionParameters } from "./session-parameters.js";
import { buildTurnTimeline } from "./turn-timeline.js";
import type { RequestDetail } from "./types.js";

export type SessionFindingKind = "context" | "parameters" | "tools" | "skills" | "risk" | "response";
export type SessionFindingSeverity = "info" | "warning" | "error";

export interface SessionFinding {
  kind: SessionFindingKind;
  severity: SessionFindingSeverity;
  title: string;
  detail: string;
  requestId: number | null;
  values: Record<string, string | number | boolean | null>;
}

export interface SessionFindings {
  requestCount: number;
  agentRequestCount: number;
  findingCount: number;
  warningCount: number;
  findings: SessionFinding[];
}

export function buildSessionFindings(details: RequestDetail[]): SessionFindings {
  const parameters = buildSessionParameters(details);
  const inventory = buildSessionInventory(details);
  const findings: SessionFinding[] = [];

  for (const snapshot of parameters.snapshots) {
    if (snapshot.changedFields.length) {
      findings.push({
        kind: "parameters",
        severity: "info",
        title: "Agent parameters changed",
        detail: `Changed ${snapshot.changedFields.join(", ")} on request ${snapshot.requestId}.`,
        requestId: snapshot.requestId,
        values: {
          changedFields: snapshot.changedFields.join(", "),
          model: snapshot.model,
          maxTokens: snapshot.maxTokens,
          thinking: snapshot.thinking,
          toolChoice: snapshot.toolChoice,
          messageCount: snapshot.messageCount,
          toolCount: snapshot.toolCount
        }
      });
    }

    if (snapshot.contextDelta !== null && snapshot.contextDelta > 0) {
      findings.push({
        kind: "context",
        severity: snapshot.contextDelta > 80_000 ? "warning" : "info",
        title: "Context grew between agent requests",
        detail: `Request ${snapshot.requestId} carried ${snapshot.estimatedContextChars} estimated context chars, +${snapshot.contextDelta} versus the previous agent request.`,
        requestId: snapshot.requestId,
        values: {
          contextChars: snapshot.estimatedContextChars,
          contextDelta: snapshot.contextDelta,
          messageCount: snapshot.messageCount,
          toolCount: snapshot.toolCount
        }
      });
    }
  }

  for (const tool of inventory.tools) {
    if (!tool.schemaChanged) {
      continue;
    }
    findings.push({
      kind: "tools",
      severity: "warning",
      title: "Tool schema changed",
      detail: `${tool.name} appeared with more than one schema shape across ${tool.seenCount} agent request(s).`,
      requestId: tool.lastRequestId,
      values: {
        toolName: tool.name,
        seenCount: tool.seenCount,
        firstRequestId: tool.firstRequestId,
        lastRequestId: tool.lastRequestId,
        schemaChars: tool.schemaChars,
        inputSchemaChars: tool.inputSchemaChars
      }
    });
  }

  if (inventory.toolCount > 40) {
    findings.push({
      kind: "tools",
      severity: "warning",
      title: "Large tool inventory exposed",
      detail: `${inventory.toolCount} distinct tools were exposed during this session. Large tool menus can consume context and shift tool selection behavior.`,
      requestId: inventory.tools[0]?.lastRequestId ?? null,
      values: { toolCount: inventory.toolCount }
    });
  }

  if (inventory.skillCount > 8) {
    findings.push({
      kind: "skills",
      severity: "warning",
      title: "Many suspected skills in context",
      detail: `${inventory.skillCount} suspected skills appeared in the session system context.`,
      requestId: inventory.skills[0]?.lastRequestId ?? null,
      values: { suspectedSkillCount: inventory.skillCount }
    });
  }

  findings.push(...collectTurnRiskFindings(details));

  const sorted = findings.sort((left, right) => {
    return severityRank(right.severity) - severityRank(left.severity) || (left.requestId ?? Number.MAX_SAFE_INTEGER) - (right.requestId ?? Number.MAX_SAFE_INTEGER);
  });

  return {
    requestCount: parameters.requestCount,
    agentRequestCount: parameters.agentRequestCount,
    findingCount: sorted.length,
    warningCount: sorted.filter((finding) => finding.severity !== "info").length,
    findings: sorted
  };
}

function collectTurnRiskFindings(details: RequestDetail[]): SessionFinding[] {
  const findings: SessionFinding[] = [];
  for (const turn of buildTurnTimeline(details)) {
    const selectedRequestId = turn.requestIds[turn.requestIds.length - 1];
    if (!selectedRequestId) {
      continue;
    }
    const insight = buildAgentInsight(details, selectedRequestId);
    for (const item of insight?.insights ?? []) {
      if (item.kind !== "risk" || item.severity === "info") {
        continue;
      }
      findings.push(fromInsightItem(item));
    }
  }
  return findings;
}

function fromInsightItem(item: AgentInsightItem): SessionFinding {
  return {
    kind: "risk",
    severity: item.severity,
    title: item.title,
    detail: item.detail,
    requestId: item.requestId,
    values: item.values
  };
}

function severityRank(severity: SessionFindingSeverity): number {
  if (severity === "error") {
    return 2;
  }
  if (severity === "warning") {
    return 1;
  }
  return 0;
}
