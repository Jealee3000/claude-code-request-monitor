import { describe, expect, it } from "vitest";
import { buildToolGraph } from "../src/tool-graph.js";
import type { RequestDetail } from "../src/types.js";

describe("tool graph", () => {
  it("builds causal nodes and edges for a tool loop", () => {
    const graph = buildToolGraph([
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        model: "claude",
        system: "Claude Code\nname: read-skill\ndescription: read files",
        messages: [{ role: "user", content: "inspect src/viewer.ts" }],
        tools: [{ name: "Read", input_schema: { properties: { file_path: { type: "string" } } } }]
      }, responseStream("I will read the file.", "Read", "toolu_read", '{"file_path":"src/viewer.ts"}')),
      requestDetail(2, "2026-06-10T01:01:00.000Z", {
        model: "claude",
        system: "Claude Code\nname: read-skill\ndescription: read files",
        messages: [
          { role: "user", content: "inspect src/viewer.ts" },
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_read", name: "Read" }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "viewer file contents" }] }
        ],
        tools: [{ name: "Read", input_schema: { properties: { file_path: { type: "string" } } } }]
      }, responseStream("The viewer has tabs.", null, null, null))
    ], 2);

    expect(graph).toMatchObject({
      latestUserText: "inspect src/viewer.ts",
      requestIds: [1, 2],
      summary: {
        requestCount: 2,
        toolUseCount: 1,
        toolResultCount: 1,
        edgeCount: 6
      }
    });
    expect(graph?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "prompt", kind: "user_prompt", label: "User prompt" }),
      expect.objectContaining({ id: "request:1", kind: "request_context", requestId: 1 }),
      expect.objectContaining({ id: "assistant:1", kind: "assistant_response", requestId: 1 }),
      expect.objectContaining({ id: "tool_use:toolu_read", kind: "tool_use", requestId: 1, toolName: "Read" }),
      expect.objectContaining({ id: "tool_result:toolu_read:2", kind: "tool_result", requestId: 2, toolName: "Read" }),
      expect.objectContaining({ id: "request:2", kind: "request_context", requestId: 2 }),
      expect.objectContaining({ id: "assistant:2", kind: "assistant_response", requestId: 2 })
    ]));
    expect(graph?.edges).toEqual([
      expect.objectContaining({ from: "prompt", to: "request:1", relation: "anchors" }),
      expect.objectContaining({ from: "request:1", to: "assistant:1", relation: "produces_response" }),
      expect.objectContaining({ from: "assistant:1", to: "tool_use:toolu_read", relation: "requests_tool" }),
      expect.objectContaining({ from: "tool_use:toolu_read", to: "tool_result:toolu_read:2", relation: "returns_result" }),
      expect.objectContaining({ from: "tool_result:toolu_read:2", to: "request:2", relation: "fed_into_context" }),
      expect.objectContaining({ from: "request:2", to: "assistant:2", relation: "produces_response" })
    ]);
  });

  it("returns null for a non-agent selected request", () => {
    expect(buildToolGraph([requestDetail(1, "2026-06-10T01:00:00.000Z", { ok: true }, null)], 1)).toBeNull();
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
