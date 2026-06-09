import { describe, expect, it } from "vitest";
import { buildTurnTimeline } from "../src/turn-timeline.js";
import type { RequestDetail } from "../src/types.js";

describe("turn timeline", () => {
  it("groups agent requests by latest user text and sorts newest turn first", () => {
    const turns = buildTurnTimeline([
      requestDetail(1, "2026-06-09T01:00:00.000Z", {
        model: "claude",
        messages: [{ role: "user", content: "first question" }],
        tools: [{ name: "Read" }]
      }),
      requestDetail(2, "2026-06-09T01:01:00.000Z", {
        model: "claude",
        messages: [
          { role: "user", content: "first question" },
          { role: "assistant", content: [{ type: "tool_use", name: "Read" }] }
        ],
        tools: [{ name: "Read" }]
      }),
      requestDetail(3, "2026-06-09T01:02:00.000Z", {
        model: "claude",
        messages: [{ role: "user", content: "second question" }],
        tools: [{ name: "Edit" }]
      })
    ]);

    expect(turns).toMatchObject([
      {
        latestUserPreview: "second question",
        requestIds: [3],
        requestCount: 1,
        toolNames: ["Edit"]
      },
      {
        latestUserPreview: "first question",
        requestIds: [1, 2],
        requestCount: 2,
        toolNames: ["Read"],
        toolUseCount: 1
      }
    ]);
  });
});

function requestDetail(id: number, startedAt: string, body: unknown): RequestDetail {
  return {
    id,
    sessionId: "session-a",
    startedAt,
    completedAt: null,
    method: "POST",
    host: "api.anthropic.com",
    path: "/v1/messages",
    statusCode: 200,
    durationMs: 10,
    requestBytes: 100,
    responseBytes: 100,
    contentType: "application/json",
    eventCount: 0,
    error: null,
    payload: {
      requestId: id,
      requestHeadersJson: null,
      requestBodyJson: JSON.stringify(body),
      responseHeadersJson: null,
      responseBodyJson: null
    }
  };
}
