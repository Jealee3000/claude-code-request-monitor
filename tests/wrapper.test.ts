import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";

let server: Server | undefined;

afterEach(async () => {
  if (server?.listening) {
    server.close();
    await once(server, "close");
  }
  server = undefined;
});

describe("claude-watch wrapper", () => {
  it("fails fast when the viewer port is already occupied", async () => {
    server = createServer((request, response) => {
      if (request.url === "/healthz") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("old watcher");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ".\\scripts\\claude-watch.ps1",
        "-NoClaude",
        "-ViewerPort",
        String(address.port),
        "-ProxyPort",
        String(address.port + 1)
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 15_000
      }
    );

    expect(result.status).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("already in use");
    expect(output).toContain("-RestartWatcher");
  });
});
