# Agent Network Viewer Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Claude Watch so captured bodies decode correctly and the browser viewer presents AI-agent-relevant request structure instead of raw JSON only.

**Architecture:** Add focused helpers for compressed body decoding and AI request analysis, then wire them into proxy capture and viewer rendering. Keep SQLite schema unchanged by storing decoded, redacted JSON/text in existing payload fields and computing UI summaries client-side from request detail.

**Tech Stack:** Node.js 22, TypeScript, Vitest, zlib, Fastify, browser-native JavaScript.

---

## Task 1: Body Decode Helper

**Files:**
- Create: `src/body.ts`
- Create: `tests/body.test.ts`
- Modify: `src/proxy.ts`

- [ ] Write failing tests for `gzip`, `br`, `deflate`, plain JSON, and binary fallback.
- [ ] Run `npm.cmd test -- tests/body.test.ts` and confirm failures.
- [ ] Implement `decodeBody(buffer, headers)` and `parseDecodedBody(buffer, headers)`.
- [ ] Re-run body tests and confirm pass.
- [ ] Wire proxy request/response parsing through `parseDecodedBody`.

## Task 2: Agent Analysis Helper

**Files:**
- Create: `src/agent-analysis.ts`
- Create: `tests/agent-analysis.test.ts`

- [ ] Write failing tests for Claude-style request bodies containing `model`, `system`, `messages`, `tools`, `tool_choice`, `stream`, `thinking`, `max_tokens`, and `temperature`.
- [ ] Assert summary includes message counts by role, tool names, tool schema count, system length, estimated context characters, and risk flags for large tool/context sections.
- [ ] Run `npm.cmd test -- tests/agent-analysis.test.ts` and confirm failures.
- [ ] Implement `analyzeAgentRequest(value)`.
- [ ] Re-run agent analysis tests and confirm pass.

## Task 3: Viewer Upgrade

**Files:**
- Modify: `src/viewer.ts`
- Modify: `tests/viewer.test.ts`

- [ ] Add viewer test assertions for visible tab labels: `Overview`, `Agent`, `Headers`, `Payload`, `Response`, `Raw`.
- [ ] Add viewer test assertion that HTML includes `json-tree` rendering hooks.
- [ ] Implement a denser Network-like UI with request detail tabs.
- [ ] Implement collapsible JSON tree rendering in client JavaScript.
- [ ] Implement Agent tab that extracts model params, message counts, tools, tool choice, thinking, stream, and context size from captured payload JSON.
- [ ] Re-run viewer tests and confirm pass.

## Task 4: Verification

**Files:**
- No additional files.

- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd test`.
- [ ] Start inspect mode on temporary ports.
- [ ] Send gzip HTTPS JSON through the proxy.
- [ ] Open viewer and confirm Agent and JSON tree views render.
- [ ] Commit changes.
