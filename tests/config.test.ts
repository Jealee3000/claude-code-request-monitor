import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("config", () => {
  it("loads redaction rules from a configured json file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "claude-watch-config-"));
    const dataDir = join(tempDir, "data");
    const redactionPath = join(tempDir, "redaction.json");
    writeFileSync(redactionPath, JSON.stringify({
      headers: ["x-config-secret"],
      fields: ["projectSecret"],
      paths: ["metadata.private"],
      textPatterns: ["workspace-[0-9]+"]
    }));

    try {
      const config = parseConfig([
        "--data-dir",
        dataDir,
        "--redaction-config",
        redactionPath,
        "--session-id",
        "session-test"
      ]);

      expect(config.redactionConfigPath).toBe(redactionPath);
      expect(config.redactionRules).toEqual({
        headerNames: ["x-config-secret"],
        fieldNames: ["projectSecret"],
        fieldPaths: ["metadata.private"],
        textPatterns: ["workspace-[0-9]+"]
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
