import { describe, expect, it } from "vitest";
import { buildSessionFindings } from "../src/session-findings.js";
import type { RequestDetail } from "../src/types.js";

describe("session findings", () => {
  it("highlights learning-worthy agent changes and risks across a session", () => {
    const findings = buildSessionFindings([
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        model: "claude-sonnet-4-20250514",
        stream: true,
        max_tokens: 4096,
        tool_choice: { type: "auto" },
        thinking: { type: "enabled", budget_tokens: 1024 },
        messages: [{ role: "user", content: "unresolved tool" }],
        tools: [
          {
            name: "Read",
            description: "Read a file",
            input_schema: { type: "object", properties: { file_path: { type: "string" } } }
          }
        ]
      }, responseToolUse("Read")),
      requestDetail(2, "2026-06-10T01:01:00.000Z", {
        model: "claude-sonnet-4-20250514",
        stream: true,
        max_tokens: 8192,
        tool_choice: { type: "tool", name: "Edit" },
        thinking: { type: "enabled", budget_tokens: 2048 },
        messages: [
          { role: "user", content: "inspect findings" },
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_read", name: "Read" }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "x".repeat(9000) }] }
        ],
        tools: [
          {
            name: "Read",
            description: "Read a file with offset",
            input_schema: {
              type: "object",
              properties: { file_path: { type: "string" }, offset: { type: "number" } }
            }
          },
          {
            name: "Edit",
            description: "Edit a file",
            input_schema: { type: "object", properties: { file_path: { type: "string" } } }
          }
        ]
      }, null),
      requestDetail(3, "2026-06-10T01:02:00.000Z", { ok: true }, null)
    ]);

    expect(findings).toMatchObject({
      requestCount: 3,
      agentRequestCount: 2,
      findingCount: expect.any(Number),
      warningCount: expect.any(Number),
      findings: expect.arrayContaining([
        expect.objectContaining({
          kind: "parameters",
          severity: "info",
          title: "Agent parameters changed",
          requestId: 2,
          values: expect.objectContaining({
            changedFields: expect.stringContaining("maxTokens")
          })
        }),
        expect.objectContaining({
          kind: "context",
          severity: "info",
          title: "Context grew between agent requests",
          requestId: 2
        }),
        expect.objectContaining({
          kind: "tools",
          severity: "warning",
          title: "Tool schema changed",
          requestId: 2,
          values: expect.objectContaining({
            toolName: "Read"
          })
        }),
        expect.objectContaining({
          kind: "risk",
          severity: "warning",
          title: "Tool request has no captured result yet",
          requestId: 1
        })
      ])
    });
    expect(findings.findingCount).toBeGreaterThanOrEqual(4);
    expect(findings.warningCount).toBeGreaterThanOrEqual(2);
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

function responseToolUse(name: string): string {
  return [
    "event: content_block_start",
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_${name}","name":"${name}","input":{}}}`,
    "",
    "event: content_block_delta",
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"file_path\\":\\"src/viewer.ts\\"}"}}',
    ""
  ].join("\n");
}
