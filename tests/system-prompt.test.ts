import { describe, expect, it } from "vitest";
import { buildSystemPromptPreview } from "../src/system-prompt.js";
import type { RequestDetail } from "../src/types.js";

describe("system prompt preview", () => {
  it("extracts system blocks suspected skills and tool schema summaries", () => {
    const preview = buildSystemPromptPreview(requestDetail({
      model: "claude",
      system: [
        {
          type: "text",
          text: [
            "You are Claude Code.",
            "---",
            "name: browser:control-in-app-browser",
            "description: Control the in-app browser for local web targets.",
            "---",
            "Use this skill when localhost needs inspection."
          ].join("\n")
        },
        {
          type: "text",
          text: "General project instructions."
        }
      ],
      tools: [
        {
          name: "Read",
          description: "Read a file from disk",
          input_schema: {
            type: "object",
            properties: { file_path: { type: "string" } },
            required: ["file_path"]
          }
        },
        {
          name: "Edit",
          description: "Edit a file",
          input_schema: {
            type: "object",
            properties: {
              file_path: { type: "string" },
              old_string: { type: "string" },
              new_string: { type: "string" }
            }
          }
        }
      ]
    }));

    expect(preview).toMatchObject({
      requestId: 7,
      model: "claude",
      systemBlockCount: 2,
      suspectedSkillCount: 1,
      toolCount: 2,
      suspectedSkills: [
        {
          name: "browser:control-in-app-browser",
          description: "Control the in-app browser for local web targets."
        }
      ],
      tools: [
        {
          name: "Read",
          descriptionPreview: "Read a file from disk",
          inputSchemaChars: expect.any(Number)
        },
        {
          name: "Edit",
          descriptionPreview: "Edit a file",
          inputSchemaChars: expect.any(Number)
        }
      ]
    });
    expect(preview?.systemChars).toBeGreaterThan(100);
    expect(preview?.totalToolSchemaChars).toBeGreaterThan(100);
    expect(preview?.systemBlocks[0]?.preview).toContain("Claude Code");
  });

  it("returns null for non-agent payloads", () => {
    const preview = buildSystemPromptPreview(requestDetail({ ok: true }));

    expect(preview).toBeNull();
  });
});

function requestDetail(body: unknown): RequestDetail {
  return {
    id: 7,
    sessionId: "session-a",
    startedAt: "2026-06-09T01:00:00.000Z",
    completedAt: null,
    method: "POST",
    host: "api.anthropic.com",
    path: "/v1/messages",
    statusCode: 200,
    durationMs: 10,
    requestBytes: 100,
    responseBytes: 0,
    contentType: "application/json",
    eventCount: 0,
    error: null,
    payload: {
      requestId: 7,
      requestHeadersJson: null,
      requestBodyJson: JSON.stringify(body),
      responseHeadersJson: null,
      responseBodyJson: null
    }
  };
}
