import { describe, expect, it } from "vitest";
import { buildTurnDetail } from "../src/turn-detail.js";
import type { RequestDetail } from "../src/types.js";

describe("turn detail", () => {
  it("builds a step-by-step detail for the selected agent turn", () => {
    const detail = buildTurnDetail([
      requestDetail(1, "2026-06-09T01:00:00.000Z", {
        model: "claude",
        messages: [{ role: "user", content: "inspect this file" }],
        tools: [{ name: "Read", input_schema: { properties: { file_path: { type: "string" } } } }]
      }, responseStream("I will inspect it.", "Read", '{"file_path":"src/viewer.ts"}')),
      requestDetail(2, "2026-06-09T01:01:00.000Z", {
        model: "claude",
        messages: [
          { role: "user", content: "inspect this file" },
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "Read" }] },
          { role: "user", content: [{ type: "tool_result", content: "viewer contents" }] }
        ],
        tools: [
          { name: "Read", input_schema: { properties: { file_path: { type: "string" } } } },
          { name: "Edit", input_schema: { properties: { file_path: { type: "string" }, old_string: { type: "string" } } } }
        ]
      }, responseStream("The viewer renders requests.", "Edit", '{"file_path":"src/viewer.ts","old_string":"Response"}')),
      requestDetail(3, "2026-06-09T01:02:00.000Z", {
        model: "claude",
        messages: [{ role: "user", content: "different turn" }],
        tools: [{ name: "Bash" }]
      }, responseStream("Different answer.", null, null))
    ], 2);

    expect(detail).toMatchObject({
      latestUserText: "inspect this file",
      requestIds: [1, 2],
      requestCount: 2,
      finalAssistantText: "The viewer renders requests.",
      toolUses: [
        { requestId: 1, name: "Read", inputJson: '{"file_path":"src/viewer.ts"}' },
        { requestId: 2, name: "Edit", inputJson: '{"file_path":"src/viewer.ts","old_string":"Response"}' }
      ],
      steps: [
        {
          requestId: 1,
          stepIndex: 1,
          contextDelta: null,
          responseAssistantText: "I will inspect it.",
          responseToolUseCount: 1
        },
        {
          requestId: 2,
          stepIndex: 2,
          contextDelta: expect.any(Number),
          responseAssistantText: "The viewer renders requests.",
          responseToolUseCount: 1
        }
      ]
    });
    expect(detail?.steps[1]?.contextDelta).toBeGreaterThan(0);
  });

  it("returns null when the selected request is not part of an agent turn", () => {
    const detail = buildTurnDetail([requestDetail(1, "2026-06-09T01:00:00.000Z", { ok: true }, null)], 1);

    expect(detail).toBeNull();
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
      responseHeadersJson: JSON.stringify({ "content-type": "text/event-stream" }),
      responseBodyJson: responseBody === null ? null : JSON.stringify(responseBody)
    }
  };
}

function responseStream(text: string, toolName: string | null, inputJson: string | null): string {
  const frames = [
    ["event: content_block_delta", JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })]
  ];

  if (toolName && inputJson) {
    frames.push(
      ["event: content_block_start", JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: `toolu_${toolName}`, name: toolName, input: {} } })],
      ["event: content_block_delta", JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: inputJson } })]
    );
  }

  return frames.map(([event, data]) => `${event}\ndata: ${data}`).join("\n\n");
}
