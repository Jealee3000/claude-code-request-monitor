# Turn Markdown Export

## Goal

Let the viewer produce a Markdown learning note for a selected Claude Code turn. The note should be useful outside the browser as a study artifact.

## Scope

- Add `buildTurnExport` as a reusable exporter.
- Include user prompt, agent insight, replay, compare summary, and final assistant response.
- Expose `/api/requests/:id/turn-export`.
- Add an `Export` tab with Markdown preview and copy action.
- Cover exporter and viewer integration with tests.

## Verification

- `npm.cmd test -- tests/turn-export.test.ts tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
