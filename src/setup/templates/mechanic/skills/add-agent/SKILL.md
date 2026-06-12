---
name: add-agent
description: Add or configure a Shrimpy agent. Use when creating a new specialized agent, wiring it into channels, setting its model/tools, or verifying wake behavior.
---

# Add Agent

Use this mechanic-owned skill when the user wants a new Shrimpy agent or wants an existing agent wired into channels/surfaces. Agents are workspace objects managed by the Shrimpy CLI; do not invent a parallel registry.

## Start With Inspection

Use the workspace as source of truth:

```bash
shrimpy agent list --json
shrimpy models resolve --agent shrimpy --session tui --json
shrimpy skills list --agent mechanic --json
```

If the user has not named the agent, ask for one stable id and one sentence of purpose. Agent ids should be short, lowercase, and durable.

## Choose The Shape

Decide only what is needed now:

- `id`: stable public handle, also the default root `agents/<id>`.
- `SOUL.md`: the agent's role and operating style.
- `modelPolicy`: omit `--model-policy` unless this agent should use a policy other than `coding`.
- `tools`: inherit default tools unless the user needs a restricted surface.
- `disabledTools`: use for Pi built-ins or extension tools that should be excluded.
- `channelPolicy`: prefer `addressed` or `mentions` for shared human channels; use `all` only for private channels, maintenance channels, or deliberate always-on listeners.

## Add The Agent

Create through the CLI first:

```bash
shrimpy agent add <id> --channel-policy addressed --json
```

Add model policy, tools, or thinking only when chosen:

```bash
shrimpy agent add <id> \
  --model-policy <policy> \
  --tools reply,ask,notify,report,send_message,read_channel \
  --thinking medium \
  --channel-policy addressed \
  --json
```

Then edit the scaffolded files under `agents/<id>/`:

- `SOUL.md`: concise role, responsibilities, boundaries, voice.
- `context/habits.md`: working preferences and recurring practices.
- other `context/*.md` files: durable memory and active references the agent should always load.

Keep reports in `agents/<id>/vault/` and code/work folders in `agents/<id>/projects/`.

## Wire Channels

Channel membership gives visibility; channel policy decides whether a visible message becomes a turn. Join only the channels the agent should see:

```bash
shrimpy channels join <channel> --agent <id> --json
shrimpy channels members <channel> --json
shrimpy agent channel-policy <id> --channel <channel> --json
```

Use normal semantic channel names like `fitness`, `maintenance`, or `home` for internal rooms/logs. Do not create adapter-shaped names for concepts. Use the `channel-routing` skill when the user asks for a chat-surface workflow or when the route from an external chat to an agent is unclear.

Surface-thread channels belong to chat adapters. Telegram channels look like `telegram~<instance-id>~<chat-id>` where the instance comes from Telegram config and the chat id comes from the external Telegram chat. Do not invent names like `telegram~fitness` for a fitness agent. Configure Telegram with `shrimpy setup telegram`, discover actual channels with `shrimpy channels`, and use `shrimpy surface set-agent <surface> <thread-id> <id>` when an existing surface thread should address the new agent.

For shared channels, test the expected wake decision before declaring done:

```bash
shrimpy agent channel-policy explain <id> \
  --channel <channel> \
  --sender human \
  --text "@<id> hello" \
  --addressed <id> \
  --json
```

If a surface thread should address this agent by default, use the surface CLI rather than hand-editing state:

```bash
shrimpy surface set-agent <surface> <thread-id> <id> --json
```

## Verify

Before saying the agent is ready, run the inspectable checks:

```bash
shrimpy agent show <id>
shrimpy agent inspect <id> --json
shrimpy models resolve --agent <id> --session tui --json
shrimpy context --agent <id> --sections
```

If a working model is available, do a minimal smoke test:

```bash
shrimpy agent run <id> "Reply with one sentence describing your role."
```

## Hard Rules

- Do not delete, reset, or migrate existing agent files while adding a new agent.
- Do not edit `config/shrimpy.json` by hand when a CLI command covers the change.
- Do not add recurring watches or surface routes unless the user asked for that behavior.
- If wake behavior is unclear, inspect membership and policy instead of guessing.
