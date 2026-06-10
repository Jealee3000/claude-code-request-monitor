import { describe, expect, it } from "vitest";
import { renderHtml } from "../src/viewer-html.js";

describe("viewer html", () => {
  it("renders the viewer shell with styles and client script", () => {
    const html = renderHtml("D:\\code\\claude-code-network");

    expect(html).toContain("claude-watch-root");
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
    expect(html).toContain('const repoRoot = "D:\\\\code\\\\claude-code-network";');
    expect(html).toContain('data-request-mode="turns"');
    expect(html).toContain("renderTurnList");
  });
});
