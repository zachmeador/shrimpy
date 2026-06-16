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

1. Identify the owner agent, cadence, target channel, and expected user-visible outcome.
2. Inspect existing watches, channel membership, and wake policy before adding anything.
3. Prefer `shrimpy watches add` for new watches and `shrimpy watches enable|disable <agent-id>/<watch-id>` for toggles. Use `--name` and `--concurrency-policy` when they matter. The workspace timezone is the default; edit `agents/<id>/watches.json` directly only for rare per-watch timezone overrides or shapes the CLI cannot express, and preserve existing entries.
4. For recurring agent work, prefer a message watch that posts a concise instruction into a real channel. Include any skill name the agent should use in the message text.
5. For deterministic observations, use a command watch and choose an emit policy deliberately.
6. Verify with `shrimpy watches show <agent-id>/<watch-id> --json`; check diagnostics, target channels, next run, and expected wake.
7. If the gateway is running, use `shrimpy watches run <agent-id>/<watch-id> --json` only when an immediate test run is safe. Then inspect `shrimpy watches history <agent-id>/<watch-id>` and `shrimpy channels search <channel> --kind watch --limit 10`.

## Commands

```bash
shrimpy watches --agent <id>
shrimpy channels members <channel>
shrimpy agent channel-policy <id> --channel <channel>
shrimpy watches show <agent-id>/<watch-id>
shrimpy watches history <agent-id>/<watch-id>
shrimpy watches add <id> --agent <id> --cron "<expr>" --channel <channel> --message "<instruction>"
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
- Do not use adapter-shaped channel names for watches. Use real channels such as `maintenance`, `home`, or a semantic work channel.
- Keep watch messages short and actionable. The watch should say what to do, where to inspect, and which skill to use if relevant.
- Before changing an existing watch, inspect its history and explain any change that affects cadence, target channel, command execution, or user-visible messages.
