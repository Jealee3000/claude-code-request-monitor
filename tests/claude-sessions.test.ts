import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listLocalClaudeSessions } from "../src/claude-sessions.js";

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `claude-watch-local-sessions-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("local Claude session discovery", () => {
  it("lists top-level project sessions with decoded Windows project paths and latest prompt", () => {
    const projectDir = join(tempDir, ".claude", "projects", "D--code-sso-hub");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "464c8718-4dd5-462d-9523-20f7b51c3d25.jsonl"),
      [
        JSON.stringify({
          type: "user",
          sessionId: "464c8718-4dd5-462d-9523-20f7b51c3d25",
          message: { role: "user", content: [{ type: "text", text: "first prompt" }] }
        }),
        JSON.stringify({
          type: "last-prompt",
          sessionId: "464c8718-4dd5-462d-9523-20f7b51c3d25",
          lastPrompt: "latest prompt"
        })
      ].join("\n")
    );

    const sessions = listLocalClaudeSessions(join(tempDir, ".claude"));

    expect(sessions).toMatchObject([
      {
        sessionId: "464c8718-4dd5-462d-9523-20f7b51c3d25",
        projectPath: "D:\\code\\sso-hub",
        latestPrompt: "latest prompt"
      }
    ]);
  });

  it("ignores nested subagent jsonl files", () => {
    const subagentDir = join(
      tempDir,
      ".claude",
      "projects",
      "D--code-sso-hub",
      "464c8718-4dd5-462d-9523-20f7b51c3d25",
      "subagents"
    );
    mkdirSync(subagentDir, { recursive: true });
    writeFileSync(join(subagentDir, "agent-a.jsonl"), JSON.stringify({ type: "last-prompt", lastPrompt: "agent" }));

    expect(listLocalClaudeSessions(join(tempDir, ".claude"))).toEqual([]);
  });
});
