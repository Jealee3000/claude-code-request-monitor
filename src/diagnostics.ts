import type { SessionRequestStats } from "./types.js";

export interface DiagnosticIssue {
  severity: "info" | "warn" | "bad";
  code: string;
  message: string;
  sessionId?: string;
}

export interface CaptureDiagnostics {
  totalSessions: number;
  activeSessions: number;
  zeroRequestSessions: number;
  latestRequestAt: string | null;
  issues: DiagnosticIssue[];
}

export function buildDiagnostics(stats: SessionRequestStats[]): CaptureDiagnostics {
  const active = stats.filter((session) => session.requestCount > 0);
  const zero = stats.filter((session) => session.requestCount === 0);
  const latestRequestAt = active
    .map((session) => session.lastRequestAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;

  const issues: DiagnosticIssue[] = zero
    .filter((session) => session.claudeSessionId)
    .map((session) => ({
      severity: "warn" as const,
      code: "registered-session-without-requests",
      sessionId: session.sessionId,
      message: "This resumed Claude session was registered, but no requests were captured. Restart it through claude-watch run and confirm the watcher was restarted after code changes."
    }));

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
    issues
  };
}
