---
name: shrimpy-watches
description: Use when creating, changing, inspecting, or debugging Shrimpy watches, reminders, recurring work, and background checks.
---

# Watches

Use this skill when the user wants recurring work, reminders, periodic audits, or background checks.

Use the paths in `profile/WORKSPACE.md`. For detail, use:

- `reference/configuration.md` — watch configuration, message watches, command watches, status config.
- `reference/runtime.md` — gateway dispatch, watch runs, run history.
- `reference/channels.md` — channel membership, wake policy, watch-origin messages.
- `reference/cli.md` — current `shrimpy watches` commands.

## How To Work

1. Confirm the user asked for recurring or delayed work. Identify the owner agent, cadence, task, destination channel, and expected user-visible result.
2. Choose the destination channel. If the user wants the result in the same conversation, use the current channel. If the destination is unclear, inspect channels before choosing. For internal-only work, use a simple workflow channel name.
3. Confirm the owner agent can receive work there with `shrimpy channels members <channel>` and `shrimpy agent channel-policy <agent> --channel <channel>`. Join the agent first if needed.
4. Add a message watch for agent work. The watch message is an instruction to the agent, not text for the user; tell the agent to send exactly one final user-facing message to the destination channel when it finishes.
5. Use a command watch only for deterministic shell observations. Choose an emit policy deliberately.
6. Verify with `shrimpy watches show <agent-id>/<watch-id> --json`; check diagnostics, target channel, next run, and expected wake.
7. If an immediate test is safe, run `shrimpy watches run <agent-id>/<watch-id> --json`, then inspect `shrimpy watches history <agent-id>/<watch-id>` and `shrimpy channels search <channel> --kind watch --limit 10`.

## Scheduled Message Pattern

1. Pick a short watch id that names the job.
2. Use `--channel <channel>` for the place the agent should wake.
3. Use `--addressed <agent>` when the channel has multiple possible agents or the route depends on addressed wake behavior.
4. Write `--message` as a small runbook: do the requested task, use any needed context, and send one final message with `reply`.
5. Tell the user the cadence, destination, and owner agent after verification.

## Commands

```bash
shrimpy watches --agent <id>
shrimpy channels members <channel>
shrimpy agent channel-policy <id> --channel <channel>
shrimpy watches show <agent-id>/<watch-id>
shrimpy watches history <agent-id>/<watch-id>
shrimpy watches add <id> --agent <id> --cron "<expr>" --channel <channel> --addressed <id> --message "<instruction>"
shrimpy watches add <id> --agent <id> --every 2h --channel <channel> --message "<instruction>"
shrimpy watches add <id> --agent <id> --every 30m --command "<command>" --emit-policy on_failure --emit-channel <channel>
shrimpy watches enable <agent-id>/<watch-id>
shrimpy watches disable <agent-id>/<watch-id>
shrimpy watches run <agent-id>/<watch-id>
```

## Guardrails

- Do not add recurring watches unless the user asked for recurring work.
- Do not create broad catch-all upkeep watches when a focused watch or manual command is enough.
- Do not assume a posted watch message wakes the owner agent; channel membership and agent channel policy both have to allow it.
- Do not make up channel names that look like generated chat adapter names. Use the current channel, a channel shown by `shrimpy channels`, or a route created by the surface/channel CLI.
- Do not write watch text as if the user will read it. Watch-origin text is internal trigger material; the agent should publish the user-facing message once per run.
- Keep watch messages short and actionable. The watch should say what to do, where to inspect, and which skill to use if relevant.
- Before changing an existing watch, inspect its history and explain any change that affects cadence, target channel, command execution, or user-visible messages.
