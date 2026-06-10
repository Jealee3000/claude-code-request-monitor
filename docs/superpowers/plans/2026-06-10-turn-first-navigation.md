# Turn-First Navigation

## Goal

Make the viewer navigate captured traffic by agent turns first, because learning Claude Code behavior usually starts with one user prompt and the chain of requests it caused.

## Scope

- Change the middle traffic column to default to `Turns`.
- Keep raw `Requests` available through a small mode switch.
- Keep request search request-scoped, because search results can point to exact captured requests.
- Reuse the existing `/api/sessions/:id/turns` API and `buildTurnTimeline` analyzer.

## Verification

- `npm.cmd test -- tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
- Browser smoke test against a local dev server
