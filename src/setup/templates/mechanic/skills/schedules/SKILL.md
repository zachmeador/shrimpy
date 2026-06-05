---
name: schedules
description: Use when creating, changing, inspecting, or debugging Shrimpy schedules and watches.
---

# Schedules And Watches

Use this skill when the user wants recurring work, reminders, periodic audits, or background checks.

Reference docs:

- `{{DOCS_PATH}}/reference/configuration.md` — watch configuration, message watches, command watches, status config.
- `{{DOCS_PATH}}/reference/runtime.md` — gateway dispatch, watch runs, run history.
- `{{DOCS_PATH}}/reference/channels.md` — channel membership, wake policy, watch-origin messages.
- `{{DOCS_PATH}}/reference/cli.md` — current `shrimpy watches` commands.

## How To Work

1. Identify the owner agent, schedule, target channel, and expected user-visible outcome.
2. Inspect existing state before adding anything: `shrimpy watches --agent <id> --json`, `shrimpy channels members <channel> --json`, and `shrimpy agent channel-policy <id> --channel <channel> --json`.
3. Prefer `shrimpy watches add` for new watches. Edit `agents/<id>/watches.json` directly only when the CLI cannot express the needed shape, and preserve existing entries.
4. For recurring agent work, prefer a message watch that posts a concise instruction into a real channel. Include any skill name the agent should use in the message text.
5. For deterministic observations, use a command watch and choose an emit policy deliberately.
6. Verify with `shrimpy watches show <agent-id>/<watch-id> --json`; check diagnostics, target channels, next run, and expected wake.
7. If the gateway is running, use `shrimpy watches run <agent-id>/<watch-id> --json` only when an immediate test run is safe. Then inspect `shrimpy watches history <agent-id>/<watch-id> --json` and `shrimpy channels search <channel> --kind watch --json`.

## Guardrails

- Do not add recurring watches unless the user asked for recurring work.
- Do not create broad catch-all upkeep watches when a focused watch or manual command is enough.
- Do not assume a posted watch message wakes the owner agent; channel membership and agent channel policy both have to allow it.
- Do not use adapter-shaped channel names for schedules. Use real channels such as `maintenance`, `home`, or a semantic work channel.
- Keep watch messages short and actionable. The watch should say what to do, where to inspect, and which skill to use if relevant.
- Before changing an existing watch, inspect its history and explain any change that affects cadence, target channel, command execution, or user-visible messages.
