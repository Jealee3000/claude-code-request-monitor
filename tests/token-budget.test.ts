import { describe, expect, it } from "vitest";
import { buildTokenBudget } from "../src/token-budget.js";
import type { RequestDetail } from "../src/types.js";

describe("token budget", () => {
  it("summarizes estimated context tokens, captured usage, and turn growth", () => {
    const previous = requestDetail(1, "2026-06-09T01:00:00.000Z", {
      model: "claude",
      system: "Claude Code\nname: read-skill\ndescription: read files",
      messages: [{ role: "user", content: "inspect context" }],
      tools: [{ name: "Read", input_schema: { type: "object" } }]
    }, responseStream(90, 12));
    const current = requestDetail(2, "2026-06-09T01:01:00.000Z", {
      model: "claude",
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
        { role: "user", content: "inspect context" },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_read", name: "Read" }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "file contents" }] },
        { role: "user", content: "inspect context" }
      ],
      tools: [
        { name: "Read", input_schema: { type: "object" } },
        { name: "Edit", input_schema: { type: "object", properties: { file_path: { type: "string" } } } }
      ],
      max_tokens: 4096,
      thinking: { type: "enabled", budget_tokens: 1024 }
    }, responseStream(180, 27));

    const budget = buildTokenBudget([previous, current], 2);

    expect(budget).toMatchObject({
      requestId: 2,
      previousRequestId: 1,
      reason: null,
      latestUserText: "inspect context",
      requestCount: 2,
      model: "claude",
      maxTokens: 4096,
      thinkingBudgetTokens: 1024,
      usage: {
        inputTokens: 180,
        outputTokens: 27
      },
      summary: {
        contextChars: expect.any(Number),
        estimatedContextTokens: expect.any(Number),
        contextDeltaChars: expect.any(Number),
        contextDeltaTokens: expect.any(Number),
        toolSchemaTokens: expect.any(Number),
        toolSchemaPercent: expect.any(Number),
        capturedTurnOutputTokens: 39
      },
      curve: [
        expect.objectContaining({
          requestId: 1,
          stepIndex: 1,
          contextDeltaTokens: null,
          inputTokens: 90,
          outputTokens: 12
        }),
        expect.objectContaining({
          requestId: 2,
          stepIndex: 2,
          inputTokens: 180,
          outputTokens: 27
        })
      ]
    });
    expect(budget.summary.estimatedContextTokens).toBeGreaterThan(0);
    expect(budget.summary.contextDeltaTokens).toBeGreaterThan(0);
    expect(budget.summary.toolSchemaTokens).toBeGreaterThan(0);
    expect(budget.summary.toolSchemaPercent).toBeGreaterThan(0);
    expect(budget.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "system", estimatedTokens: expect.any(Number), group: "primary" }),
      expect.objectContaining({ id: "tools_schema", estimatedTokens: expect.any(Number), group: "primary" }),
      expect.objectContaining({ id: "messages", estimatedTokens: expect.any(Number), group: "primary" }),
      expect.objectContaining({ id: "tool_results", estimatedTokens: expect.any(Number), group: "messages_subsection" })
    ]));
    expect(budget.curve[1]?.contextDeltaTokens).toBeGreaterThan(0);
  });

  it("returns an empty analysis when the selected request is not an agent request", () => {
    const budget = buildTokenBudget([requestDetail(1, "2026-06-09T01:00:00.000Z", { ok: true }, null)], 1);

    expect(budget).toMatchObject({
      requestId: 1,
      previousRequestId: null,
      reason: "No agent payload captured for this request",
      sections: [],
      curve: []
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
      responseHeadersJson: JSON.stringify({ "content-type": "text/event-stream" }),
      responseBodyJson: responseBody === null ? null : JSON.stringify(responseBody)
    }
  };
}

function responseStream(inputTokens: number, outputTokens: number): string {
  return [
    "event: message_start",
    `data: {"type":"message_start","message":{"usage":{"input_tokens":${inputTokens},"output_tokens":1}}}`,
    "",
    "event: content_block_delta",
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
    "",
    "event: message_delta",
    `data: {"type":"message_delta","usage":{"output_tokens":${outputTokens}}}`,
    ""
  ].join("\n");
}
