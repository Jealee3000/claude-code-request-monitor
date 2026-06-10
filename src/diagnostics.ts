import type { SessionRequestStats } from "./types.js";

export interface DiagnosticIssue {
  severity: "info" | "warn" | "bad";
  code: string;
  message: string;
  sessionId?: string;
}

export type SessionDiagnosticStatus = "capturing" | "waiting" | "metadata_only" | "not_routable";

export interface SessionDiagnosticCheck {
  sessionId: string;
  startedAt: string;
  projectPath: string;
  claudeSessionId: string | null;
  inspectBody: boolean;
  watchTokenPresent: boolean;
  requestCount: number;
  payloadCount: number;
  connectRequestCount: number;
  lastRequestAt: string | null;
  status: SessionDiagnosticStatus;
  summary: string;
  hints: string[];
}

export interface CaptureDiagnostics {
  totalSessions: number;
  activeSessions: number;
  zeroRequestSessions: number;
  latestRequestAt: string | null;
  issues: DiagnosticIssue[];
  sessionChecks: SessionDiagnosticCheck[];
}

export function buildDiagnostics(stats: SessionRequestStats[]): CaptureDiagnostics {
  const active = stats.filter((session) => session.requestCount > 0);
  const zero = stats.filter((session) => session.requestCount === 0);
  const latestRequestAt = active
    .map((session) => session.lastRequestAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;

  const sessionChecks = stats.map(buildSessionCheck).sort(compareSessionChecks);
  const issues: DiagnosticIssue[] = zero
    .filter((session) => session.claudeSessionId)
    .map((session) => ({
      severity: session.watchTokenPresent ? "warn" as const : "bad" as const,
      code: session.watchTokenPresent ? "registered-session-without-requests" : "watch-session-missing-token",
      sessionId: session.sessionId,
      message: session.watchTokenPresent
        ? "This resumed Claude session was registered, but no requests were captured. Restart it through claude-watch run and confirm Claude was launched from the copied monitored command."
        : "This watch session has no routing token, so requests from a separate Claude process cannot be attributed to it. Create a new monitored run from Claude Sessions."
    }));

  for (const session of active) {
    if (!session.inspectBody || session.payloadCount === 0) {
      issues.push({
        severity: session.inspectBody ? "warn" : "info",
        code: session.inspectBody ? "inspect-body-no-payloads" : "inspect-body-disabled",
        sessionId: session.sessionId,
        message: session.inspectBody
          ? "Only tunnel metadata was captured. If the request list shows CONNECT rows only, the running service is not intercepting HTTPS bodies; restart the long-lived watcher with --inspect-body."
          : "Requests are being captured, but inspect-body is disabled. Agent context, tools, skills, and response previews need --inspect-body."
      });
    }
  }

  if (stats.length === 0) {
    issues.push({
      severity: "info",
      code: "no-watch-sessions",
      message: "No watch sessions have been registered yet."
    });
  }

  return {
    totalSessions: stats.length,
    activeSessions: active.length,
    zeroRequestSessions: zero.length,
    latestRequestAt,
    issues,
    sessionChecks
  };
}

function buildSessionCheck(session: SessionRequestStats): SessionDiagnosticCheck {
  const status = session.requestCount > 0
    ? session.inspectBody && session.payloadCount > 0 ? "capturing" : "metadata_only"
    : session.watchTokenPresent ? "waiting" : "not_routable";

  return {
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    projectPath: session.projectPath,
    claudeSessionId: session.claudeSessionId,
    inspectBody: session.inspectBody,
    watchTokenPresent: Boolean(session.watchTokenPresent),
    requestCount: session.requestCount,
    payloadCount: session.payloadCount,
    connectRequestCount: session.connectRequestCount,
    lastRequestAt: session.lastRequestAt,
    status,
    summary: buildSummary(session, status),
    hints: buildHints(session, status)
  };
}

function compareSessionChecks(left: SessionDiagnosticCheck, right: SessionDiagnosticCheck): number {
  return statusRank(left.status) - statusRank(right.status) || right.startedAt.localeCompare(left.startedAt);
}

function statusRank(status: SessionDiagnosticStatus): number {
  if (status === "not_routable") return 0;
  if (status === "waiting") return 1;
  if (status === "metadata_only") return 2;
  return 3;
}

function buildSummary(session: SessionRequestStats, status: SessionDiagnosticStatus): string {
  if (status === "capturing") {
    return `Captured ${session.requestCount} request(s). Latest request: ${session.lastRequestAt ?? "unknown"}.`;
  }
  if (status === "metadata_only") {
    if (session.connectRequestCount === session.requestCount) {
      return `Captured ${session.requestCount} CONNECT tunnel(s), but request/response bodies are not available.`;
    }
    return `Captured ${session.requestCount} request(s), but request/response bodies are not available.`;
  }
  if (status === "waiting") {
    return "No requests captured yet for this monitored Claude session.";
  }
  return "This session cannot route requests from a separate Claude process because it has no watch token.";
}

function buildHints(session: SessionRequestStats, status: SessionDiagnosticStatus): string[] {
  if (status === "capturing") {
    return ["Capture is active. Use the Turns list to inspect agent behavior."];
  }
  if (status === "metadata_only") {
    return [
      "Restart the long-lived watcher service with --inspect-body to inspect context, tools, skills, and response streams.",
      "If you use multi-session mode, start the service with: npm.cmd run watch -- server --inspect-body",
      "Existing metadata remains useful for timing and endpoint checks."
    ];
  }
  if (status === "waiting") {
    const resume = session.claudeSessionId ? ` --resume ${session.claudeSessionId}` : "";
    return [
      `Start Claude through the watcher: npm.cmd run watch -- run --project "${session.projectPath}"${resume}`,
      "Confirm the long-lived watcher service is still running and the viewer/proxy ports match the copied command.",
      "If Claude was already open before this watch session was created, restart it through the monitored command."
    ];
  }
  return [
    "Create a new monitored run from the Claude Sessions tab so the launcher can attach a routing token.",
    "Legacy sessions created before multi-session routing may not be attributable."
  ];
}
