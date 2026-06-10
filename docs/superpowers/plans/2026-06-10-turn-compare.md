# Turn Compare

## Goal

Make it easy to compare the selected Claude Code turn with another turn, starting with the previous agent turn in the same monitored session. The comparison should explain changes in context size, tools, suspected skills, tool loops, and final response text.

## Scope

- Add `buildTurnCompare` as a reusable analyzer.
- Compare a selected turn with the previous distinct agent turn by default.
- Expose `/api/requests/:id/turn-compare`.
- Add a `Compare` tab in the viewer.
- Cover analyzer and viewer route/rendering with tests.

## Verification

- `npm.cmd test -- tests/turn-compare.test.ts tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
