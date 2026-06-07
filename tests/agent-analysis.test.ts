import { describe, expect, it } from "vitest";
import { analyzeAgentRequest } from "../src/agent-analysis.js";

describe("agent request analysis", () => {
  it("summarizes AI-agent-relevant request parameters", () => {
    const summary = analyzeAgentRequest({
      model: "claude-sonnet-4-20250514",
      system: [
        { type: "text", text: "You are Claude Code." },
        { type: "text", text: "---\nname: debugging\ndescription: debug workflow" }
      ],
      messages: [
        { role: "user", content: "fix this" },
        {
          role: "assistant",
          content: [{ type: "tool_use", name: "Read", input: { file_path: "a.ts" } }]
        },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: "file" }] }
      ],
      tools: [
        {
          name: "Read",
          description: "Read a file",
          input_schema: { type: "object", properties: { file_path: { type: "string" } } }
        },
        {
          name: "Bash",
          description: "Run shell",
          input_schema: { type: "object", properties: { command: { type: "string" } } }
        }
      ],
      tool_choice: { type: "auto" },
      thinking: { type: "enabled", budget_tokens: 1024 },
      stream: true,
      max_tokens: 4096,
      temperature: 0.2
    });

    expect(summary).not.toBeNull();
    if (!summary) {
      throw new Error("Expected agent request summary");
    }

    expect(summary).toMatchObject({
      model: "claude-sonnet-4-20250514",
      stream: true,
      maxTokens: 4096,
      temperature: 0.2,
      toolChoice: "auto",
      thinking: "enabled:1024",
      messageCount: 3,
      messageRoles: { user: 2, assistant: 1 },
      toolCount: 2,
      toolNames: ["Read", "Bash"],
      toolUseCount: 1,
      toolResultCount: 1,
      suspectedSkillCount: 1
    });
    expect(summary.systemChars).toBeGreaterThan(10);
    expect(summary.estimatedContextChars).toBeGreaterThan(summary.systemChars);
  });

  it("returns null for non-agent payloads", () => {
    expect(analyzeAgentRequest({ ok: true })).toBeNull();
  });
});
