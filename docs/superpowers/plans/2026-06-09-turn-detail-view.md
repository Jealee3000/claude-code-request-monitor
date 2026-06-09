# Turn Detail View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a request-scoped turn detail view that explains one user turn as a chain of Claude requests, context growth, response text, and tool calls.

**Architecture:** Keep capture and storage unchanged. Add a server-side `turn-detail` analyzer that groups the selected request with other requests sharing the same latest user message, reuses response stream parsing, and exposes the result via `/api/requests/:id/turn-detail`. Render the result in a new viewer tab.

**Tech Stack:** TypeScript, Fastify, Vitest, existing `RequestStore`, existing agent payload and response stream helpers.

---

### Task 1: Turn Detail Analyzer

**Files:**
- Create: `src/turn-detail.ts`
- Test: `tests/turn-detail.test.ts`

- [ ] **Step 1: Write failing analyzer test**

Create two request details with the same latest user text and different context sizes. Add response SSE fixtures with assistant text and tool calls. Assert `buildTurnDetail(details, selectedRequestId)` returns ordered steps, context deltas, final assistant text, and aggregated tool uses.

- [ ] **Step 2: Run analyzer test**

Run: `npm.cmd test -- tests/turn-detail.test.ts`
Expected: FAIL because `src/turn-detail.ts` does not exist.

- [ ] **Step 3: Implement analyzer**

Use `extractAgentPayload()` to find the selected request's turn key, group matching requests in chronological order, and use `parseResponsePreviewFromDetail()` for per-step response previews. Return `null` if the selected request is missing or not an agent request.

- [ ] **Step 4: Run analyzer test**

Run: `npm.cmd test -- tests/turn-detail.test.ts`
Expected: PASS.

### Task 2: Viewer API And UI

**Files:**
- Modify: `src/viewer.ts`
- Test: `tests/viewer.test.ts`

- [ ] **Step 1: Write failing viewer tests**

Assert `/api/requests/:id/turn-detail` returns a turn detail object for the latest request. Assert the HTML contains `Turn`, `turnDetail`, and `renderTurnDetail`.

- [ ] **Step 2: Run viewer tests**

Run: `npm.cmd test -- tests/viewer.test.ts`
Expected: FAIL with missing route and HTML markers.

- [ ] **Step 3: Implement route and tab**

Fetch turn detail alongside request detail, context diff, and response preview. Add a `Turn` tab and render turn metrics, final assistant text, aggregated tool uses, and request steps with context deltas.

- [ ] **Step 4: Verify and commit**

Run: `npm.cmd run build`
Run: `npm.cmd test`
Expected: all commands PASS. Commit with `feat: add turn detail view`.
