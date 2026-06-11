import { buildAgentInsight } from "./agent-insight.js";
import { buildSessionFindings, type SessionFinding } from "./session-findings.js";
import { buildTurnTimeline } from "./turn-timeline.js";
import type { RequestDetail, SessionRecord, TurnAnnotation } from "./types.js";

export interface SessionExport {
  sessionId: string;
  filename: string;
  markdown: string;
}

export function buildSessionExport(
  session: SessionRecord,
  details: RequestDetail[],
  annotations: TurnAnnotation[] = []
): SessionExport {
  const turns = buildTurnTimeline(details).sort((left, right) => left.firstRequestAt.localeCompare(right.firstRequestAt));
  const annotationByKey = new Map(annotations.map((annotation) => [annotation.turnKey, annotation]));
  const insights = turns.map((turn) => ({
    turn,
    insight: buildAgentInsight(details, turn.requestIds[turn.requestIds.length - 1])
  }));

  const totalRequests = details.length;
  const agentRequests = details.filter((detail) => detail.payload?.requestBodyJson).length;
  const toolNames = [...new Set(turns.flatMap((turn) => turn.toolNames))].sort();
  const maxContextChars = turns.reduce((max, turn) => Math.max(max, turn.maxContextChars), 0);
  const toolUseCount = turns.reduce((total, turn) => total + turn.toolUseCount, 0);
  const toolResultCount = turns.reduce((total, turn) => total + turn.toolResultCount, 0);
  const findings = buildSessionFindings(details);
  const stamp = safeStamp(session.startedAt);

  const markdown = [
    "# Claude Watch Session Note",
    "",
    `- Session: ${session.id}`,
    `- Claude session: ${session.claudeSessionId ?? "none"}`,
    `- Project: ${session.projectPath}`,
    `- Started: ${session.startedAt}`,
    `- Inspect body: ${session.inspectBody ? "yes" : "no"}`,
    "",
    "## Overview",
    "",
    `- Requests: ${totalRequests}`,
    `- Agent requests: ${agentRequests}`,
    `- Agent turns: ${turns.length}`,
    `- Max context chars: ${maxContextChars}`,
    `- Tool uses/results: ${toolUseCount} / ${toolResultCount}`,
    `- Tools: ${toolNames.join(", ") || "none"}`,
    "",
    "## Session Findings",
    "",
    ...renderSessionFindings(findings.findings),
    "",
    ...insights.flatMap(({ turn, insight }, index) =>
      renderTurnSection(index + 1, turn, insight, annotationByKey.get(turn.key))
    )
  ].join("\n");

  return {
    sessionId: session.id,
    filename: `claude-watch-session-${safeFilePart(session.id)}-${stamp}.md`,
    markdown
  };
}

function renderSessionFindings(findings: SessionFinding[]): string[] {
  if (!findings.length) {
    return ["_No session findings detected._"];
  }

  return findings.map((finding) => {
    const request = finding.requestId ? `request ${finding.requestId}` : "session";
    const values = Object.entries(finding.values)
      .filter(([, value]) => value !== null && value !== "")
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    return `- [${finding.severity}] ${finding.title} (${finding.kind}, ${request}): ${finding.detail}${values ? ` (${values})` : ""}`;
  });
}

function renderTurnSection(
  index: number,
  turn: ReturnType<typeof buildTurnTimeline>[number],
  insight: ReturnType<typeof buildAgentInsight>,
  annotation: TurnAnnotation | undefined
): string[] {
  const title = turn.latestUserPreview || `request ${turn.requestIds[turn.requestIds.length - 1]}`;
  const lines = [
    `## Turn ${index}: ${title}`,
    "",
    `- Requests: ${turn.requestIds.join(", ")}`,
    `- Started: ${turn.firstRequestAt}`,
    `- Last request: ${turn.lastRequestAt}`,
    `- Model: ${turn.model ?? "unknown"}`,
    `- Max context chars: ${turn.maxContextChars}`,
    `- Tools: ${turn.toolNames.join(", ") || "none"}`,
    `- Tool uses/results: ${turn.toolUseCount} / ${turn.toolResultCount}`,
    `- Suspected skills: ${insight?.metrics.suspectedSkillCount ?? 0}`,
    `- Bookmark: ${annotation?.bookmarked ? "yes" : "no"}`,
    `- Tags: ${annotation?.tags.length ? annotation.tags.join(", ") : "none"}`,
    "",
    "### Prompt",
    "",
    fenced(insight?.latestUserText || turn.latestUserPreview || "none"),
    "",
    "### Notes",
    "",
    annotation?.note ? annotation.note : "_No notes_",
    "",
    "### Agent Insight",
    "",
    insight?.headline ?? "No agent insight available.",
    ""
  ];

  if (insight?.insights.length) {
    lines.push(
      ...insight.insights.flatMap((item) => [
        `- ${item.title}: ${item.detail}`
      ]),
      ""
    );
  }

  lines.push(
    "### Final Assistant Preview",
    "",
    fenced(insight?.metrics.finalAssistantPreview || "none"),
    ""
  );

  return lines;
}

function fenced(value: string): string {
  return `\`\`\`\n${value.replace(/```/g, "'''")}\n\`\`\``;
}

function safeStamp(value: string): string {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14) || "unknown";
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_") || "session";
}
