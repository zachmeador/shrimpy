# 🦐 Security

Read [SECURITY.md](../../SECURITY.md) for trust assumptions and operating risks. This page covers capability inspection and the web inspector's access boundaries.

Agent [tool policy](configuration.md#agents) can reduce the active tool set; it provides no process or filesystem isolation.

## Inspection

Use these current commands when inspecting workspace config:

```bash
shrimpy agent inspect <id>
shrimpy agent channel-policy <id> --channel <channel>
shrimpy channels members <channel>
shrimpy watches
shrimpy watches show <agent-id>/<watch-id>
shrimpy workspace track status --json
shrimpy context --agent <id> --sections
shrimpy skills list --agent <id>
shrimpy skills validate --agent <id>
```

These commands expose configuration, routing, prompt material, watches, and the active tool list.

Workspace checkpoint tracking is local and opt-in. Its default whitelist excludes `state/`, `runtime/`, `channels/`, `media/`, `agents/*/sessions/`, and agent `vault/` and `projects/` directories; inspect the generated workspace `.gitignore` before relying on checkpoints for sensitive work.

## Web Inspector

The gateway-managed inspector binds to loopback, exposes no CORS access, and has no mutation routes. Its server reads workspace files directly through bounded, realpath-contained readers. Pi authentication, provider/model credential state, Telegram state, runtime command shims, and credential-like filenames are never returned. Unknown workspace content is displayed as text or structured raw data rather than executed as HTML.

`shrimpy-web --host` exists for direct development diagnostics. Binding it beyond loopback changes the security boundary; the gateway itself always uses `127.0.0.1`.
