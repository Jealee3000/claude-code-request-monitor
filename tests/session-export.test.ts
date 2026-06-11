import { describe, expect, it } from "vitest";
import { buildSessionExport } from "../src/session-export.js";
import type { RequestDetail, SessionRecord, TurnAnnotation } from "../src/types.js";

describe("session export", () => {
  it("builds a markdown learning note for an entire monitored session", () => {
    const exportNote = buildSessionExport(
      sessionRecord(),
      [
        requestDetail(1, "2026-06-10T01:00:00.000Z", {
          model: "claude",
          system: [{ type: "text", text: "Claude Code\nname: read-skill\ndescription: read files" }],
          messages: [{ role: "user", content: "inspect src/viewer.ts" }],
          tools: [{ name: "Read", input_schema: { properties: { file_path: { type: "string" } } } }]
        }, responseStream("I will read the file.", "Read", "toolu_read", '{"file_path":"src/viewer.ts"}')),
        requestDetail(2, "2026-06-10T01:01:00.000Z", {
          model: "claude",
          max_tokens: 8192,
          thinking: { type: "enabled", budget_tokens: 2048 },
          system: [{ type: "text", text: "Claude Code\nname: read-skill\ndescription: read files" }],
          messages: [
            { role: "user", content: "inspect src/viewer.ts" },
            { role: "assistant", content: [{ type: "tool_use", id: "toolu_read", name: "Read" }] },
            { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "viewer contents" }] }
          ],
          tools: [
            {
              name: "Read",
              description: "Read a file with offset",
              input_schema: { properties: { file_path: { type: "string" }, offset: { type: "number" } } }
            }
          ]
        }, responseStream("The viewer has tabs.", null, null, null)),
        requestDetail(3, "2026-06-10T01:05:00.000Z", {
          model: "claude",
          messages: [{ role: "user", content: "summarize skills" }],
          tools: [{ name: "Grep", input_schema: { properties: { pattern: { type: "string" } } } }]
        }, responseStream("Skills are loaded from disk.", null, null, null))
      ],
      [
        annotation("session-a", "user:inspect src/viewer.ts", true, ["context", "tool-loop"], "Great tool loop example.")
      ]
    );

    expect(exportNote).toMatchObject({
      sessionId: "session-a",
      filename: expect.stringMatching(/^claude-watch-session-session-a-.*\.md$/),
      markdown: expect.stringContaining("# Claude Watch Session Note")
    });
    expect(exportNote.markdown).toContain("D:\\code\\demo");
    expect(exportNote.markdown).toContain("- Agent turns: 2");
    expect(exportNote.markdown).toContain("## Session Findings");
    expect(exportNote.markdown).toContain("Agent parameters changed");
    expect(exportNote.markdown).toContain("Context grew between agent requests");
    expect(exportNote.markdown).toContain("Tool schema changed");
    expect(exportNote.markdown).toContain("## Turn 1: inspect src/viewer.ts");
    expect(exportNote.markdown).toContain("- Requests: 1, 2");
    expect(exportNote.markdown).toContain("- Tools: Read");
    expect(exportNote.markdown).toContain("- Suspected skills: 1");
    expect(exportNote.markdown).toContain("- Bookmark: yes");
    expect(exportNote.markdown).toContain("- Tags: context, tool-loop");
    expect(exportNote.markdown).toContain("Great tool loop example.");
    expect(exportNote.markdown).toContain("## Turn 2: summarize skills");
    expect(exportNote.markdown).toContain("Skills are loaded from disk.");
  });
});

function sessionRecord(): SessionRecord {
  return {
    id: "session-a",
    startedAt: "2026-06-10T01:00:00.000Z",
    projectPath: "D:\\code\\demo",
    inspectBody: true,
    watchToken: null,
    claudeSessionId: "claude-session-a"
  };
}

function annotation(
  sessionId: string,
  turnKey: string,
  bookmarked: boolean,
  tags: string[],
  note: string
): TurnAnnotation {
  return {
    sessionId,
    turnKey,
    bookmarked,
    tags,
    note,
    updatedAt: "2026-06-10T02:00:00.000Z"
  };
}

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
