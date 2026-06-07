# Claude Code Request Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-friendly local Claude Code request monitor with a PowerShell launcher, Node.js proxy/logger service, SQLite storage, redaction, and a browser viewer.

**Architecture:** The PowerShell wrapper launches the Node service and then starts Claude Code with per-process proxy variables. The Node service exposes a proxy endpoint and a local viewer API/UI; logs are persisted in SQLite after mandatory redaction. Body inspection is explicit and defaults off.

**Tech Stack:** Node.js 22, TypeScript, Fastify, better-sqlite3, Vitest, PowerShell.

---

## File Structure

- `package.json`: scripts, dependencies, and project metadata.
- `tsconfig.json`: TypeScript build settings.
- `vitest.config.ts`: unit test configuration.
- `src/config.ts`: CLI/env parsing and default ports/paths.
- `src/redact.ts`: request/response/header redaction utilities.
- `src/store.ts`: SQLite schema and persistence API.
- `src/proxy.ts`: local proxy server and request logging.
- `src/viewer.ts`: Fastify routes for UI and JSON APIs.
- `src/main.ts`: service entry point.
- `src/types.ts`: shared TypeScript types.
- `src/cert.ts`: project-local CA helpers for inspect-body mode.
- `scripts/claude-watch.ps1`: Windows wrapper.
- `tests/redact.test.ts`: redaction tests.
- `tests/store.test.ts`: SQLite persistence tests.
- `tests/viewer.test.ts`: viewer route tests.

## Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/types.ts`

- [ ] **Step 1: Add package metadata and scripts**

Create `package.json` with build, test, and dev scripts:

```json
{
  "name": "claude-code-request-monitor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "tsx src/main.ts",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@fastify/static": "^8.2.0",
    "better-sqlite3": "^11.10.0",
    "fastify": "^5.3.3",
    "http-proxy": "^1.18.1",
    "selfsigned": "^2.4.1",
    "undici": "^7.10.0",
    "yargs": "^17.7.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/http-proxy": "^1.17.16",
    "@types/node": "^22.15.30",
    "@types/yargs": "^17.0.33",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.2.2"
  }
}
```

- [ ] **Step 2: Add TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Add shared types**

Create `src/types.ts` with `MonitorConfig`, `SessionRecord`, `RequestRecord`, `PayloadRecord`, and `LoggedRequestInput` interfaces.

- [ ] **Step 5: Install dependencies and verify**

Run: `npm.cmd install`

Expected: dependencies install successfully and `package-lock.json` is created.

- [ ] **Step 6: Build**

Run: `npm.cmd run build`

Expected: TypeScript build succeeds after source files exist in later tasks.

## Task 2: Redaction Core

**Files:**
- Create: `src/redact.ts`
- Create: `tests/redact.test.ts`

- [ ] **Step 1: Write failing redaction tests**

Create tests that assert:

- `Authorization` and `Cookie` headers are replaced by `[REDACTED]`.
- API-key-like strings in JSON are masked.
- Windows home paths are normalized to `%USERPROFILE%`.
- Redaction never mutates the original input object.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm.cmd test -- tests/redact.test.ts`

Expected: tests fail because `src/redact.ts` does not exist.

- [ ] **Step 3: Implement redaction**

Create functions:

```ts
export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown>
export function redactJson<T>(value: T): T
export function redactText(value: string): string
```

The implementation must deep-clone JSON-compatible data and replace secrets before returning.

- [ ] **Step 4: Run tests**

Run: `npm.cmd test -- tests/redact.test.ts`

Expected: all redaction tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add package.json package-lock.json tsconfig.json vitest.config.ts src tests
git commit -m "feat: add redaction core"
```

## Task 3: SQLite Store

**Files:**
- Create: `src/store.ts`
- Create: `tests/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create tests that assert:

- Creating a store initializes `sessions`, `requests`, and `payloads`.
- A session can be created and listed.
- A request can be inserted and fetched by session.
- Default-mode request insertion stores metadata without payload rows.
- Inspect-body insertion stores redacted payload JSON.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm.cmd test -- tests/store.test.ts`

Expected: tests fail because `src/store.ts` does not exist.

- [ ] **Step 3: Implement store**

Create `RequestStore` with:

```ts
constructor(dbPath: string)
init(): void
createSession(input: CreateSessionInput): SessionRecord
listSessions(): SessionRecord[]
logRequest(input: LoggedRequestInput): RequestRecord
listRequests(sessionId: string): RequestRecord[]
getRequestDetail(requestId: number): RequestDetail | undefined
close(): void
```

- [ ] **Step 4: Run tests**

