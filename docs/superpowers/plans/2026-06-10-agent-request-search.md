# Agent Request Search

## Goal

Make captured agent traffic easier to navigate once a session has many requests. The search should help locate requests by prompt text, response text, tool names, tool input JSON, and suspected skill names.

## Scope

- Add a reusable request search analyzer.
- Expose `/api/sessions/:id/search`.
- Add a search box and tool/skill filters above the request list.
- Render search results as clickable request rows that open the Insight tab.
- Cover analyzer behavior and viewer integration with tests.

## Verification

- `npm.cmd test -- tests/request-search.test.ts tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
