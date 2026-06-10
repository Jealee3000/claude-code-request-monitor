# Claude Code Request Monitor

Local Windows tool for learning how Claude Code sends API requests, assembles context, and defines tools/skills.

## Install

```powershell
npm.cmd install
```

PowerShell may block `npm.ps1`; use `npm.cmd` on Windows.

## Run

Start Claude Code through the wrapper:

```powershell
.\scripts\claude-watch.ps1
```

Open the local viewer:

```text
http://127.0.0.1:43110
```

## Recommended Multi-Session Flow

Start one long-lived watcher service:

```powershell
npm.cmd run watch:server
```

In Git Bash:

```bash
npm run watch:server
```

Then start Claude from any project directory through the running watcher:

```powershell
npm.cmd run watch:run -- --project D:\code\sso-hub --resume 464c8718-4dd5-462d-9523-20f7b51c3d25
```

In Git Bash:

```bash
npm run watch:run -- --project /d/code/sso-hub --resume 464c8718-4dd5-462d-9523-20f7b51c3d25
```

To watch two Claude sessions together, keep the service running and launch two terminals:

```powershell
npm.cmd run watch:run -- --project D:\code\sso-hub --resume 464c8718-4dd5-462d-9523-20f7b51c3d25
npm.cmd run watch:run -- --project D:\code\other-project --resume 26320e7d-3983-4d1e-b554-750960e381a4
```

Each `run` command registers a separate Claude Watch session and tags its requests with a local proxy token. The viewer shows all captured watch sessions in one page.

The viewer also scans local Claude Code sessions from:

```text
%USERPROFILE%\.claude\projects
```

Use the `Claude Sessions` panel to copy a PowerShell or Git Bash command for resuming a session under monitoring. The browser only copies commands; it does not start shells directly.

Start only the service and viewer:

```powershell
.\scripts\claude-watch.ps1 -NoClaude
```

Pass arguments to Claude Code after `--`:

```powershell
.\scripts\claude-watch.ps1 -ClaudeArgs '--dangerously-skip-permissions'
```

Resume an existing Claude conversation while monitoring:

```powershell
.\scripts\claude-watch.ps1 -InspectBody -RestartWatcher -Project D:\code\some-project -Resume 464c8718-4dd5-462d-9523-20f7b51c3d25
```

Continue the most recent conversation in the target project:

```powershell
.\scripts\claude-watch.ps1 -InspectBody -RestartWatcher -Project D:\code\some-project -ContinueConversation
```

## Inspect Body Mode

Default mode records safe metadata only. To capture redacted JSON request/response bodies, start with:

```powershell
.\scripts\claude-watch.ps1 -InspectBody
```

If an old watcher is still using the default ports, restart it before launching Claude:

```powershell
.\scripts\claude-watch.ps1 -InspectBody -RestartWatcher
```

In inspect mode, the local proxy performs HTTPS MITM only for the Claude Code child process. The wrapper sets:

- `HTTP_PROXY`
- `HTTPS_PROXY`
- `NODE_EXTRA_CA_CERTS`

These environment variables are restored after Claude exits. The tool does not change the Windows system proxy or system certificate store.

If the Requests list only shows `CONNECT api.anthropic.com:443` rows, the proxy is receiving Claude traffic but the running service is not intercepting HTTPS bodies. Stop the old service and restart the long-lived watcher with `--inspect-body` or use `-InspectBody -RestartWatcher` from the PowerShell wrapper.

## Viewer

The browser UI shows:

- Sessions
- Local Claude sessions with copyable resume commands
- Turn-first traffic navigation with request detail drill-down
- Request timeline
- Agent Insight turn summaries
- Turn Compare for context, tools, skills, and final response differences
- Session Compare for repeated prompts across monitored runs
- Context Waterfall for system, tools, messages, skills, tool results, user input, and assistant history
- Markdown export for selected turn learning notes
- Session-level Markdown export for whole monitored runs
- Turn bookmarks, tags, and notes for marking useful learning examples
- Session-level agent search by prompt, response, tool, tool input, and suspected skill
- Auto-refreshing request list with a manual Refresh button
- Capture diagnostics with per-session routing, inspect-body, and no-request hints
- Session cleanup for deleting captured local logs from the Viewer
- Request detail
- Redacted JSON payloads when inspect mode is enabled
- Search within request detail JSON

## Privacy Notes

Logs are written locally under `.claude-watch/`.

Redaction masks:

- `Authorization`
- cookies
- API-key-like fields
- bearer tokens
- Windows user home paths

You can add project-specific rules with a JSON file:

```json
{
  "headers": ["x-workspace-secret"],
  "fields": ["projectSecret"],
  "paths": ["metadata.workspace.id", "messages.*.privateValue"],
  "textPatterns": ["workspace-[0-9]+"]
}
```

Use it from PowerShell:

```powershell
.\scripts\claude-watch.ps1 -InspectBody -RedactionConfig .\redaction.json
```

Or with the Node CLI:

```powershell
npm.cmd run watch:server -- --redaction-config .\redaction.json
```

Inspect mode can still capture sensitive prompt content before redaction rules know about it. Use it only in local projects where this is acceptable.

## Stop the Watcher

The wrapper leaves the watcher running after Claude exits so the viewer remains available.

It prints the service PID. Stop it with:

```powershell
Stop-Process -Id <pid>
```

You can also let the wrapper stop old listeners on the viewer/proxy ports:

```powershell
.\scripts\claude-watch.ps1 -RestartWatcher -NoClaude
```

## Development

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run dev -- --session-id manual-test
npm.cmd run watch:server
```

Viewer code is split by responsibility:

- `src/viewer.ts` serves the local API and HTML response.
- `src/viewer-html.ts` composes the browser shell.
- `src/viewer-styles.ts` contains viewer CSS.
- `src/viewer-client.ts` contains the browser-side viewer logic.

The default ports are:

- Viewer: `43110`
- Proxy: `43111`

## Current Limitations

- The viewer is intentionally simple and local-only.
- Large bodies are capped before persistence.
- Dependency audit currently reports vulnerabilities in transitive packages; review before using this outside a private learning environment.
