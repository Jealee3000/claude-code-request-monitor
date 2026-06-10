# Agent Insight Summary

## Goal

Add a concise learning-oriented summary for a selected Claude Code turn. The view should explain the agent behavior behind the raw requests instead of only showing captured JSON.

## Scope

- Add a reusable `buildAgentInsight` analyzer.
- Summarize context growth, tool result feedback, suspected skills, available tools, and the final assistant response.
- Expose the summary from `/api/requests/:id/agent-insight`.
- Add an `Insight` tab to the viewer.
- Cover the analyzer and viewer route with tests.

## Verification

- `npm.cmd test -- tests/agent-insight.test.ts`
- `npm.cmd test -- tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
