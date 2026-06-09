# Agent Analysis Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Turn Timeline, Context Diff, and Capture Diagnostics so captured Claude Code traffic becomes easier to learn from.

**Architecture:** Keep request capture unchanged. Add focused server-side analysis helpers for extracting agent payloads, comparing adjacent payloads, grouping requests into turns, and summarizing capture health. Expose these through small viewer APIs and render them in new viewer tabs/panels without changing the SQLite schema.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Vitest, existing browser-only HTML viewer.

---

### Task 1: Request Payload Access

**Files:**
- Modify: `src/store.ts`
- Modify: `src/types.ts`
- Test: `tests/store.test.ts`

- [ ] Add `listRequestDetails(sessionId)` for timeline analysis.
- [ ] Add `getPreviousRequestDetail(requestId)` for context diff.
- [ ] Add `listSessionRequestStats()` for diagnostics.
- [ ] Verify these methods return redacted payload-backed request details in stable chronological order.

### Task 2: Agent Payload Utilities

**Files:**
- Create: `src/agent-payload.ts`
- Test: `tests/agent-payload.test.ts`

- [ ] Parse `payload.requestBodyJson` into an object when possible.
- [ ] Extract latest user text from Anthropic-style `messages`.
- [ ] Extract model, tool names, tool use/result counts, context chars, system chars, and suspected skill count using `analyzeAgentRequest`.
- [ ] Return `null` for non-agent or unparseable payloads.

### Task 3: Context Diff

**Files:**
- Create: `src/context-diff.ts`
- Test: `tests/context-diff.test.ts`

- [ ] Compare current request with the previous request in the same session.
- [ ] Report message count, context char, system char, tool count, tool added/removed, tool_use/tool_result, and latest user text changes.
- [ ] Return a clear empty state when either side has no agent payload.

### Task 4: Turn Timeline

**Files:**
- Create: `src/turn-timeline.ts`
- Test: `tests/turn-timeline.test.ts`

- [ ] Group agent requests by latest user text, falling back to one request per group when no user text exists.
- [ ] Include request ids, time range, request count, model, latest user preview, tool names, context chars, and tool_use/tool_result totals.
- [ ] Sort turns by first request time descending for the viewer.

### Task 5: Diagnostics API

**Files:**
- Create: `src/diagnostics.ts`
- Modify: `src/viewer.ts`
- Test: `tests/diagnostics.test.ts`
- Test: `tests/viewer.test.ts`

- [ ] Summarize total sessions, zero-request sessions, sessions with recent captures, latest request time, and likely capture issues.
- [ ] Add `GET /api/diagnostics`.
- [ ] Add `GET /api/sessions/:id/turns`.
- [ ] Add `GET /api/requests/:id/context-diff`.

### Task 6: Viewer UI

**Files:**
- Modify: `src/viewer.ts`
- Test: `tests/viewer.test.ts`

- [ ] Add top-level `Diagnostics` panel in the left column.
- [ ] Add request detail tabs `Timeline` and `Diff`.
- [ ] Render timeline rows that jump to a request.
- [ ] Render context diff metrics and changed tool lists.
- [ ] Keep existing JSON tree and auto-refresh behavior intact.

### Task 7: Verification

**Files:**
- No source changes expected.

- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd test`.
- [ ] Confirm viewer HTML contains Diagnostics, Timeline, and Diff UI markers.
