import { describe, expect, it } from "vitest";
import { buildContextWaterfall } from "../src/context-waterfall.js";
import type { RequestDetail } from "../src/types.js";

describe("context waterfall", () => {
  it("breaks an agent request into context sections with percentages and deltas", () => {
    const previous = requestDetail(1, {
      system: "Claude Code\nname: read-skill\ndescription: read files",
      messages: [{ role: "user", content: "inspect viewer" }],
      tools: [{ name: "Read", input_schema: { type: "object" } }]
    });
    const current = requestDetail(2, {
      system: [
        {
          type: "text",
          text: [
            "Claude Code",
            "name: read-skill",
            "description: read files",
            "name: edit-skill",
            "description: edit files"
          ].join("\n")
        }
      ],
      messages: [
        { role: "user", content: "inspect viewer" },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_read", name: "Read" }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "file contents" }] },
        { role: "user", content: "now edit it" }
      ],
      tools: [
        { name: "Read", input_schema: { type: "object" } },
        { name: "Edit", input_schema: { type: "object", properties: { file_path: { type: "string" } } } }
      ]
    });

    const waterfall = buildContextWaterfall(previous, current);

    expect(waterfall).toMatchObject({
      requestId: 2,
      previousRequestId: 1,
      reason: null,
      summary: {
        messageCount: 4,
        toolCount: 2,
        suspectedSkillCount: 2
      }
    });
    expect(waterfall.totalChars).toBeGreaterThan(0);
    expect(waterfall.totalDelta).toBeGreaterThan(0);
    expect(waterfall.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "system", group: "primary", parentId: null, deltaChars: expect.any(Number) }),
      expect.objectContaining({ id: "tools_schema", group: "primary", parentId: null, itemCount: 2 }),
      expect.objectContaining({ id: "messages", group: "primary", parentId: null, itemCount: 4 }),
      expect.objectContaining({ id: "skills", group: "system_subsection", parentId: "system", itemCount: 2 }),
      expect.objectContaining({ id: "tool_results", group: "messages_subsection", parentId: "messages", itemCount: 1 }),
      expect.objectContaining({ id: "latest_user_input", group: "messages_subsection", parentId: "messages", preview: "now edit it" }),
      expect.objectContaining({ id: "assistant_history", group: "messages_subsection", parentId: "messages", itemCount: 1 })
    ]));
    expect(waterfall.segments.find((segment) => segment.id === "messages")?.percent).toBeGreaterThan(0);
    expect(waterfall.segments.find((segment) => segment.id === "tool_results")?.chars).toBeGreaterThan(0);
  });

  it("returns an empty analysis when the request has no agent payload", () => {
    const waterfall = buildContextWaterfall(undefined, requestDetail(1, { ok: true }));

    expect(waterfall).toMatchObject({
      requestId: 1,
      previousRequestId: null,
      totalChars: 0,
      totalDelta: null,
      reason: "No agent payload captured for this request",
      segments: []
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
