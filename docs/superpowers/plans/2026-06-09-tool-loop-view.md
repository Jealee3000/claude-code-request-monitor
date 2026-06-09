# Tool Loop View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show how Claude tool calls are paired with later `tool_result` blocks inside the same turn.

**Architecture:** Extend `turn-detail` analysis only. Parse `tool_result` blocks from request bodies, match them to response stream `tool_use.id`, and expose a `toolLoops` array in the existing turn detail API. Render a Tool Loop section inside the existing Turn tab.

**Tech Stack:** TypeScript, Fastify, Vitest, existing `turn-detail` and `response-stream` helpers.

---

### Task 1: Tool Loop Analyzer

**Files:**
- Modify: `src/turn-detail.ts`
- Test: `tests/turn-detail.test.ts`

- [ ] **Step 1: Write failing test**

Add a request with a response `tool_use.id`, followed by a request containing a matching `tool_result.tool_use_id`. Assert `toolLoops` includes tool name, input JSON, result preview, result size, error flag, result request id, and context delta.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- tests/turn-detail.test.ts`
Expected: FAIL because `toolLoops` is missing.

- [ ] **Step 3: Implement analyzer**

Parse request bodies with `JSON.parse(detail.payload.requestBodyJson)`, walk message content arrays, extract `tool_result` blocks, and match them to known tool uses by id.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test -- tests/turn-detail.test.ts`
Expected: PASS.

### Task 2: Viewer Section

**Files:**
- Modify: `src/viewer.ts`
- Test: `tests/viewer.test.ts`

- [ ] **Step 1: Write failing viewer test**

Assert turn detail API returns `toolLoops`, and viewer HTML contains `Tool Loop` plus `renderToolLoops`.

- [ ] **Step 2: Implement UI**

Render tool loops in the Turn tab with tool name, request pairing, result size, context delta, input JSON, and result preview.

- [ ] **Step 3: Verify and commit**

Run: `npm.cmd run build`
Run: `npm.cmd test`
Expected: all commands PASS. Commit with `feat: add tool loop analysis`.
