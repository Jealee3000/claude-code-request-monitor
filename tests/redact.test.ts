import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  configureRedactionRules,
  loadRedactionRulesFromFile,
  redactHeaders,
  redactJson,
  redactText,
  resetRedactionRules
} from "../src/redact.js";

afterEach(() => {
  resetRedactionRules();
});

describe("redaction", () => {
  it("redacts sensitive headers case-insensitively", () => {
    const result = redactHeaders({
      Authorization: "Bearer secret",
      cookie: "sid=secret",
      "content-type": "application/json"
    });

    expect(result).toEqual({
      Authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      "content-type": "application/json"
    });
  });

  it("redacts api-key-like values in json without mutating input", () => {
    const input = {
      apiKey: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
      nested: {
        token: "Bearer abcdefghijklmnopqrstuvwxyz0123456789"
      },
      keep: "visible"
    };

    const result = redactJson(input);

    expect(result).toEqual({
      apiKey: "[REDACTED]",
      nested: {
        token: "[REDACTED]"
      },
      keep: "visible"
    });
    expect(input.apiKey).toBe("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("normalizes windows user home paths in text", () => {
    const result = redactText("open C:\\Users\\Jealee.DESKTOP-6QJ1LKI\\secret\\file.txt");

    expect(result).toBe("open %USERPROFILE%\\secret\\file.txt");
  });

  it("redacts opaque tokens inside longer strings", () => {
    const result = redactText("Authorization: Bearer sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789");

    expect(result).toBe("Authorization: Bearer [REDACTED]");
  });

  it("applies additional runtime redaction rules", () => {
    configureRedactionRules({
      headerNames: ["x-workspace-secret"],
      fieldNames: ["projectSecret"],
      fieldPaths: ["metadata.workspace.id"],
      textPatterns: ["workspace-[0-9]+"]
    });

    expect(redactHeaders({ "x-workspace-secret": "visible", "x-keep": "ok" })).toEqual({
      "x-workspace-secret": "[REDACTED]",
      "x-keep": "ok"
    });
    expect(redactJson({
      projectSecret: "visible",
      metadata: { workspace: { id: "visible", name: "keep" } },
      text: "workspace-123 is hidden"
    })).toEqual({
      projectSecret: "[REDACTED]",
      metadata: { workspace: { id: "[REDACTED]", name: "keep" } },
      text: "[REDACTED] is hidden"
    });
  });

  it("loads redaction rules from a json file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "claude-watch-redaction-"));
    const configPath = join(tempDir, "redaction.json");
    writeFileSync(configPath, JSON.stringify({
      headers: ["x-custom-token"],
      fields: ["sessionSecret"],
      paths: ["messages.*.privateValue"],
      textPatterns: ["/internal-[a-z]+/g"]
    }));

    try {
      configureRedactionRules(loadRedactionRulesFromFile(configPath));

      expect(redactHeaders({ "x-custom-token": "secret" })).toEqual({
        "x-custom-token": "[REDACTED]"
      });
      expect(redactJson({
        sessionSecret: "secret",
        messages: [{ privateValue: "secret", keep: "visible" }],
        note: "internal-alpha"
      })).toEqual({
        sessionSecret: "[REDACTED]",
        messages: [{ privateValue: "[REDACTED]", keep: "visible" }],
        note: "[REDACTED]"
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
