# Claude Code Request Monitor Design

## Goal

Build a Windows-friendly local tool for learning how Claude Code assembles API requests, manages tool definitions, and injects skills. The tool should let the user start Claude Code through a wrapper and inspect captured request logs in a local browser UI.

The first version should prioritize clarity and safety over full packet-capture power. It should run locally, avoid changing system-wide proxy settings, and redact sensitive data by default.

## Non-Goals

- Do not build a general-purpose network sniffer.
- Do not require installing a system-wide root certificate in the first version.
- Do not upload logs or request bodies to any remote service.
- Do not support every operating system in the first version; Windows PowerShell is the target.

## Recommended Approach

Use a PowerShell wrapper to launch Claude Code with per-process proxy environment variables. The wrapper starts a local Node.js service that provides:

- A local HTTP/HTTPS proxy endpoint for Claude Code traffic.
- A structured log writer backed by SQLite.
- A local browser viewer at `http://127.0.0.1:43110`.

The proxy records request metadata by default. HTTPS request and response body capture is available only through an explicit opt-in flag. In that mode, the wrapper uses a project-local certificate authority and sets trust only for the Claude Code child process.

## Architecture

### PowerShell Wrapper

The wrapper command is the user-facing entry point.

Example:

```powershell
.\claude-watch.ps1
.\claude-watch.ps1 --inspect-body
.\claude-watch.ps1 --project D:\code\some-project
```

Responsibilities:

- Create a session id for each Claude Code launch.
- Start the local Node service if it is not already running.
- Set `HTTP_PROXY` and `HTTPS_PROXY` only for the Claude Code process.
- In inspect body mode, set `NODE_EXTRA_CA_CERTS` only for the Claude Code process.
- Pass the session id to the proxy through an environment variable.
- Open or print the local viewer URL.
- Avoid modifying global Windows proxy settings.

### Local Node Service

The Node service owns proxying, persistence, and the browser UI.

Responsibilities:

- Listen on `127.0.0.1`.
- Provide a proxy port for Claude Code.
- Provide a viewer port, default `43110`.
- Store captured logs in SQLite.
- Apply redaction before logs are written.
- Serve a browser UI for inspecting sessions and requests.

### SQLite Storage

SQLite keeps the first version simple and portable.

Suggested tables:

- `sessions`: session id, started time, project path, wrapper options.
- `requests`: method, URL host, URL path, status, duration, request time, response time, error state.
- `payloads`: optional redacted request body, optional redacted response body, content type, size.
- `events`: streaming response chunks or parsed server-sent event summaries.

Payload rows are created only when body inspection is enabled.

## Capture Modes

### Default Mode

Default mode records safe metadata:

- Target host and path.
- HTTP method.
- Status code.
- Duration.
- Content type.
- Approximate request and response sizes.
- Stream event count.
- Parsed token usage if it is available in response metadata.

It does not persist full prompts, messages, tool schemas, API keys, or response text.

### Inspect Body Mode

Inspect body mode is enabled explicitly:

```powershell
.\claude-watch.ps1 --inspect-body
```

In this mode the service generates or reuses a project-local certificate authority under the tool data directory. The wrapper sets `NODE_EXTRA_CA_CERTS` for the Claude Code child process so Node-based HTTPS calls can trust the local proxy without changing the Windows system trust store.

In this mode the tool stores redacted JSON bodies so the user can study:

- `system` content.
- `messages`.
- `tools`.
- `tool_choice`.
- MCP and skill-related context.
- Tool use and tool result messages.
- Streaming response events.

Even in this mode, redaction runs before writing to SQLite.

## Redaction

Redaction is mandatory before persistence.

The redactor should remove or mask:

- `Authorization` headers.
- API keys and bearer tokens.
- Cookies.
- Known secret-like environment variables.
- Local Windows user home paths where practical.
- Long opaque tokens matching common key patterns.

The UI should clearly show when a field was redacted.

## Browser Viewer

The viewer runs locally at:

```text
http://127.0.0.1:43110
```

Initial views:

- Sessions list.
- Request timeline.
- Request detail.
- Structured context view.
- Raw JSON view for captured bodies.
- Tools and skills view.
- Simple diff between two captured request bodies.

The UI should make learning easy:

- Collapse large JSON sections by default.
- Highlight `system`, `messages`, `tools`, `tool_use`, and `tool_result`.
- Provide search across a session.
- Show redaction markers.

## Error Handling

- If the proxy service is already running, the wrapper reuses it.
- If the viewer port is busy, the service exits with a clear message unless the user passes another port.
- If Claude Code cannot connect through the proxy, the wrapper prints troubleshooting steps and exits without changing global settings.
- If body capture sees non-JSON content, it stores metadata only.
- If the Claude Code process does not honor `NODE_EXTRA_CA_CERTS`, inspect body mode falls back to metadata capture and shows a clear warning.
- If redaction fails, the payload is not written.

## Testing Strategy

Core tests:

- Redaction masks authorization headers and API-key-like strings.
- Default mode does not persist request bodies.
- Inspect body mode persists redacted JSON bodies.
- Proxy records method, host, path, status, duration, and size.
- Viewer API returns sessions, requests, and request details.

Manual verification:

- Start the service on Windows PowerShell.
- Launch a test request through the proxy.
- Open `http://127.0.0.1:43110`.
- Confirm that metadata appears in default mode.
- Confirm that redacted payloads appear only with `--inspect-body`.

## Decisions

- Initialize this empty workspace as a git repository so design and implementation changes can be reviewed.
- Include opt-in HTTPS body inspection through a project-local CA and child-process-only `NODE_EXTRA_CA_CERTS`.
- Build the viewer as a small server-rendered HTML app first, with lightweight client-side JavaScript for JSON expansion, search, and diff.

## Recommended MVP Scope

Build the first version with:

- PowerShell wrapper.
- Node.js TypeScript service.
- SQLite log storage.
- Local browser viewer.
- Default metadata capture.
- Explicit `--inspect-body` HTTPS JSON capture through a project-local CA trusted only by the launched Claude Code process.
- Redaction before persistence.

Defer full Windows certificate installation and global proxy automation until the basic workflow is useful.
