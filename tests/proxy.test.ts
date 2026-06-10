import http from "node:http";
import net, { type Server } from "node:net";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleConnectRequest } from "../src/proxy.js";
import type { RequestStore } from "../src/store.js";
import type { MonitorConfig } from "../src/types.js";

let upstreamServer: Server | undefined;

afterEach(async () => {
  if (upstreamServer?.listening) {
    upstreamServer.close();
    await once(upstreamServer, "close");
  }
  upstreamServer = undefined;
});

describe("proxy CONNECT handling", () => {
  it("does not crash when the client tunnel socket resets", async () => {
    upstreamServer = net.createServer((socket) => {
      socket.on("error", () => {});
    });
    upstreamServer.listen(0, "127.0.0.1");
    await once(upstreamServer, "listening");

    const address = upstreamServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    const clientSocket = new PassThrough();
    const store = {
      getSessionByWatchToken: () => undefined,
      logRequest: vi.fn()
    } as unknown as RequestStore;

    handleConnectRequest(
      monitorConfig(),
      store,
      {
        url: `127.0.0.1:${address.port}`,
        headers: {}
      } as http.IncomingMessage,
      clientSocket,
      Buffer.alloc(0)
    );

    expect(() => {
      clientSocket.emit("error", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));
    }).not.toThrow();
  });
});

function monitorConfig(): MonitorConfig {
  return {
    host: "127.0.0.1",
    viewerPort: 43110,
    proxyPort: 43111,
    dataDir: ".claude-watch",
    dbPath: ".claude-watch/requests.sqlite",
    sessionId: "session-test",
    projectPath: "D:\\code\\demo",
    inspectBody: false,
    redactionConfigPath: null,
    redactionRules: {}
  };
}
