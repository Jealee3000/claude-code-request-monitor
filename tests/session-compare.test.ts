import { describe, expect, it } from "vitest";
import { buildSessionCompare } from "../src/session-compare.js";
import type { RequestDetail, SessionRecord } from "../src/types.js";

describe("session compare", () => {
  it("compares two sessions and matches repeated prompts", () => {
    const compare = buildSessionCompare(
      sessionRecord("session-current", "2026-06-10T02:00:00.000Z"),
      [
        requestDetail("session-current", 3, "2026-06-10T02:00:00.000Z", {
          model: "claude",
          system: [{ type: "text", text: "Claude Code\nname: edit-skill\ndescription: edit files" }],
          messages: [
            { role: "user", content: "implement viewer compare" },
            { role: "assistant", content: "previous context" },
            { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "file contents" }] }
          ],
          tools: [
            { name: "Read", input_schema: { properties: { file_path: { type: "string" } } } },
            { name: "Edit", input_schema: { properties: { file_path: { type: "string" }, old_string: { type: "string" } } } }
          ]
        }, responseStream("I will edit it.", "Edit", "toolu_edit", '{"file_path":"src/viewer.ts"}')),
        requestDetail("session-current", 4, "2026-06-10T02:05:00.000Z", {
          model: "claude",
          messages: [{ role: "user", content: "new prompt only here" }],
          tools: [{ name: "Read" }]
        }, responseStream("Only current session has this.", null, null, null))
      ],
      sessionRecord("session-baseline", "2026-06-10T01:00:00.000Z"),
      [
        requestDetail("session-baseline", 1, "2026-06-10T01:00:00.000Z", {
          model: "claude",
          system: [{ type: "text", text: "Claude Code\nname: read-skill\ndescription: read files" }],
          messages: [{ role: "user", content: "implement viewer compare" }],
          tools: [{ name: "Read", input_schema: { properties: { file_path: { type: "string" } } } }]
        }, responseStream("I will read it.", "Read", "toolu_read", '{"file_path":"src/viewer.ts"}'))
      ]
    );

    expect(compare).toMatchObject({
      comparable: true,
      current: {
        sessionId: "session-current",
        turnCount: 2,
        toolNames: ["Edit", "Read"]
      },
      baseline: {
        sessionId: "session-baseline",
        turnCount: 1,
        toolNames: ["Read"]
      },
      deltas: {
        turnCount: 1,
        toolCount: 1,
        suspectedSkillCount: 0
      },
      toolDiff: {
        added: ["Edit"],
        removed: []
      },
      matchedPrompts: [
        {
          prompt: "implement viewer compare",
          currentRequestIds: [3],
          baselineRequestIds: [1],
          toolDiff: { added: ["Edit"], removed: [] },
          skillDiff: { added: ["edit-skill"], removed: ["read-skill"] },
          finalResponseChanged: true
        }
      ],
      onlyCurrentPrompts: ["new prompt only here"],
      onlyBaselinePrompts: []
    });
    expect(compare.deltas?.contextChars).toBeGreaterThan(0);
    expect(compare.matchedPrompts[0].contextDelta).toBeGreaterThan(0);
  });

  it("returns a non-comparable result without a baseline session", () => {
    const compare = buildSessionCompare(
      sessionRecord("session-current", "2026-06-10T02:00:00.000Z"),
      [
        requestDetail("session-current", 1, "2026-06-10T02:00:00.000Z", {
          messages: [{ role: "user", content: "first prompt" }],
          tools: [{ name: "Read" }]
        }, null)
      ],
      null,
      []
    );

    expect(compare).toMatchObject({
      comparable: false,
      reason: "No baseline session to compare",
      baseline: null,
      current: {
        sessionId: "session-current",
        turnCount: 1
      }
    });
  });
});

function sessionRecord(id: string, startedAt: string): SessionRecord {
  return {
    id,
    startedAt,
    projectPath: "D:\\code\\demo",
    inspectBody: true,
    watchToken: null,
    claudeSessionId: null
  };
}

function requestDetail(sessionId: string, id: number, startedAt: string, body: unknown, responseBody: string | null): RequestDetail {
  return {
    id,
    sessionId,
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
