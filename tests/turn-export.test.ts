import { describe, expect, it } from "vitest";
import { buildTurnExport } from "../src/turn-export.js";
import type { RequestDetail } from "../src/types.js";

describe("turn export", () => {
  it("builds a markdown learning note for a selected agent turn", () => {
    const exportNote = buildTurnExport([
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        model: "claude",
        system: [{ type: "text", text: "Claude Code\nname: read-skill\ndescription: read files" }],
        messages: [{ role: "user", content: "inspect src/viewer.ts" }],
        tools: [{ name: "Read", input_schema: { properties: { file_path: { type: "string" } } } }]
      }, responseStream("I will read the file.", "Read", "toolu_read", '{"file_path":"src/viewer.ts"}')),
      requestDetail(2, "2026-06-10T01:01:00.000Z", {
        model: "claude",
        system: [{ type: "text", text: "Claude Code\nname: read-skill\ndescription: read files" }],
        messages: [
          { role: "user", content: "inspect src/viewer.ts" },
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_read", name: "Read" }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "viewer contents" }] }
        ],
        tools: [{ name: "Read", input_schema: { properties: { file_path: { type: "string" } } } }]
      }, responseStream("The viewer has tabs.", null, null, null))
    ], 2);

    expect(exportNote).toMatchObject({
      requestId: 2,
      filename: expect.stringMatching(/^claude-watch-turn-2-.*\.md$/),
      markdown: expect.stringContaining("# Claude Watch Turn Note")
    });
    expect(exportNote?.markdown).toContain("inspect src/viewer.ts");
    expect(exportNote?.markdown).toContain("## Agent Insight");
    expect(exportNote?.markdown).toContain("Tool result was fed back into context");
    expect(exportNote?.markdown).toContain("## Replay");
    expect(exportNote?.markdown).toContain("Tool requested: Read");
    expect(exportNote?.markdown).toContain("## Compare");
    expect(exportNote?.markdown).toContain("No previous agent turn to compare");
    expect(exportNote?.markdown).toContain("The viewer has tabs.");
  });

  it("returns null for a non-agent selected request", () => {
    const exportNote = buildTurnExport([requestDetail(1, "2026-06-10T01:00:00.000Z", { ok: true }, null)], 1);

    expect(exportNote).toBeNull();
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
