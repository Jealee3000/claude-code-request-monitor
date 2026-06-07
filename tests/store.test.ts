import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RequestStore } from "../src/store.js";

let tempDir: string;
let store: RequestStore;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "claude-watch-store-"));
  store = new RequestStore(join(tempDir, "requests.sqlite"));
  store.init();
});

afterEach(() => {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("RequestStore", () => {
  it("creates and lists sessions", () => {
    const session = store.createSession({
      id: "session-a",
      projectPath: "D:\\code\\demo",
      inspectBody: false
    });

    expect(session.id).toBe("session-a");
    expect(store.listSessions()).toEqual([session]);
  });

  it("logs metadata without payload rows by default", () => {
    store.createSession({
      id: "session-a",
      projectPath: "D:\\code\\demo",
      inspectBody: false
    });

    const request = store.logRequest({
      sessionId: "session-a",
      method: "CONNECT",
      host: "api.anthropic.com",
      path: "api.anthropic.com:443",
      statusCode: 200,
      durationMs: 12
    });

    expect(store.listRequests("session-a")).toHaveLength(1);
    expect(store.getRequestDetail(request.id)?.payload).toBeNull();
  });

  it("stores redacted payloads when provided", () => {
    store.createSession({
      id: "session-a",
      projectPath: "D:\\code\\demo",
      inspectBody: true
    });

    const request = store.logRequest({
      sessionId: "session-a",
      method: "POST",
      host: "api.anthropic.com",
      path: "/v1/messages",
      statusCode: 200,
      contentType: "application/json",
      requestHeaders: {
        Authorization: "Bearer secret"
      },
      requestBody: {
        apiKey: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
        messages: [{ role: "user", content: "hello" }]
      },
      responseBody: {
        usage: { input_tokens: 10 }
      }
    });

    const detail = store.getRequestDetail(request.id);

    expect(detail?.payload?.requestHeadersJson).toContain("[REDACTED]");
    expect(detail?.payload?.requestBodyJson).toContain("[REDACTED]");
    expect(detail?.payload?.requestBodyJson).toContain("messages");
    expect(detail?.payload?.responseBodyJson).toContain("input_tokens");
  });

  it("returns undefined for missing request detail", () => {
    expect(store.getRequestDetail(404)).toBeUndefined();
  });
});
