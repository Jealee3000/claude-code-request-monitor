import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RequestStore } from "../src/store.js";
import { buildViewerServer } from "../src/viewer.js";

let tempDir: string;
let store: RequestStore;
let app: FastifyInstance;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "claude-watch-viewer-"));
  store = new RequestStore(join(tempDir, "requests.sqlite"));
  store.init();
  store.createSession({
    id: "session-a",
    projectPath: "D:\\code\\demo",
    inspectBody: true
  });
  store.logRequest({
    sessionId: "session-a",
    startedAt: "2026-06-09T01:00:00.000Z",
    method: "POST",
    host: "api.anthropic.com",
    path: "/v1/messages",
    statusCode: 200,
    requestBody: { messages: [{ role: "user", content: "hello" }], tools: [{ name: "Read" }] }
  });
  store.logRequest({
    sessionId: "session-a",
    startedAt: "2026-06-09T01:01:00.000Z",
    method: "POST",
    host: "api.anthropic.com",
    path: "/v1/messages",
    statusCode: 200,
    contentType: "text/event-stream",
    requestBody: {
      system: [
        {
          type: "text",
          text: [
            "Claude Code system prompt.",
            "name: browser:control-in-app-browser",
            "description: Control the in-app browser for local web targets."
          ].join("\n")
        }
      ],
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: [{ type: "tool_use", name: "Read" }] },
        { role: "user", content: "next question" }
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
    },
    responseHeaders: { "content-type": "text/event-stream" },
    responseBody: [
      "event: message_start",
      'data: {"type":"message_start","message":{"usage":{"input_tokens":8,"output_tokens":1}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I will inspect "}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_viewer","name":"Read","input":{}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"file_path\\":\\"src/viewer.ts\\"}"}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","usage":{"output_tokens":16}}',
      ""
    ].join("\n")
  });
  const claudeProjectDir = join(tempDir, ".claude", "projects", "D--code-demo");
  mkdirSync(claudeProjectDir, { recursive: true });
  writeFileSync(
    join(claudeProjectDir, "464c8718-4dd5-462d-9523-20f7b51c3d25.jsonl"),
    JSON.stringify({
      type: "last-prompt",
      sessionId: "464c8718-4dd5-462d-9523-20f7b51c3d25",
      lastPrompt: "resume me"
    })
  );
  app = buildViewerServer(store, {
    claudeHome: join(tempDir, ".claude"),
    repoRoot: "D:\\code\\claude-code-network"
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("viewer", () => {
  it("returns health", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("returns sessions", async () => {
    const response = await app.inject({ method: "GET", url: "/api/sessions" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      {
        id: "session-a",
        projectPath: "D:\\code\\demo",
        inspectBody: true
      }
    ]);
  });

  it("returns requests for a session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/sessions/session-a/requests" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.arrayContaining([
      {
        id: expect.any(Number),
        sessionId: "session-a",
        startedAt: expect.any(String),
        completedAt: null,
        method: "POST",
        host: "api.anthropic.com",
        path: "/v1/messages",
        statusCode: 200,
        durationMs: null,
        requestBytes: 0,
        responseBytes: 0,
        contentType: null,
        eventCount: 0,
        error: null
      }
    ]));
  });

  it("returns request detail", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: requests[0].id,
      payload: {
        requestBodyJson: expect.stringContaining("messages")
      }
    });
  });

  it("returns timeline turns for a session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/sessions/session-a/turns" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      {
        latestUserPreview: "next question",
        requestCount: 1,
        toolNames: ["Read", "Edit"]
      },
      {
        latestUserPreview: "hello",
        requestCount: 1,
        toolNames: ["Read"]
      }
    ]);
  });

  it("searches agent requests in a session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/sessions/session-a/search?q=viewer&tool=Read" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      query: "viewer",
      tool: "read",
      total: 1,
      results: [
        {
          latestUserText: "next question",
          toolNames: ["Read", "Edit"],
          suspectedSkillNames: ["browser:control-in-app-browser"],
          matchedFields: expect.arrayContaining(["tool-filter", "tool-input"])
        }
      ]
    });
  });

  it("returns session inventory for tools and skills", async () => {
    const response = await app.inject({ method: "GET", url: "/api/sessions/session-a/inventory" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestCount: 2,
      agentRequestCount: 2,
      toolCount: 2,
      skillCount: 1,
      tools: [
        expect.objectContaining({
          name: "Read",
          seenCount: 2,
          firstRequestId: expect.any(Number),
          lastRequestId: expect.any(Number),
          requestIds: expect.any(Array)
        }),
        expect.objectContaining({
          name: "Edit",
          seenCount: 1,
          firstRequestId: expect.any(Number),
          lastRequestId: expect.any(Number),
          requestIds: expect.any(Array)
        })
      ],
      skills: [
        expect.objectContaining({
          name: "browser:control-in-app-browser",
          description: "Control the in-app browser for local web targets.",
          seenCount: 1
        })
      ]
    });
  });

  it("returns session parameters for agent requests", async () => {
    store.logRequest({
      sessionId: "session-a",
      startedAt: "2026-06-09T01:02:00.000Z",
      method: "POST",
      host: "api.anthropic.com",
      path: "/v1/messages",
      statusCode: 200,
      requestBody: {
        model: "claude-sonnet-4-20250514",
        stream: true,
        max_tokens: 8192,
        temperature: 0,
        tool_choice: { type: "tool", name: "Edit" },
        thinking: { type: "enabled", budget_tokens: 2048 },
        messages: [{ role: "user", content: "parameter check" }],
        tools: [{ name: "Edit" }]
      }
    });

    const response = await app.inject({ method: "GET", url: "/api/sessions/session-a/parameters" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestCount: 3,
      agentRequestCount: 3,
      latest: {
        model: "claude-sonnet-4-20250514",
        stream: true,
        maxTokens: 8192,
        toolChoice: "tool:Edit",
        thinking: "enabled:2048"
      },
      distinct: {
        models: ["claude-sonnet-4-20250514"],
        maxTokens: [8192],
        thinking: ["enabled:2048"],
        toolChoices: ["tool:Edit"]
      },
      snapshots: expect.arrayContaining([
        expect.objectContaining({
          requestId: expect.any(Number),
          changedFields: expect.arrayContaining(["model", "stream", "maxTokens", "toolChoice", "thinking"])
        })
      ])
    });
  });

  it("returns context diff for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/context-diff` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      comparable: true,
      tools: { added: ["Edit"] },
      latestUserTextChanged: true,
      currentLatestUserText: "next question"
    });
  });

  it("returns context waterfall for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/context-waterfall` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestId: requests[0].id,
      previousRequestId: requests[1].id,
      reason: null,
      summary: {
        messageCount: 3,
        toolCount: 2,
        suspectedSkillCount: 1
      },
      segments: expect.arrayContaining([
        expect.objectContaining({ id: "system", group: "primary" }),
        expect.objectContaining({ id: "tools_schema", group: "primary", itemCount: 2 }),
        expect.objectContaining({ id: "messages", group: "primary", itemCount: 3 }),
        expect.objectContaining({ id: "skills", parentId: "system", itemCount: 1 }),
        expect.objectContaining({ id: "latest_user_input", parentId: "messages", preview: "next question" }),
        expect.objectContaining({ id: "assistant_history", parentId: "messages", itemCount: 1 })
      ])
    });
  });

  it("returns token budget for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/token-budget` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestId: requests[0].id,
      previousRequestId: requests[1].id,
      reason: null,
      latestUserText: "next question",
      requestCount: 1,
      usage: {
        inputTokens: 8,
        outputTokens: 16
      },
      summary: {
        estimatedContextTokens: expect.any(Number),
        contextDeltaTokens: expect.any(Number),
        toolSchemaTokens: expect.any(Number),
        toolSchemaPercent: expect.any(Number),
        capturedTurnOutputTokens: 16
      },
      sections: expect.arrayContaining([
        expect.objectContaining({ id: "system", estimatedTokens: expect.any(Number) }),
        expect.objectContaining({ id: "tools_schema", estimatedTokens: expect.any(Number) }),
        expect.objectContaining({ id: "messages", estimatedTokens: expect.any(Number) })
      ]),
      curve: [
        expect.objectContaining({
          requestId: requests[0].id,
          stepIndex: 1,
          inputTokens: 8,
          outputTokens: 16
        })
      ]
    });
  });

  it("returns response stream preview for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/response-preview` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      stream: true,
      assistantText: "I will inspect ",
      usage: { inputTokens: 8, outputTokens: 16 },
      layers: {
        finalText: {
          text: "I will inspect "
        },
        rawEvents: {
          eventCount: 5
        }
      },
      toolUses: [
        {
          id: "toolu_viewer",
          name: "Read",
          inputJson: '{"file_path":"src/viewer.ts"}'
        }
      ]
    });
  });

  it("returns turn detail for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/turn-detail` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      latestUserText: "next question",
      requestIds: [requests[0].id],
      requestCount: 1,
      finalAssistantText: "I will inspect ",
      toolLoops: [],
      toolUses: [
        {
          requestId: requests[0].id,
          name: "Read",
          inputJson: '{"file_path":"src/viewer.ts"}'
        }
      ],
      steps: [
        {
          requestId: requests[0].id,
          stepIndex: 1,
          contextDelta: null,
          responseToolUseCount: 1
        }
      ]
    });
  });

  it("saves and returns turn annotations for a selected request", async () => {
    const requests = store.listRequests("session-a");
    const save = await app.inject({
      method: "PUT",
      url: `/api/requests/${requests[0].id}/turn-annotation`,
      payload: {
        bookmarked: true,
        tags: ["context", "skill"],
        note: "Useful context assembly example."
      }
    });

    expect(save.statusCode).toBe(200);
    expect(save.json()).toMatchObject({
      sessionId: "session-a",
      turnKey: "user:next question",
      bookmarked: true,
      tags: ["context", "skill"],
      note: "Useful context assembly example."
    });

    const get = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/turn-annotation` });

    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({
      bookmarked: true,
      tags: ["context", "skill"],
      note: "Useful context assembly example."
    });
  });

  it("returns a session-level markdown export", async () => {
    const requests = store.listRequests("session-a");
    await app.inject({
      method: "PUT",
      url: `/api/requests/${requests[0].id}/turn-annotation`,
      payload: {
        bookmarked: true,
        tags: ["context"],
        note: "Session export should include this note."
      }
    });

    const response = await app.inject({ method: "GET", url: "/api/sessions/session-a/export" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionId: "session-a",
      filename: expect.stringMatching(/^claude-watch-session-session-a-.*\.md$/),
      markdown: expect.stringContaining("# Claude Watch Session Note")
    });
    expect(response.json().markdown).toContain("next question");
    expect(response.json().markdown).toContain("Session export should include this note.");
  });

  it("returns session compare for repeated prompts across sessions", async () => {
    store.createSession({
      id: "session-baseline",
      projectPath: "D:\\code\\demo",
      inspectBody: true
    });
    store.logRequest({
      sessionId: "session-baseline",
      startedAt: "2026-06-09T00:30:00.000Z",
      method: "POST",
      host: "api.anthropic.com",
      path: "/v1/messages",
      statusCode: 200,
      contentType: "text/event-stream",
      requestBody: {
        system: [{ type: "text", text: "Claude Code\nname: read-skill\ndescription: read files" }],
        messages: [{ role: "user", content: "next question" }],
        tools: [{ name: "Read" }]
      },
      responseBody: "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"baseline answer\"}}"
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/sessions/session-a/compare?baselineSessionId=session-baseline"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      comparable: true,
      current: {
        sessionId: "session-a",
        turnCount: 2
      },
      baseline: {
        sessionId: "session-baseline",
        turnCount: 1
      },
      matchedPrompts: [
        {
          prompt: "next question",
          toolDiff: { added: ["Edit"], removed: [] },
          skillDiff: {
            added: ["browser:control-in-app-browser"],
            removed: ["read-skill"]
          },
          finalResponseChanged: true
        }
      ]
    });
  });

  it("returns turn compare for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/turn-compare` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      comparable: true,
      current: {
        requestIds: [requests[0].id],
        latestUserText: "next question",
        toolNames: ["Read", "Edit"],
        suspectedSkillNames: ["browser:control-in-app-browser"]
      },
      baseline: {
        requestIds: [requests[1].id],
        latestUserText: "hello",
        toolNames: ["Read"]
      },
      deltas: {
        requestCount: 0,
        toolCount: 1
      },
      toolDiff: {
        added: ["Edit"],
        unchanged: ["Read"]
      }
    });
  });

  it("returns markdown turn export for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/turn-export` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestId: requests[0].id,
      filename: expect.stringMatching(/^claude-watch-turn-\d+-.*\.md$/),
      markdown: expect.stringContaining("# Claude Watch Turn Note")
    });
    expect(response.json().markdown).toContain("next question");
    expect(response.json().markdown).toContain("## Agent Insight");
    expect(response.json().markdown).toContain("## Replay");
  });

  it("returns system prompt preview for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/system-prompt` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestId: requests[0].id,
      model: null,
      systemBlockCount: 1,
      suspectedSkillCount: 1,
      toolCount: 2,
      suspectedSkills: [
        {
          name: "browser:control-in-app-browser",
          description: "Control the in-app browser for local web targets."
        }
      ],
      tools: [
        { name: "Read", descriptionPreview: "Read a file from disk" },
        { name: "Edit", descriptionPreview: "Edit a file" }
      ]
    });
  });

  it("returns turn replay for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/turn-replay` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      latestUserText: "next question",
      requestCount: 1,
      summary: {
        toolUseCount: 1,
        toolResultCount: 0
      },
      events: [
        { kind: "user_prompt", title: "User prompt" },
        { kind: "request_context", requestId: requests[0].id },
        { kind: "assistant_response", requestId: requests[0].id },
        { kind: "tool_use", requestId: requests[0].id, title: "Tool requested: Read" }
      ]
    });
  });

  it("returns tool graph for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/tool-graph` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      latestUserText: "next question",
      summary: {
        requestCount: 1,
        toolUseCount: 1,
        toolResultCount: 0
      },
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: "prompt", kind: "user_prompt" }),
        expect.objectContaining({ kind: "request_context", requestId: requests[0].id }),
        expect.objectContaining({ kind: "assistant_response", requestId: requests[0].id }),
        expect.objectContaining({ kind: "tool_use", requestId: requests[0].id, toolName: "Read" })
      ]),
      edges: expect.arrayContaining([
        expect.objectContaining({ from: "prompt", relation: "anchors" }),
        expect.objectContaining({ relation: "produces_response" }),
        expect.objectContaining({ relation: "requests_tool" })
      ])
    });
  });

  it("returns agent insight for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/agent-insight` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      latestUserText: "next question",
      requestCount: 1,
      headline: expect.stringContaining("1 requests"),
      metrics: {
        toolUseCount: 1,
        toolResultCount: 0,
        toolCount: 2,
        suspectedSkillCount: 1,
        finalAssistantPreview: "I will inspect "
      },
      insights: expect.arrayContaining([
        expect.objectContaining({ kind: "context" }),
        expect.objectContaining({ kind: "risk", title: "Tool request has no captured result yet" }),
        expect.objectContaining({ kind: "skills" }),
        expect.objectContaining({ kind: "tools" }),
        expect.objectContaining({ kind: "response" })
      ])
    });
  });

  it("returns capture diagnostics", async () => {
    const response = await app.inject({ method: "GET", url: "/api/diagnostics" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      totalSessions: 1,
      activeSessions: 1,
      zeroRequestSessions: 0,
      latestRequestAt: "2026-06-09T01:01:00.000Z",
      sessionChecks: [
        {
          sessionId: "session-a",
          status: "capturing",
          inspectBody: true,
          watchTokenPresent: false,
          requestCount: 2
        }
      ]
    });
  });

  it("deletes sessions and their captured logs", async () => {
    const response = await app.inject({ method: "DELETE", url: "/api/sessions/session-a" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionId: "session-a",
      deleted: true,
      requestCount: 2,
      payloadCount: 2
    });
    expect((await app.inject({ method: "GET", url: "/api/sessions" })).json()).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/api/sessions/session-a/requests" })).json()).toEqual([]);
  });

  it("returns a no-op result when deleting a missing session", async () => {
    const response = await app.inject({ method: "DELETE", url: "/api/sessions/missing" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sessionId: "missing",
      deleted: false,
      requestCount: 0,
      payloadCount: 0
    });
  });

  it("creates watch sessions from the local API", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/watch-sessions",
      payload: {
        projectPath: "D:\\code\\demo",
        inspectBody: true,
        claudeSessionId: "464c8718-4dd5-462d-9523-20f7b51c3d25"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectPath: "D:\\code\\demo",
      inspectBody: true,
      claudeSessionId: "464c8718-4dd5-462d-9523-20f7b51c3d25",
      watchToken: expect.any(String)
    });
  });

  it("uses the server inspect-body mode when creating watch sessions", async () => {
    const metadataOnlyApp = buildViewerServer(store, { inspectBody: false });
    const response = await metadataOnlyApp.inject({
      method: "POST",
      url: "/api/watch-sessions",
      payload: {
        projectPath: "D:\\code\\metadata-only",
        inspectBody: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectPath: "D:\\code\\metadata-only",
      inspectBody: false
    });
  });

  it("returns local Claude sessions", async () => {
    const response = await app.inject({ method: "GET", url: "/api/claude-sessions" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      {
        projectPath: "D:\\code\\demo",
        sessionId: "464c8718-4dd5-462d-9523-20f7b51c3d25",
        latestPrompt: "resume me"
      }
    ]);
  });

  it("returns viewer html", async () => {
    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("claude-watch-root");
    expect(response.body).toContain("Overview");
    expect(response.body).toContain("Insight");
    expect(response.body).toContain("Inventory");
    expect(response.body).toContain("Params");
    expect(response.body).toContain("Compare");
    expect(response.body).toContain("Export");
    expect(response.body).toContain("Replay");
    expect(response.body).toContain("Tool Graph");
    expect(response.body).toContain("Timeline");
    expect(response.body).toContain("Turn");
    expect(response.body).toContain("Diff");
    expect(response.body).toContain("Waterfall");
    expect(response.body).toContain("Budget");
    expect(response.body).toContain("System");
    expect(response.body).toContain("Diagnostics");
    expect(response.body).toContain("Agent");
    expect(response.body).toContain("Headers");
    expect(response.body).toContain("Payload");
    expect(response.body).toContain("Response");
    expect(response.body).toContain("Raw");
    expect(response.body).toContain("json-tree");
    expect(response.body).toContain("Claude Sessions");
    expect(response.body).toContain("left-tabs");
    expect(response.body).toContain('data-left-tab="monitor"');
    expect(response.body).toContain('data-left-tab="claude"');
    expect(response.body).toContain("setLeftTab");
    expect(response.body).toContain("deleteSession");
    expect(response.body).toContain("confirmDeleteSession");
    expect(response.body).toContain("Delete");
    expect(response.body).toContain("Refresh");
    expect(response.body).toContain("Traffic");
    expect(response.body).toContain('data-request-mode="turns"');
    expect(response.body).toContain('data-request-mode="requests"');
    expect(response.body).toContain("requestMode: 'turns'");
    expect(response.body).toContain("setRequestMode");
    expect(response.body).toContain("renderTurnList");
    expect(response.body).toContain("renderRawRequests");
    expect(response.body).toContain("Agent search");
    expect(response.body).toContain("requestSearchResults");
    expect(response.body).toContain("searchRequests");
    expect(response.body).toContain("renderSearchResults");
    expect(response.body).toContain("setInterval");
    expect(response.body).toContain("refreshRequests");
    expect(response.body).toContain("sessionCompare");
    expect(response.body).toContain("renderSessionCompare");
    expect(response.body).toContain("sessionInventory");
    expect(response.body).toContain("renderSessionInventory");
    expect(response.body).toContain("sessionParameters");
    expect(response.body).toContain("renderSessionParameters");
    expect(response.body).toContain("Matched prompts");
    expect(response.body).toContain("copyCommand");
    expect(response.body).toContain("loadDiagnostics");
    expect(response.body).toContain("renderSessionChecks");
    expect(response.body).toContain("Capture checks");
    expect(response.body).toContain("watch token");
    expect(response.body).toContain("renderTimeline");
    expect(response.body).toContain("renderContextDiff");
    expect(response.body).toContain("contextWaterfall");
    expect(response.body).toContain("renderContextWaterfall");
    expect(response.body).toContain("tokenBudget");
    expect(response.body).toContain("renderTokenBudget");
    expect(response.body).toContain("responsePreview");
    expect(response.body).toContain("renderResponsePreview");
    expect(response.body).toContain("Readable response");
    expect(response.body).toContain("Raw events");
    expect(response.body).toContain("renderResponseLayerDetails");
    expect(response.body).toContain("turnDetail");
    expect(response.body).toContain("renderTurnDetail");
    expect(response.body).toContain("turnAnnotation");
    expect(response.body).toContain("saveTurnAnnotation");
    expect(response.body).toContain("Bookmark");
    expect(response.body).toContain("Tags");
    expect(response.body).toContain("Notes");
    expect(response.body).toContain("sessionExport");
    expect(response.body).toContain("copySessionMarkdownExport");
    expect(response.body).toContain("Copy Session Markdown");
    expect(response.body).toContain("Tool Loop");
    expect(response.body).toContain("renderToolLoops");
    expect(response.body).toContain("systemPrompt");
    expect(response.body).toContain("renderSystemPrompt");
    expect(response.body).toContain("turnReplay");
    expect(response.body).toContain("renderTurnReplay");
    expect(response.body).toContain("toolGraph");
    expect(response.body).toContain("renderToolGraph");
    expect(response.body).toContain("agentInsight");
    expect(response.body).toContain("renderAgentInsight");
    expect(response.body).toContain("turnCompare");
    expect(response.body).toContain("renderTurnCompare");
    expect(response.body).toContain("turnExport");
    expect(response.body).toContain("renderTurnExport");
    expect(response.body).toContain("copyMarkdownExport");
  });
});
