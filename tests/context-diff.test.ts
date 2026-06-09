import { describe, expect, it } from "vitest";
import { buildContextDiff } from "../src/context-diff.js";
import type { RequestDetail } from "../src/types.js";

describe("context diff", () => {
  it("compares adjacent agent payloads", () => {
    const previous = requestDetail(1, {
      messages: [{ role: "user", content: "first question" }],
      tools: [{ name: "Read" }],
      system: "base"
    });
    const current = requestDetail(2, {
      messages: [
        { role: "user", content: "first question" },
        { role: "assistant", content: [{ type: "tool_use", name: "Read" }] },
        { role: "user", content: "second question" }
      ],
      tools: [{ name: "Read" }, { name: "Edit" }],
      system: "base plus more"
    });

    expect(buildContextDiff(previous, current)).toMatchObject({
      comparable: true,
      previousRequestId: 1,
      currentRequestId: 2,
      deltas: {
        messageCount: 2,
        toolCount: 1,
        toolUseCount: 1
      },
      tools: {
        added: ["Edit"],
        removed: []
      },
      latestUserTextChanged: true,
      previousLatestUserText: "first question",
      currentLatestUserText: "second question"
    });
  });

  it("reports an empty state when previous request is missing", () => {
    const current = requestDetail(2, { messages: [{ role: "user", content: "hello" }] });

    expect(buildContextDiff(undefined, current)).toMatchObject({
      comparable: false,
      reason: "No previous request in this session"
    });
  });
});

function requestDetail(id: number, body: unknown): RequestDetail {
  return {
    id,
    sessionId: "session-a",
    startedAt: `2026-06-09T01:0${id}:00.000Z`,
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
