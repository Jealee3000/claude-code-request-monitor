import { describe, expect, it } from "vitest";
import { buildSessionParameters } from "../src/session-parameters.js";
import type { RequestDetail } from "../src/types.js";

describe("session parameters", () => {
  it("tracks agent request parameter snapshots and changed fields", () => {
    const parameters = buildSessionParameters([
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        model: "claude-sonnet-4-20250514",
        stream: true,
        max_tokens: 4096,
        temperature: 0,
        top_p: 0.9,
        tool_choice: { type: "auto" },
        thinking: { type: "enabled", budget_tokens: 1024 },
        messages: [{ role: "user", content: "inspect params" }],
        tools: [{ name: "Read" }]
      }),
      requestDetail(2, "2026-06-10T01:01:00.000Z", {
        model: "claude-sonnet-4-20250514",
        stream: true,
        max_tokens: 8192,
        temperature: 0,
        top_p: 0.9,
        tool_choice: { type: "tool", name: "Edit" },
        thinking: { type: "enabled", budget_tokens: 2048 },
        messages: [
          { role: "user", content: "inspect params" },
          { role: "assistant", content: [{ type: "tool_use", name: "Read" }] }
        ],
        tools: [{ name: "Read" }, { name: "Edit" }]
      }),
      requestDetail(3, "2026-06-10T01:02:00.000Z", { ok: true })
    ]);

    expect(parameters).toMatchObject({
      requestCount: 3,
      agentRequestCount: 2,
      latest: {
        requestId: 2,
        model: "claude-sonnet-4-20250514",
        stream: true,
        maxTokens: 8192,
        thinking: "enabled:2048",
        toolChoice: "tool:Edit",
        messageCount: 2,
        toolCount: 2
      },
      distinct: {
        models: ["claude-sonnet-4-20250514"],
        maxTokens: [4096, 8192],
        thinking: ["enabled:1024", "enabled:2048"],
        toolChoices: ["auto", "tool:Edit"]
      },
      snapshots: [
        expect.objectContaining({
          requestId: 1,
          changedFields: []
        }),
        expect.objectContaining({
          requestId: 2,
          changedFields: expect.arrayContaining(["maxTokens", "toolChoice", "thinking", "messageCount", "toolCount"])
        })
      ]
    });
    expect(parameters.snapshots[1]?.contextDelta).toBeGreaterThan(0);
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
