# Session Export

Export a whole monitored Claude Watch session as a Markdown learning note, so long experiments can be reviewed outside the browser.

## Scope

- Build a server-side `session-export` helper that summarizes session metadata, aggregate turn metrics, and each agent turn.
- Include turn annotations so bookmarked examples, tags, and notes survive export.
- Expose `GET /api/sessions/:id/export`.
- Add a Viewer action to copy the session Markdown from the session list.

## Verification

- `npm.cmd test -- tests/session-export.test.ts tests/store.test.ts tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
