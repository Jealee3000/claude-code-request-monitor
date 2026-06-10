import { buildAgentInsight } from "./agent-insight.js";
import { buildTurnCompare } from "./turn-compare.js";
import { buildTurnReplay } from "./turn-replay.js";
import type { RequestDetail } from "./types.js";

export interface TurnExport {
  requestId: number;
  filename: string;
  markdown: string;
}

export function buildTurnExport(details: RequestDetail[], selectedRequestId: number): TurnExport | null {
  const insight = buildAgentInsight(details, selectedRequestId);
  const replay = buildTurnReplay(details, selectedRequestId);
  const compare = buildTurnCompare(details, selectedRequestId);
  if (!insight || !replay) {
    return null;
  }

  const selected = details.find((detail) => detail.id === selectedRequestId);
  const stamp = safeStamp(selected?.startedAt ?? new Date().toISOString());
  const markdown = [
    "# Claude Watch Turn Note",
    "",
    `- Request: ${selectedRequestId}`,
    `- Turn requests: ${insight.requestIds.join(", ")}`,
    `- Started: ${selected?.startedAt ?? "unknown"}`,
    `- Model: ${insight.metrics.model ?? "unknown"}`,
    "",
    "## User Prompt",
    "",
    fenced(insight.latestUserText || "none"),
    "",
    "## Agent Insight",
    "",
    `- Headline: ${insight.headline}`,
    `- Max context chars: ${insight.metrics.maxContextChars}`,
    `- Context delta: ${formatDelta(insight.metrics.totalContextDelta)}`,
    `- Tools: ${insight.metrics.toolCount}`,
    `- Suspected skills: ${insight.metrics.suspectedSkillCount}`,
    `- Tool uses/results: ${insight.metrics.toolUseCount} / ${insight.metrics.toolResultCount}`,
    "",
    ...insight.insights.flatMap((item) => [
      `### ${item.title}`,
      "",
      item.detail,
      ""
    ]),
    "## Replay",
    "",
    ...replay.events.flatMap((event, index) => [
      `### ${index + 1}. ${event.title}`,
      "",
      `- Kind: ${event.kind}`,
      `- Request: ${event.requestId ?? "n/a"}`,
      `- Context chars: ${event.contextChars ?? "n/a"}`,
      `- Context delta: ${event.contextDelta === null ? "n/a" : formatDelta(event.contextDelta)}`,
      "",
      event.preview ? fenced(event.preview) : "_No preview_",
      ""
    ]),
    "## Compare",
    "",
    compareSection(compare),
    "",
    "## Final Assistant Response",
    "",
    fenced(insight.metrics.finalAssistantPreview || "none"),
    ""
  ].join("\n");

  return {
    requestId: selectedRequestId,
    filename: `claude-watch-turn-${selectedRequestId}-${stamp}.md`,
    markdown
  };
}

function compareSection(compare: ReturnType<typeof buildTurnCompare>): string {
  if (!compare) {
    return "No comparable agent turn.";
  }
  if (!compare.comparable) {
    return compare.reason ?? "No comparable baseline turn.";
  }

  return [
    `- Headline: ${compare.headline}`,
    `- Baseline prompt: ${compare.baseline?.latestUserText ?? "none"}`,
    `- Current prompt: ${compare.current.latestUserText ?? "none"}`,
    `- Context delta: ${compare.deltas ? formatDelta(compare.deltas.contextChars) : "n/a"}`,
    `- Tools added: ${compare.toolDiff.added.join(", ") || "none"}`,
    `- Tools removed: ${compare.toolDiff.removed.join(", ") || "none"}`,
    `- Skills added: ${compare.skillDiff.added.join(", ") || "none"}`,
    `- Skills removed: ${compare.skillDiff.removed.join(", ") || "none"}`,
    `- Final response changed: ${compare.finalResponseChanged}`
  ].join("\n");
}

function fenced(value: string): string {
  return `\`\`\`\n${value.replace(/```/g, "'''")}\n\`\`\``;
}

function safeStamp(value: string): string {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14) || "unknown";
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
