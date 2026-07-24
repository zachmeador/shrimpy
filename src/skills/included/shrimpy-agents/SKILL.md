---
name: shrimpy-agents
description: Create, inspect, configure, rename, remove, or debug Shrimpy agents.
---

# Shrimpy Agents

Agents are persistent workspace actors with identity, memory, skills, watches, sessions, vault, and projects. Use this skill when creating or managing agents. Use the CLI first; do not invent a parallel registry.

## Inspect First

Use the workspace as source of truth before changing anything:

```bash
shrimpy agent list
shrimpy agent show <id>
shrimpy agent inspect <id> --json
shrimpy models resolve --agent <id> --session local/main --json
shrimpy skills list --agent <id>
shrimpy context --agent <id> --sections
```

If creating a new agent, ask for one stable id and one sentence of purpose when missing. Agent ids should be short, lowercase, and durable.

## Manage Agents

Create the agent through the CLI, then edit its scaffolded files:

```bash
shrimpy agent add <id> --channel-policy addressed --json
shrimpy agent add <id> \
  --model-policy <policy> \
  --tools reply,ask,notify,report,send_message,read_channel \
  --thinking medium \
  --channel-policy addressed \
  --json
```

Use `shrimpy agent set <id>` for model policy, tools, disabled tools, thinking, root, or base channel policy changes. Use `shrimpy agent rename <old> <new>` for durable id changes. Use `shrimpy agent remove <id>` only when the user asked to remove an agent; add `--delete-files` only when they explicitly want files deleted.

## Model Policy Changes

When the user asks an agent to use a specific model going forward, treat it as a persistent model-policy change, not just a current-session model switch.

Inspect first:

```bash
shrimpy models --json
shrimpy models policies --json
shrimpy models resolve --agent <id> --session local/main --json
```

Find the exact Pi-visible `<provider>/<model>` id. If the user's model name is ambiguous or missing from `shrimpy models`, ask before changing anything.

Prefer a named policy for durable defaults:

```bash
shrimpy models policies set <policy> --candidate <provider>/<model> --json
shrimpy agent set <id> --model-policy <policy> --json
shrimpy models resolve --agent <id> --session local/main --json
```

Use an existing policy only when changing every agent that uses it is intended. Otherwise create or update an agent-specific policy name such as `<agent-id>-default`.

Active sessions restore the model saved in their transcript. Changing an agent's model policy or restarting the gateway does not replace that saved selection.

When the user explicitly wants to change a current gateway-owned session, inspect its canonical id and set the session itself:

```bash
shrimpy sessions list --agent <id> --json
shrimpy sessions set <session-id> --agent <id> --model <provider>/<model>
shrimpy sessions set <session-id> --agent <id> --model-policy <policy>
shrimpy sessions set <session-id> --agent <id> --thinking <level>
```

Use the foreground host's model or thinking controls for a TUI-owned session. Do not reset a session merely to apply a default unless the user asked to archive its current transcript. See `reference/sessions.md` for session ownership and model persistence.

## Shape Choices

- `SOUL.md`: concise role, responsibilities, boundaries, and voice.
- `context/**/*.md`: durable memory and active references that should load into every normal prompt for this agent. Treat this as scarce prompt budget; keep files tiny, stable, and character-count efficient.
- `vault/`: saved files and reports.
- `projects/`: code, apps, experiments, and focused work folders.
- `skills/`: agent-specific skills that override workspace skills.
- `watches.json`: recurring attention owned by this agent.
- `channelPolicy`: prefer `addressed` or `mentions` on shared human channels; use `all` only for private channels, maintenance channels, or deliberate always-on listeners.

Create context files only when there is something real to preserve and always-loading it is worth the token cost. Keep bulky evidence, journals, reports, saved files, and working material in `vault/` or `projects/`, with only a compact pointer in `context/` when needed.

## App-Agent Context

For app-like agents, consider whether live app state should arrive through turn context instead of memory or a watch. Automatic producers under `context.turn.producers` in `config/shrimpy.json` can run a small workspace command on relevant turns and emit compact summaries with optional inspect commands. Reserve them for bounded facts the model must receive before it can decide what to inspect.

Inspect before changing context wiring:

```bash
shrimpy context sources list --agent <id> --channel <channel> --json
shrimpy context producers list --agent <id> --channel <channel> --json
shrimpy context producers run <producer-id> --agent <id> --channel <channel> --json
shrimpy context turn --agent <id> --channel <channel>
```

Prefer existing CLI/config helpers. If an automatic producer needs hand-edited config, read `docs/reference/configuration.md` and `docs/reference/context-assembly.md` first, keep the command output bounded, and test with `shrimpy context producers run` before declaring the app-agent wired.

## Wire Channels

Channel membership gives visibility; channel policy decides whether a visible message becomes a turn. Join only the channels the agent should see:

```bash
shrimpy channels join <channel> --agent <id> --json
shrimpy channels members <channel>
shrimpy agent channel-policy <id> --channel <channel>
```

Test wake behavior before declaring routing done:

```bash
shrimpy agent channel-policy explain <id> \
  --channel <channel> \
  --sender human \
  --text "@<id> hello" \
  --addressed <id> \
  --json
```

Use `shrimpy-channels` for surface routing, channel naming, bindings, and Telegram details.

## Verify Changes

```bash
shrimpy agent show <id>
shrimpy agent inspect <id> --json
shrimpy models resolve --agent <id> --session local/main --json
shrimpy context --agent <id> --sections
```

If a working model is available and a smoke test is safe:

```bash
shrimpy agent run <id> "Reply with one sentence describing your role."
```

## Hard Rules

- Do not edit `config/shrimpy.json` by hand when a CLI command covers the change.
- Do not delete, reset, migrate, or move agent files unless the user asked for that exact change.
- Do not add recurring watches, surface routes, or broad channel membership unless the user asked for that behavior.
- If wake behavior is unclear, inspect membership and policy instead of guessing.
