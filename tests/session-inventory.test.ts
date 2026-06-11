import { describe, expect, it } from "vitest";
import { buildSessionInventory } from "../src/session-inventory.js";
import type { RequestDetail } from "../src/types.js";

describe("session inventory", () => {
  it("summarizes tools and suspected skills seen across a monitored session", () => {
    const inventory = buildSessionInventory([
      requestDetail(1, "2026-06-10T01:00:00.000Z", {
        system: [
          {
            type: "text",
            text: "Claude Code\nname: read-skill\ndescription: read files"
          }
        ],
        messages: [{ role: "user", content: "inspect tools" }],
        tools: [
          {
            name: "Read",
            description: "Read a file",
            input_schema: {
              type: "object",
              properties: { file_path: { type: "string" } }
            }
          }
        ]
      }),
      requestDetail(2, "2026-06-10T01:01:00.000Z", {
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
        messages: [{ role: "user", content: "inspect tools" }],
        tools: [
          {
            name: "Read",
            description: "Read a file with optional offset",
            input_schema: {
              type: "object",
              properties: {
                file_path: { type: "string" },
                offset: { type: "number" }
              }
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
      }),
      requestDetail(3, "2026-06-10T01:02:00.000Z", { ok: true })
    ]);

    expect(inventory).toMatchObject({
      requestCount: 3,
      agentRequestCount: 2,
      toolCount: 2,
      skillCount: 2,
      tools: [
        expect.objectContaining({
          name: "Read",
          seenCount: 2,
          firstRequestId: 1,
          lastRequestId: 2,
          schemaChanged: true,
          descriptionPreview: "Read a file with optional offset",
          requestIds: [1, 2]
        }),
        expect.objectContaining({
          name: "Edit",
          seenCount: 1,
          firstRequestId: 2,
          lastRequestId: 2,
          schemaChanged: false,
          requestIds: [2]
        })
      ],
      skills: [
        expect.objectContaining({
          name: "read-skill",
          description: "read files",
          seenCount: 2,
          firstRequestId: 1,
          lastRequestId: 2,
          requestIds: [1, 2]
        }),
        expect.objectContaining({
          name: "edit-skill",
          description: "edit files",
          seenCount: 1,
          firstRequestId: 2,
          lastRequestId: 2,
          requestIds: [2]
        })
      ]
    });
    expect(inventory.tools[0]?.schemaChars).toBeGreaterThan(0);
    expect(inventory.tools[0]?.inputSchemaChars).toBeGreaterThan(0);
    expect(inventory.skills[0]?.chars).toBeGreaterThan(0);
  });
});

function requestDetail(id: number, startedAt: string, body: unknown): RequestDetail {
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
    responseBytes: 100,
    contentType: "application/json",
    eventCount: 0,
    error: null,
    payload: {
      requestId: id,
      requestHeadersJson: null,
      requestBodyJson: JSON.stringify(body),
      responseHeadersJson: null,
      responseBodyJson: null
    }
  };
}
