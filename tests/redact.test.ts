import { describe, expect, it } from "vitest";
import { redactHeaders, redactJson, redactText } from "../src/redact.js";

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
});
