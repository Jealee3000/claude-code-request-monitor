# Session And Turn Compare Enhancement

Improve comparison beyond a single selected turn by comparing monitored sessions and matching repeated user prompts across runs.

## Scope

- Add a server-side `session-compare` analyzer.
- Compare current session and baseline session metrics: requests, turns, context, tools, skills.
- Match turns with the same latest user prompt and show context delta, tool diff, skill diff, and final response changes.
- Expose `GET /api/sessions/:id/compare` with optional `baselineSessionId`.
- Render the session comparison in the Viewer when a session is selected before drilling into a request.

## Verification

- `npm.cmd test -- tests/session-compare.test.ts tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
