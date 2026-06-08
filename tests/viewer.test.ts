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
    method: "POST",
    host: "api.anthropic.com",
    path: "/v1/messages",
    statusCode: 200,
    requestBody: { messages: [{ role: "user", content: "hello" }] }
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
    expect(response.json()).toMatchObject([
      {
        method: "POST",
        host: "api.anthropic.com",
        path: "/v1/messages"
      }
    ]);
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
  });
});
