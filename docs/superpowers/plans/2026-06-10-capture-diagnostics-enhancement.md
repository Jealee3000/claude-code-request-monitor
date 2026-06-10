# Capture Diagnostics Enhancement

## Goal

Make it easier to answer why a monitored Claude session has no captured requests or cannot explain agent context.

## Scope

- Add per-session diagnostic checks to `/api/diagnostics`.
- Report routing-token presence without exposing token values.
- Distinguish active capture, metadata-only capture, waiting sessions, and non-routable legacy sessions.
- Add specific hints for restarting Claude through `watch run`, enabling `--inspect-body`, and recreating legacy sessions.
- Render the checks in the Viewer Diagnostics panel.

## Verification

- `npm.cmd test -- tests/diagnostics.test.ts tests/store.test.ts tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
- Browser smoke test against a local dev server
