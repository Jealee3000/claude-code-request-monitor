import { describe, expect, it } from "vitest";
import { buildRequestSearch } from "../src/request-search.js";
import type { RequestDetail } from "../src/types.js";

describe("request search", () => {
  it("finds agent requests by prompt response tool and skill signals", () => {
    const details = [
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        model: "claude",
        system: [{ type: "text", text: "Claude Code\nname: read-skill\ndescription: read files" }],
        messages: [{ role: "user", content: "inspect src/viewer.ts" }],
        tools: [{ name: "Read", description: "Read files" }]
      }, responseStream("I will read the viewer.")),
      requestDetail(2, "2026-06-10T01:01:00.000Z", {
        model: "claude",
        system: [{ type: "text", text: "Claude Code\nname: edit-skill\ndescription: edit files" }],
        messages: [{ role: "user", content: "update src/viewer.ts" }],
        tools: [{ name: "Edit", description: "Edit files" }]
      }, responseStream("I will update the tabs.")),
      requestDetail(3, "2026-06-10T01:02:00.000Z", { ok: true }, null)
    ];

    expect(buildRequestSearch(details, { query: "viewer", tool: "Edit" })).toMatchObject({
      total: 1,
      results: [
        {
          requestId: 2,
          latestUserText: "update src/viewer.ts",
          toolNames: ["Edit"],
          matchedFields: expect.arrayContaining(["prompt", "tool-filter"])
        }
      ]
    });
    expect(buildRequestSearch(details, { skill: "read-skill" })).toMatchObject({
      total: 1,
      results: [
        {
          requestId: 1,
          suspectedSkillNames: ["read-skill"],
          matchedFields: expect.arrayContaining(["skill-filter"])
        }
      ]
    });
    expect(buildRequestSearch(details, { query: "tabs" })).toMatchObject({
      total: 1,
      results: [
        {
          requestId: 2,
          responsePreview: "I will update the tabs.",
          matchedFields: expect.arrayContaining(["response"])
        }
      ]
    });
  });

  it("returns recent agent requests when no search filters are provided", () => {
    const results = buildRequestSearch([
      requestDetail(1, "2026-06-10T01:00:00.000Z", { messages: [{ role: "user", content: "first" }], tools: [] }, null),
      requestDetail(2, "2026-06-10T01:01:00.000Z", { messages: [{ role: "user", content: "second" }], tools: [] }, null),
      requestDetail(3, "2026-06-10T01:02:00.000Z", { ok: true }, null)
    ], {});

    expect(results).toMatchObject({
      total: 2,
      results: [
        { requestId: 2, latestUserText: "second" },
        { requestId: 1, latestUserText: "first" }
      ]
    });
  });
});

function requestDetail(id: number, startedAt: string, body: unknown, responseBody: string | null): RequestDetail {
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
    responseBytes: responseBody?.length ?? 0,
    contentType: "text/event-stream",
    eventCount: 0,
    error: null,
    payload: {
      requestId: id,
      requestHeadersJson: null,
      requestBodyJson: JSON.stringify(body),
      responseHeadersJson: null,
      responseBodyJson: responseBody === null ? null : JSON.stringify(responseBody)
    }
  };
}

function responseStream(text: string): string {
  return [
    "event: content_block_delta",
    `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}`
  ].join("\n");
}
