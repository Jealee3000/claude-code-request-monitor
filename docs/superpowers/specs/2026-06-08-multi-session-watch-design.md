# Multi-Session Claude Watch Design

## Goal

Claude Watch should run as one long-lived local service while multiple Claude Code processes, projects, and resumed Claude sessions can be monitored together in the same browser UI.

## Scope

- Keep one viewer port and one proxy port.
- Add a launch flow that registers a watch session with the service before starting Claude.
- Attribute requests by a per-process proxy token instead of only by the service startup session id.
- Show local Claude session files discovered under the user's `.claude/projects` directory.
- Let the browser copy PowerShell and Git Bash commands for resuming a selected Claude session under monitoring.
- Refresh the request list automatically while keeping the selected request stable.

## Architecture

The service remains a Fastify viewer plus a local HTTP/MITM proxy. A new CLI command starts the service (`server`) or launches Claude through an existing service (`run`). `run` calls a local API to create a watch session, receives a watch token, and sets `HTTP_PROXY` and `HTTPS_PROXY` to `http://cw:<token>@127.0.0.1:<proxy-port>`.

The proxy reads `Proxy-Authorization`, maps the token to a stored watch session, and logs the request under that session. If no token is present, it falls back to the service's default session so the older PowerShell wrapper remains usable.

The viewer adds a local Claude sessions section. It scans `.claude/projects`, summarizes each JSONL file by project path, session id, modified time, and the latest prompt, then generates copyable commands. Browser-side launch remains copy-only for now to avoid starting shells from a local web page without an explicit security model.

## UI Behavior

- Sessions still select captured watch sessions.
- Requests refresh every two seconds for the selected watch session.
- A Refresh button gives manual control if polling misses something.
- Claude Sessions shows recent local sessions and copy buttons for PowerShell and Git Bash commands.
- Commands use `npm run watch -- run --project <path> --resume <session-id>`.

## Testing

- Store tests cover watch token persistence and lookup.
- Proxy helper tests cover Basic proxy auth parsing and fallback behavior.
- Claude session scanner tests cover Windows project path decoding and prompt extraction.
- Viewer tests cover the local session API and the presence of auto-refresh/copy command UI.
- Build and full test suite must pass.
