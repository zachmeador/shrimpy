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

## Scheduled Message Pattern

1. Pick a short watch id that names the job.
2. Use `--channel <channel>` for the place the agent should wake; this need not be the final user-facing destination.
3. Use `--addressed <agent>` when the channel has multiple possible agents or the route depends on addressed wake behavior.
4. Write `--message` as a small runbook: do the requested task, use any needed context, and send one final message with `reply` to the active channel or `send_message` to the named user/channel destination.
5. Tell the user the cadence, execution channel, delivery destination, and owner agent after verification.

## Recurring Upkeep

Shrimpy creates no watches by default. When the user asks the mechanic to establish recurring upkeep, treat each routine as a separate opt-in decision rather than a package to enable.

For each approved routine, choose the responsible agent and write a small message watch that names the relevant skill. Common starting points are `memory-management` for durable memory review, `journal-daily` for activity-based daily notes, `journal-compact` for compacting journal breadcrumbs, `shrimpy-security-audit` for read-only security review, and `shrimpy-hygiene-audit` for read-only workspace hygiene review. Agree on cadence and execution channel with the user before creating it.

Never create a watch merely because the corresponding skill is installed. Each watch must have an explicit purpose, owner, cadence, and user approval.

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
shrimpy users presence
```

## Guardrails

- Do not add recurring watches unless the user asked for recurring work.
- Do not create broad catch-all upkeep watches when a focused watch or manual command is enough.
- Do not assume a posted watch message wakes the owner agent; channel membership and agent channel policy both have to allow it.
- Do not make up channel names that look like generated chat adapter names. Use the current channel, a channel shown by `shrimpy channels`, or a route created by the surface/channel CLI.
- Do not write watch text as if the user will read it. Watch-origin text is internal trigger material; the agent should publish the user-facing message once per run.
- Keep watch messages short and actionable. The watch should say what to do, where to inspect, and which skill to use if relevant.
- Before changing an existing watch, inspect its history and explain any change that affects cadence, target channel, command execution, or user-visible messages.
- Preserve the owner agent as the sender when an occasional report goes through another agent's primary chat. Do not rewrite identity to match the surface default; outbound attribution makes the cross-agent delivery legible.
