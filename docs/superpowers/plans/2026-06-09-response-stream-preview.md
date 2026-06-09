# Response Stream Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn captured streaming Claude responses into readable assistant text, thinking, tool-use input, usage, and event previews.

**Architecture:** Add a focused server-side parser for stored `responseBodyJson`, expose it from a request-scoped API endpoint, and have the viewer Response tab render stream-specific panels before falling back to the raw JSON tree. Keep parsing independent from the browser UI so Timeline/Diff can reuse it later.

**Tech Stack:** TypeScript, Fastify, Vitest, existing SQLite-backed `RequestStore`.

---

### Task 1: Stream Parser

**Files:**
- Create: `src/response-stream.ts`
- Test: `tests/response-stream.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseResponseStream } from "../src/response-stream.js";

it("assembles text tool input and usage from SSE", () => {
  const preview = parseResponseStream("event: message_start\\ndata: {...}\\n\\n");
  expect(preview.stream).toBe(true);
});
```

- [ ] **Step 2: Run parser tests**

Run: `npm.cmd test -- tests/response-stream.test.ts`
Expected: FAIL because `src/response-stream.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create exported `parseResponseStream(value: unknown)` and `parseResponsePreviewFromDetail(detail: RequestDetail)` functions. Parse `event:` / `data:` SSE blocks, append `text_delta`, `thinking_delta`, and `input_json_delta`, and collect usage from `message_start` / `message_delta`.

- [ ] **Step 4: Run parser tests**

Run: `npm.cmd test -- tests/response-stream.test.ts`
Expected: PASS.

### Task 2: Viewer API And UI

**Files:**
- Modify: `src/viewer.ts`
- Test: `tests/viewer.test.ts`

- [ ] **Step 1: Write failing viewer tests**

Add a captured `text/event-stream` response body fixture and assert `/api/requests/:id/response-preview` returns assembled preview fields. Assert the HTML references `responsePreview` and `renderResponsePreview`.

- [ ] **Step 2: Run viewer tests**

Run: `npm.cmd test -- tests/viewer.test.ts`
Expected: FAIL with missing route / missing HTML markers.

- [ ] **Step 3: Add route and UI rendering**

Import `parseResponsePreviewFromDetail`, add `/api/requests/:id/response-preview`, fetch preview in `selectRequest`, and render Assistant text, Thinking, Tool uses, Usage, Events, and fallback raw body panels.

- [ ] **Step 4: Run viewer tests and full verification**

Run: `npm.cmd test -- tests/viewer.test.ts`
Run: `npm.cmd run build`
Run: `npm.cmd test`
Expected: all commands PASS.
