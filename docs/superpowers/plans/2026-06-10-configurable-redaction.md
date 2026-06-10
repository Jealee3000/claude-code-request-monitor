# Configurable Redaction

Let Claude Watch keep its default local-safe redaction while allowing project-specific rules for fields seen in captured AI-agent requests.

## Scope

- Keep existing default headers, secret-like fields, bearer tokens, and Windows home path redaction.
- Add optional extra header names, JSON field names, JSON dot paths with `*` wildcards, and text regex patterns.
- Load rules from `--redaction-config` or `CLAUDE_WATCH_REDACTION_CONFIG`.
- Expose `-RedactionConfig` in the PowerShell wrapper.

## Verification

- `npm.cmd test -- tests/redact.test.ts tests/config.test.ts tests/store.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
