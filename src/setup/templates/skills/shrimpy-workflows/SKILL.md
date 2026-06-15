---
name: shrimpy-workflows
description: Use when a user wants Shrimpy to remember or find something, save files, watch something over time, route work through a channel, or hand off a clear task to a worker.
---

# Shrimpy Workflows

Use this skill to choose the Shrimpy shape before acting.

Use the paths in `profile/WORKSPACE.md`.

Check the smallest relevant pattern doc first. If you need command details or current behavior, then open the listed reference docs.

- Watches: `patterns/watches.md`; then `reference/configuration.md`, `reference/runtime.md`, `reference/channels.md`, `reference/cli.md`.
- Channels: `patterns/channels.md`; then `reference/channels.md`, `reference/surfaces.md`, `reference/cli.md`.
- Vault: `patterns/vault.md`; then `reference/workspace.md`, `reference/memory.md`, `reference/cli.md`.
- Memory lookup: `patterns/memory.md`; then `reference/memory.md`, `reference/workspace.md`, `reference/sessions.md`, `reference/channels.md`, `reference/cli.md`.
- Workers: `patterns/workers.md`; then `reference/cli.md`.

Default to the smallest inspectable owner. Use existing commands and files before inventing new structure. Ask the user before creating recurring work, broad searches, or worker handoffs with side effects.
