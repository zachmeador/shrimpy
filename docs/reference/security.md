# 🦐 Security

**tldr:** If you don't know what you're doing, you can get totally wrekt. Same with Openclaw, Hermes-agent, whatever. Shrimpy's goal is to not *mislead you* about this.

Shrimpy uses Pi's tool runtime and adds daemon tools for channels and publication. Read the root [SECURITY.md](../../SECURITY.md) first for the trust model, lack of sandboxing, prompt-injection risk, and safe-operation guidance; this page covers the controls available for inspection and capability reduction.

## Tool Policy

Agent tool policy lives in `agents[]` inside `config/shrimpy.json`.

- `tools` selects which Shrimpy daemon tools are registered for the agent.
- `disabledTools` passes effective tool names to Pi as `excludeTools`, including Pi built-ins such as `bash`.

Inspect the effective tool view with:

```bash
shrimpy agent inspect <id>
shrimpy agent inspect <id> --json
```

Disabling a tool removes that tool from the session's active tool set.

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
