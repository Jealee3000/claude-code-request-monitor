import { describe, expect, it } from "vitest";
import { buildAgentInsight } from "../src/agent-insight.js";
import type { RequestDetail } from "../src/types.js";

describe("agent insight", () => {
  it("summarizes the agent behavior behind a tool-using turn", () => {
    const insight = buildAgentInsight([
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        model: "claude",
        system: [{ type: "text", text: "Claude Code system\nname: read-skill\ndescription: read files" }],
        messages: [{ role: "user", content: "inspect src/viewer.ts" }],
        tools: [{ name: "Read", description: "Read files", input_schema: { properties: { file_path: { type: "string" } } } }]
      }, responseStream("I will read the file.", "Read", "toolu_read", '{"file_path":"src/viewer.ts"}')),
      requestDetail(2, "2026-06-10T01:01:00.000Z", {
        model: "claude",
        system: [{ type: "text", text: "Claude Code system\nname: read-skill\ndescription: read files" }],
        messages: [
          { role: "user", content: "inspect src/viewer.ts" },
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_read", name: "Read" }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "viewer file contents" }] }
        ],
        tools: [
          { name: "Read", description: "Read files", input_schema: { properties: { file_path: { type: "string" } } } },
          { name: "Edit", description: "Edit files", input_schema: { properties: { file_path: { type: "string" }, old_string: { type: "string" } } } }
        ]
      }, responseStream("The viewer has tabs.", null, null, null))
    ], 2);

    expect(insight).toMatchObject({
      latestUserText: "inspect src/viewer.ts",
      requestIds: [1, 2],
      requestCount: 2,
      headline: expect.stringContaining("2 requests"),
      metrics: {
        model: "claude",
        toolUseCount: 1,
        toolResultCount: 1,
        toolCount: 2,
        suspectedSkillCount: 1,
        finalAssistantPreview: "The viewer has tabs."
      }
    });
    expect(insight?.metrics.totalContextDelta).toBeGreaterThan(0);
    expect(insight?.insights.map((item) => item.kind)).toEqual([
      "context",
      "tool_loop",
      "skills",
      "tools",
      "response"
    ]);
    expect(insight?.insights).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "tool_loop",
        title: "Tool result was fed back into context",
        detail: expect.stringContaining("Read")
      }),
      expect.objectContaining({
        kind: "skills",
        detail: expect.stringContaining("read-skill")
      }),
      expect.objectContaining({
        kind: "tools",
        detail: expect.stringContaining("Read, Edit")
      })
    ]));
  });

  it("returns null for a non-agent selected request", () => {
    const insight = buildAgentInsight([requestDetail(1, "2026-06-10T01:00:00.000Z", { ok: true }, null)], 1);

    expect(insight).toBeNull();
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

function responseStream(text: string, toolName: string | null, toolId: string | null, inputJson: string | null): string {
  const frames = [
    ["event: content_block_delta", JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })]
  ];

  if (toolName && toolId && inputJson) {
    frames.push(
      ["event: content_block_start", JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: toolId, name: toolName, input: {} } })],
      ["event: content_block_delta", JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: inputJson } })]
    );
  }

  return frames.map(([event, data]) => `${event}\ndata: ${data}`).join("\n\n");
}
