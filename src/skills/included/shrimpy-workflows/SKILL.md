---
name: shrimpy-workflows
description: Use when a user wants Shrimpy to remember or find something, save files, watch something over time, route work through a channel, or hand off a clear task to a worker.
---

# Shrimpy Workflows

Use this skill to choose the Shrimpy shape before acting.

Use the paths in `profile/WORKSPACE.md`.

Choose the smallest relevant owner and skill:

- Recurring work, reminders, checks, and monitors: use `shrimpy-watches`; docs: `reference/configuration.md`, `reference/runtime.md`, `reference/channels.md`, `reference/cli.md`.
- Channel routing, logs, membership, or surfaces: use `shrimpy-channels`; docs: `reference/channels.md`, `reference/surfaces.md`, `reference/cli.md`.
- Durable saved files, research packets, and artifacts: use `vault-capture`; docs: `reference/workspace.md`, `reference/memory.md`, `reference/cli.md`.
- Agent creation or management: use `shrimpy-agents`; docs: `reference/architecture.md`, `reference/workspace.md`, `reference/cli.md`.
- Coding handoffs: use `shrimpy-coding-delegation`; docs: `reference/cli.md`.

For memory lookup, search before inventing:

```bash
shrimpy workspace search "<query>" --limit 10
shrimpy sessions search "<query>" --agent <id>
shrimpy channels search <channel> "<query>"
shrimpy context --turn --channel <channel> --agent <id>
```

Default to the smallest inspectable owner. Use existing commands and files before inventing new structure. Ask the user before creating recurring work, broad searches, or worker handoffs with side effects.
