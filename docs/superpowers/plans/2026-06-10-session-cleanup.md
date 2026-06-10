# Session Cleanup

## Goal

Let the local Viewer delete a monitored session and its captured request/payload logs so long-running experiments do not accumulate stale data indefinitely.

## Scope

- Add `RequestStore.deleteSession(sessionId)`.
- Delete payload rows before request rows and the session row.
- Expose `DELETE /api/sessions/:id`.
- Add a Viewer delete action with confirmation.
- Refresh sessions, traffic, details, and diagnostics after deletion.

## Verification

- `npm.cmd test -- tests/store.test.ts tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
- Browser smoke test against a local dev server
