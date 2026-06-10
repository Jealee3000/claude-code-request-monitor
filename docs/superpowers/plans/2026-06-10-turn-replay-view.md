# Turn Replay View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a replay-style narrative that shows how one Claude Code turn evolves from user prompt to context assembly, tool results, assistant text, and tool calls.

**Architecture:** Keep capture and storage unchanged. Add a `turn-replay` analyzer that reuses `turn-detail` and `system-prompt` outputs, exposes it through a request-scoped API, and renders a new viewer tab.

**Tech Stack:** TypeScript, Fastify, Vitest, existing `RequestStore`, `turn-detail`, and `system-prompt` helpers.

---

### Task 1: Turn Replay Analyzer

**Files:**
- Create: `src/turn-replay.ts`
- Test: `tests/turn-replay.test.ts`

- [ ] **Step 1: Write failing analyzer test**

Create a two-request turn where request 1 emits a `tool_use` and request 2 carries the matching `tool_result`. Assert the replay contains ordered `user_prompt`, `request_context`, `tool_use`, `tool_result`, and `assistant_response` events.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- tests/turn-replay.test.ts`
Expected: FAIL because `src/turn-replay.ts` does not exist.

- [ ] **Step 3: Implement analyzer**

Use `buildTurnDetail()` for turn steps/tool loops and `buildSystemPromptPreview()` for per-request system/tool schema summaries. Generate compact ordered events with request id, step index, title, summary, and metadata.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test -- tests/turn-replay.test.ts`
Expected: PASS.

### Task 2: Viewer API And Replay Tab

**Files:**
- Modify: `src/viewer.ts`
- Test: `tests/viewer.test.ts`

- [ ] **Step 1: Write failing viewer test**

Assert `/api/requests/:id/turn-replay` returns ordered replay events. Assert viewer HTML contains `Replay`, `turnReplay`, and `renderTurnReplay`.

- [ ] **Step 2: Implement route and tab**

Add the route, fetch replay data when selecting a request, and render replay events in a new `Replay` tab.

- [ ] **Step 3: Verify and commit**

Run: `npm.cmd run build`
Run: `npm.cmd test`
Expected: all commands PASS. Commit with `feat: add turn replay view`.
