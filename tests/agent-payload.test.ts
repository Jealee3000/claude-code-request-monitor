import { describe, expect, it } from "vitest";
import { extractAgentPayload } from "../src/agent-payload.js";
import type { RequestDetail } from "../src/types.js";

describe("agent payload extraction", () => {
  it("extracts agent-focused fields from a captured request detail", () => {
    const detail = requestDetail({
      model: "claude-sonnet",
      system: "name: test-skill\ndescription: useful",
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: [{ type: "tool_use", name: "Read" }] },
        { role: "user", content: [{ type: "text", text: "latest question" }] }
      ],
      tools: [{ name: "Read", input_schema: { type: "object" } }]
    });

    expect(extractAgentPayload(detail)).toMatchObject({
      requestId: 42,
      model: "claude-sonnet",
      latestUserText: "latest question",
      messageCount: 3,
      toolNames: ["Read"],
      toolUseCount: 1,
      toolResultCount: 0,
      suspectedSkillCount: 1
    });
  });

  it("returns null when no JSON agent payload exists", () => {
    const detail = requestDetail(null);

    expect(extractAgentPayload(detail)).toBeNull();
  });
});

function requestDetail(body: unknown): RequestDetail {
  return {
    id: 42,
    sessionId: "session-a",
    startedAt: "2026-06-09T01:00:00.000Z",
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
    payload: body === null ? null : {
      requestId: 42,
      requestHeadersJson: null,
      requestBodyJson: JSON.stringify(body),
      responseHeadersJson: null,
      responseBodyJson: null
    }
  };
}
