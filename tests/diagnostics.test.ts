import { describe, expect, it } from "vitest";
import { buildDiagnostics } from "../src/diagnostics.js";

describe("capture diagnostics", () => {
  it("summarizes capture health and flags zero-request resumed sessions", () => {
    const diagnostics = buildDiagnostics([
      {
        sessionId: "session-active",
        startedAt: "2026-06-09T01:00:00.000Z",
        projectPath: "D:\\code\\active",
        inspectBody: true,
        claudeSessionId: null,
        requestCount: 3,
        lastRequestAt: "2026-06-09T01:10:00.000Z"
      },
      {
        sessionId: "session-empty",
        startedAt: "2026-06-09T01:05:00.000Z",
        projectPath: "D:\\code\\empty",
        inspectBody: true,
        claudeSessionId: "claude-session",
        requestCount: 0,
        lastRequestAt: null
      }
    ]);

    expect(diagnostics).toMatchObject({
      totalSessions: 2,
      activeSessions: 1,
      zeroRequestSessions: 1,
      latestRequestAt: "2026-06-09T01:10:00.000Z",
      issues: [
        {
          severity: "warn",
          code: "registered-session-without-requests",
          sessionId: "session-empty"
        }
      ]
    });
  });
});
