# 🦐 Security

This page describes how Shrimpy works right now.

## Current Model

tldr: If you don't know what you're doing, you can get totally Rekt. Same with Openclaw, Hermes-agent, whatever. Shrimpy's goal is to not *mislead you* about this.

Shrimpy uses Pi's tool runtime. Active tool schemas are exposed to the model, Pi validates tool arguments, and Pi runs the selected tool implementation. Shrimpy adds its daemon tools for channels, publication, and child runs. See [tools.md](tools.md) and [channels.md](channels.md).

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

## Current Reach

When the relevant tools or surfaces are available:

- filesystem tools read and write through Pi's local tool runtime;
- shell access can run package scripts, install commands, or arbitrary local commands;
- web/search/browser-like tools add external content to session input;
- channel surfaces can turn remote messages into agent turns when membership gives an agent visibility and that agent's channel policy accepts them;
- watches can repeat work without a human watching every run;
- generated apps and scripts can remain part of the user's local environment after Shrimpy has built or modified them.

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

Workspace checkpoint tracking is local and opt-in. Its default whitelist excludes `state/`, `runtime/`, `channels/`, `media/`, `agents/*/sessions/`, `vault/`, and `projects/`; inspect the generated workspace `.gitignore` before relying on checkpoints for sensitive work.
