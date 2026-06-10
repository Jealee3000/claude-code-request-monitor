# Turn Annotations

Add lightweight study annotations to each detected Claude Code turn so useful examples can be marked while inspecting agent behavior.

## Scope

- Persist annotations by monitored session id and stable turn key.
- Support bookmark, comma-separated tags, and free-form notes.
- Expose request-scoped annotation APIs that resolve the selected request to its turn.
- Render annotation controls inside the Turn tab.
- Delete annotations when their captured session is deleted.

## Verification

- `npm.cmd test -- tests/store.test.ts tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