Run: `npm.cmd test -- tests/store.test.ts`

Expected: all store tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/store.ts tests/store.test.ts
git commit -m "feat: add sqlite request store"
```

## Task 4: Viewer UI and API

**Files:**
- Create: `src/viewer.ts`
- Create: `tests/viewer.test.ts`

- [ ] **Step 1: Write failing viewer tests**

Create tests for:

- `GET /healthz` returns `{ ok: true }`.
- `GET /api/sessions` returns stored sessions.
- `GET /api/sessions/:id/requests` returns requests.
- `GET /` returns HTML containing the viewer root.

- [ ] **Step 2: Implement viewer**

Create `buildViewerServer(store: RequestStore)` that returns a Fastify instance with the API routes and a simple server-rendered HTML UI.

- [ ] **Step 3: Run tests**

Run: `npm.cmd test -- tests/viewer.test.ts`

Expected: all viewer tests pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/viewer.ts tests/viewer.test.ts
git commit -m "feat: add browser log viewer"
```

## Task 5: Proxy and Service Entry

**Files:**
- Create: `src/config.ts`
- Create: `src/proxy.ts`
- Create: `src/cert.ts`
- Create: `src/main.ts`

- [ ] **Step 1: Implement config parsing**

Create defaults:

- Viewer port: `43110`.
- Proxy port: `43111`.
- Bind host: `127.0.0.1`.
- Data dir: `.claude-watch`.
- DB path: `.claude-watch/requests.sqlite`.

- [ ] **Step 2: Implement metadata proxy**

Create `startProxyServer(config, store)` that supports normal HTTP proxy requests and HTTPS `CONNECT` metadata logging. In default mode it records host, method, path, status when available, timestamps, and payload sizes.

- [ ] **Step 3: Implement inspect-body guardrails**

Create `src/cert.ts` helpers that prepare a local certificate directory and return the CA path. If inspect-body is enabled but HTTPS body capture is not fully available, emit a warning and continue with metadata capture.

- [ ] **Step 4: Implement main service**

`src/main.ts` parses args, initializes store, creates a session if needed, starts proxy and viewer, and prints:

```text
Claude Watch viewer: http://127.0.0.1:43110
Claude Watch proxy:  http://127.0.0.1:43111
```

- [ ] **Step 5: Build and test**

Run:

```powershell
npm.cmd run build
npm.cmd test
```

Expected: build and tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/config.ts src/proxy.ts src/cert.ts src/main.ts
git commit -m "feat: add proxy service"
```

## Task 6: Windows PowerShell Wrapper

**Files:**
- Create: `scripts/claude-watch.ps1`
- Modify: `README.md`

- [ ] **Step 1: Create wrapper**

Create `scripts/claude-watch.ps1` that:

- Accepts `-InspectBody`, `-Project`, `-ViewerPort`, `-ProxyPort`, and trailing Claude arguments.
- Starts `npm.cmd run dev -- --session-id <id>` for the service.
- Sets `HTTP_PROXY` and `HTTPS_PROXY` only for the child Claude Code process.
- In inspect mode, sets `NODE_EXTRA_CA_CERTS` only for the child process.
- Starts `claude` in the selected project directory.

- [ ] **Step 2: Add README**

Create usage docs with:

```powershell
npm.cmd install
.\scripts\claude-watch.ps1
.\scripts\claude-watch.ps1 -InspectBody
```

Include the viewer URL and privacy notes.

- [ ] **Step 3: Verify wrapper syntax**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\claude-watch.ps1 -Help
```

Expected: help text is printed without starting Claude Code.

- [ ] **Step 4: Commit**

Run:

```powershell
git add scripts/claude-watch.ps1 README.md
git commit -m "feat: add windows claude launcher"
```

## Task 7: End-to-End Verification

**Files:**
- No new files required.

- [ ] **Step 1: Run full checks**

Run:

```powershell
npm.cmd run build
npm.cmd test
```

Expected: all checks pass.

- [ ] **Step 2: Start local service**

Run:

```powershell
npm.cmd run dev -- --session-id manual-test
```

Expected: service prints viewer and proxy URLs.

- [ ] **Step 3: Send a test request through the proxy**

Run from another terminal:

```powershell
node -e "fetch('http://127.0.0.1:43110/healthz').then(r=>r.text()).then(console.log)"
```

Expected: health JSON is returned.

- [ ] **Step 4: Open browser viewer**

Open `http://127.0.0.1:43110` in the in-app browser.

Expected: viewer loads and shows the manual-test session.

- [ ] **Step 5: Final commit**

Run:

```powershell
git status --short
```

Expected: working tree is clean.
