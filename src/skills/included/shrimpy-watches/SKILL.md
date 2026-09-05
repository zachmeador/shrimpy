---
name: shrimpy-watches
description: Use when creating, changing, inspecting, or debugging Shrimpy watches, reminders, recurring work, and background checks.
---

# Watches

Use this skill when the user wants recurring work, reminders, periodic audits, or background checks.

Use the paths in `context/WORKSPACE.md`. For detail, use:

- `reference/configuration.md` — watch configuration, message watches, command watches, status config.
- `reference/runtime.md` — gateway dispatch, watch runs, run history.
- `reference/channels.md` — channel membership, wake policy, watch-origin messages.
- `reference/cli.md` — current `shrimpy watches` commands.

## How To Work

1. Confirm the user asked for recurring or delayed work. Identify the owner agent, cadence, task, execution channel, user-facing delivery destination, and expected result.
2. Choose the execution channel where the owner agent should wake. It can also be the delivery destination when the result belongs in that conversation. For an occasional report from a background or support agent, an internal execution channel plus the user's established `user:<id>` route or chosen bound channel avoids joining that agent to the main chat solely for delivery.
3. Confirm the owner agent can receive work on the execution channel with `shrimpy channels members <channel>` and `shrimpy agent channel-policy <agent> --channel <channel>`. Join the agent first if needed.
4. Add a message watch for agent work. The watch message is an instruction to the agent, not text for the user; tell the agent to send exactly one final user-facing message with `reply` when execution and delivery share a channel, or `send_message` when the destination differs.
5. Use a command watch only for deterministic shell observations. Choose an emit policy deliberately.
6. Verify with `shrimpy watches show <agent-id>/<watch-id> --json`; check diagnostics, target channel, next run, and expected wake.
7. If an immediate test is safe, run `shrimpy watches run <agent-id>/<watch-id> --json`, then inspect `shrimpy watches history <agent-id>/<watch-id>` and `shrimpy channels search <channel> --kind watch --limit 10`.

## Create The Watch

Choose a short ID and write the message as a small runbook: what to do, where to inspect, and where to publish. For example:

```bash
shrimpy watches add <id> --agent <agent-id> --cron "<expr>" --channel <execution-channel> --addressed <agent-id> --message "<instruction>"
```

Use `--every` for a fixed interval. For deterministic command checks, use `--command` with an explicit emit policy and destination. See `shrimpy watches add --help` for exact options. After verification, report the owner, cadence, execution channel, and delivery destination.

## Recurring Upkeep

Shrimpy creates no watches by default. Use `shrimpy-watches-default-init` when the user wants the optional standard routines; that skill owns their descriptions, cadences, and creation commands. Choose each routine explicitly rather than enabling a package of work merely because its skills are installed.

## Guardrails

- Do not create broad catch-all upkeep watches when a focused watch or manual command is enough.
- Do not make up channel names that look like generated chat adapter names. Use the current channel, a channel shown by `shrimpy channels`, or a route created by the surface/channel CLI.
- Before changing an existing watch, inspect its history and explain any change that affects cadence, target channel, command execution, or user-visible messages.
- Preserve the owner agent as the sender when an occasional report goes through another agent's primary chat. Do not rewrite identity to match the surface default; outbound attribution makes the cross-agent delivery legible.
