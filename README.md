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

## Viewer

The browser UI shows:

- Sessions
- Request timeline
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
```

The default ports are:

- Viewer: `43110`
- Proxy: `43111`

## Current Limitations

- The viewer is intentionally simple and local-only.
- Large bodies are capped before persistence.
- Dependency audit currently reports vulnerabilities in transitive packages; review before using this outside a private learning environment.
