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
        watchTokenPresent: false,
        claudeSessionId: null,
        requestCount: 3,
        lastRequestAt: "2026-06-09T01:10:00.000Z"
      },
      {
        sessionId: "session-empty",
        startedAt: "2026-06-09T01:05:00.000Z",
        projectPath: "D:\\code\\empty",
        inspectBody: true,
        watchTokenPresent: true,
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
      ],
      sessionChecks: [
        {
          sessionId: "session-empty",
          status: "waiting",
          watchTokenPresent: true,
          summary: expect.stringContaining("No requests captured"),
          hints: expect.arrayContaining([
            expect.stringContaining("npm.cmd run watch -- run --project")
          ])
        },
        {
          sessionId: "session-active",
          status: "capturing",
          watchTokenPresent: false,
          summary: expect.stringContaining("Captured 3 request")
        }
      ]
    });
  });

  it("flags sessions that cannot explain agent context capture", () => {
    const diagnostics = buildDiagnostics([
      {
        sessionId: "metadata-session",
        startedAt: "2026-06-09T01:00:00.000Z",
        projectPath: "D:\\code\\metadata",
        inspectBody: false,
        watchTokenPresent: true,
        claudeSessionId: null,
        requestCount: 2,
        lastRequestAt: "2026-06-09T01:02:00.000Z"
      },
      {
        sessionId: "legacy-session",
        startedAt: "2026-06-09T01:03:00.000Z",
        projectPath: "D:\\code\\legacy",
        inspectBody: true,
        watchTokenPresent: false,
        claudeSessionId: "claude-legacy",
        requestCount: 0,
        lastRequestAt: null
      }
    ]);

    expect(diagnostics.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "info",
        code: "inspect-body-disabled",
        sessionId: "metadata-session"
      }),
      expect.objectContaining({
        severity: "bad",
        code: "watch-session-missing-token",
        sessionId: "legacy-session"
      })
    ]));
    expect(diagnostics.sessionChecks).toMatchObject([
      {
        sessionId: "legacy-session",
        status: "not_routable",
        hints: expect.arrayContaining([
          expect.stringContaining("Create a new monitored run")
        ])
      },
      {
        sessionId: "metadata-session",
        status: "metadata_only",
        hints: expect.arrayContaining([
          expect.stringContaining("--inspect-body")
        ])
      }
    ]);
  });
});
