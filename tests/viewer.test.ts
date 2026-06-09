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
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: [{ type: "tool_use", name: "Read" }] },
        { role: "user", content: "next question" }
      ],
      tools: [{ name: "Read" }, { name: "Edit" }]
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

  it("returns response stream preview for a request", async () => {
    const requests = store.listRequests("session-a");
    const response = await app.inject({ method: "GET", url: `/api/requests/${requests[0].id}/response-preview` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      stream: true,
      assistantText: "I will inspect ",
      usage: { inputTokens: 8, outputTokens: 16 },
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

  it("returns capture diagnostics", async () => {
    const response = await app.inject({ method: "GET", url: "/api/diagnostics" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      totalSessions: 1,
      activeSessions: 1,
      zeroRequestSessions: 0,
      latestRequestAt: "2026-06-09T01:01:00.000Z"
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
    expect(response.body).toContain("Timeline");
    expect(response.body).toContain("Turn");
    expect(response.body).toContain("Diff");
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
    expect(response.body).toContain("Refresh");
    expect(response.body).toContain("setInterval");
    expect(response.body).toContain("refreshRequests");
    expect(response.body).toContain("copyCommand");
    expect(response.body).toContain("loadDiagnostics");
    expect(response.body).toContain("renderTimeline");
    expect(response.body).toContain("renderContextDiff");
    expect(response.body).toContain("responsePreview");
    expect(response.body).toContain("renderResponsePreview");
    expect(response.body).toContain("turnDetail");
    expect(response.body).toContain("renderTurnDetail");
    expect(response.body).toContain("Tool Loop");
    expect(response.body).toContain("renderToolLoops");
  });
});
