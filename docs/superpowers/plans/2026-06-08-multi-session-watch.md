# Multi-Session Claude Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a long-lived Claude Watch service that can monitor multiple Claude Code processes and help launch existing Claude sessions from the browser.

**Architecture:** Add watch tokens to stored sessions, resolve request ownership from proxy authorization, expose APIs for watch-session creation and local Claude session discovery, and add a Node CLI for server/run flows. The viewer keeps the existing three-column layout but adds a local Claude session panel and lightweight polling for the selected request list.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, http-mitm-proxy, yargs, Vitest.

---

### Task 1: Session Tokens

**Files:**
- Modify: `src/types.ts`
- Modify: `src/store.ts`
- Test: `tests/store.test.ts`

- [ ] Add optional `watchToken` and `claudeSessionId` fields to session input/record types.
- [ ] Add SQLite migrations for the new nullable columns and a unique index on `watch_token`.
- [ ] Add `getSessionByWatchToken(token)` and verify it returns the expected session.

### Task 2: Proxy Session Resolution

**Files:**
- Create: `src/proxy-session.ts`
- Modify: `src/proxy.ts`
- Test: `tests/proxy-session.test.ts`

- [ ] Parse `Proxy-Authorization: Basic base64("cw:<token>")`.
- [ ] Resolve the session id from the token using the store.
- [ ] Fall back to the configured startup session when no token or unknown token exists.
- [ ] Remove `proxy-authorization` before forwarding upstream.

### Task 3: Claude Session Discovery

**Files:**
- Create: `src/claude-sessions.ts`
- Test: `tests/claude-sessions.test.ts`

- [ ] Scan `.claude/projects/**/<uuid>.jsonl` while ignoring nested `subagents` files.
- [ ] Decode project directory names such as `D--code-sso-hub` to `D:\code\sso-hub`.
- [ ] Extract session id, modified time, file size, and latest prompt text.

### Task 4: Service APIs and CLI

**Files:**
- Create: `src/cli.ts`
- Modify: `src/viewer.ts`
- Modify: `package.json`
- Test: `tests/viewer.test.ts`

- [ ] Add `POST /api/watch-sessions`.
- [ ] Add `GET /api/claude-sessions`.
- [ ] Add `npm run watch -- server`.
- [ ] Add `npm run watch -- run --project <path> --resume <session-id>`.

### Task 5: Viewer UX

**Files:**
- Modify: `src/viewer.ts`
- Test: `tests/viewer.test.ts`

- [ ] Add a Refresh button above Requests.
- [ ] Poll selected session requests every two seconds.
- [ ] Keep the selected request selected when the list refreshes.
- [ ] Add a Claude Sessions panel with PowerShell and Git Bash copy buttons.

### Task 6: Wrapper and Docs

**Files:**
- Modify: `scripts/claude-watch.ps1`
- Modify: `README.md`
- Test: `tests/wrapper.test.ts`

- [ ] Document the new server/run flow.
- [ ] Keep existing PowerShell behavior working.
- [ ] Add examples for watching two Claude sessions at once.
