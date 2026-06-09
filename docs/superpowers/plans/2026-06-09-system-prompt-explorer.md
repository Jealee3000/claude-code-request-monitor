# System Prompt Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude Code request system prompts, suspected skills, and tool schemas easy to inspect in the browser.

**Architecture:** Add a focused `system-prompt` analyzer that parses request bodies already captured by the store. Expose it with a request-scoped Fastify API and render a new viewer `System` tab. Keep capture, proxy, and storage unchanged.

**Tech Stack:** TypeScript, Fastify, Vitest, existing `RequestStore` and viewer.

---

### Task 1: System Prompt Analyzer

**Files:**
- Create: `src/system-prompt.ts`
- Test: `tests/system-prompt.test.ts`

- [ ] **Step 1: Write failing analyzer tests**

Create a request detail with `system` content containing YAML-like skill metadata and `tools` with schemas. Assert the analyzer returns system blocks, suspected skills, tool schema sizes, and previews.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- tests/system-prompt.test.ts`
Expected: FAIL because `src/system-prompt.ts` does not exist.

- [ ] **Step 3: Implement analyzer**

Parse `payload.requestBodyJson`, normalize `system` strings and text blocks, extract `name:` / `description:` skill snippets, summarize tool names and schema character counts, and return `null` for non-agent payloads.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test -- tests/system-prompt.test.ts`
Expected: PASS.

### Task 2: Viewer API And UI

**Files:**
- Modify: `src/viewer.ts`
- Test: `tests/viewer.test.ts`

- [ ] **Step 1: Write failing viewer tests**

Assert `/api/requests/:id/system-prompt` returns suspected skills and tool schema summaries. Assert viewer HTML contains `System`, `systemPrompt`, and `renderSystemPrompt`.

- [ ] **Step 2: Implement route and tab**

Add the route, fetch system prompt data when selecting a request, and render metrics, suspected skills, system blocks, and tool schemas in a new `System` tab.

- [ ] **Step 3: Verify and commit**

Run: `npm.cmd run build`
Run: `npm.cmd test`
Expected: all commands PASS. Commit with `feat: add system prompt explorer`.
