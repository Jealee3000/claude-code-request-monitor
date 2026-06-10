import { describe, expect, it } from "vitest";
import { buildTurnCompare } from "../src/turn-compare.js";
import type { RequestDetail } from "../src/types.js";

describe("turn compare", () => {
  it("compares the selected turn with the previous agent turn by default", () => {
    const compare = buildTurnCompare([
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        model: "claude",
        system: [{ type: "text", text: "Claude Code\nname: read-skill\ndescription: read files" }],
        messages: [{ role: "user", content: "inspect src/viewer.ts" }],
        tools: [{ name: "Read", input_schema: { properties: { file_path: { type: "string" } } } }]
      }, responseStream("I will read the file.", "Read", "toolu_read", '{"file_path":"src/viewer.ts"}')),
      requestDetail(2, "2026-06-10T01:01:00.000Z", {
        model: "claude",
        system: [{ type: "text", text: "Claude Code\nname: edit-skill\ndescription: edit files" }],
        messages: [{ role: "user", content: "update src/viewer.ts" }],
        tools: [
          { name: "Read", input_schema: { properties: { file_path: { type: "string" } } } },
          { name: "Edit", input_schema: { properties: { file_path: { type: "string" }, old_string: { type: "string" } } } }
        ]
      }, responseStream("I will edit the viewer.", "Edit", "toolu_edit", '{"file_path":"src/viewer.ts"}'))
    ], 2);

    expect(compare).toMatchObject({
      comparable: true,
      current: {
        requestIds: [2],
        latestUserText: "update src/viewer.ts",
        toolNames: ["Read", "Edit"],
        suspectedSkillNames: ["edit-skill"],
        finalAssistantPreview: "I will edit the viewer."
      },
      baseline: {
        requestIds: [1],
        latestUserText: "inspect src/viewer.ts",
        toolNames: ["Read"],
        suspectedSkillNames: ["read-skill"],
        finalAssistantPreview: "I will read the file."
      },
      deltas: {
        requestCount: 0,
        toolCount: 1,
        suspectedSkillCount: 0,
        toolUseCount: 0,
        toolResultCount: 0
      },
      toolDiff: {
        added: ["Edit"],
        removed: []
      },
      skillDiff: {
        added: ["edit-skill"],
        removed: ["read-skill"]
      },
      finalResponseChanged: true
    });
    expect(compare?.deltas?.contextChars).toBeGreaterThan(0);
    expect(compare?.headline).toContain("+1 tools");
  });

  it("returns a non-comparable result when no baseline turn exists", () => {
    const compare = buildTurnCompare([
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        messages: [{ role: "user", content: "first turn" }],
        tools: [{ name: "Read" }]
      }, null)
    ], 1);

    expect(compare).toMatchObject({
      comparable: false,
      reason: "No previous agent turn to compare",
      baseline: null,
      current: {
        latestUserText: "first turn"
      }
    });
  });

  it("returns null for a non-agent selected request", () => {
    const compare = buildTurnCompare([requestDetail(1, "2026-06-10T01:00:00.000Z", { ok: true }, null)], 1);

    expect(compare).toBeNull();
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
