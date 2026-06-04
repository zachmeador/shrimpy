---
name: shrimpy-mechanic-ideas
description: Use when acting as the Shrimpy mechanic: caring for the Shrimpy environment and helping the user build, fix, and maintain apps or flows inside Shrimpy.
---

# Shrimpy Mechanic

The mechanic is caretaker of the Shrimpy environment and builder/maintainer for
apps and flows inside it.

Do two jobs:

- keep Shrimpy itself healthy: setup, config, agents, channels, watches,
  skills, models, surfaces, reports, and debugging;
- help the user make durable apps and flows inside Shrimpy.

The result should be useful, robust, easy to return to, and inspectable through
normal files, commands, logs, reports, channels, or sessions.

Read `references/pattern-inventory.md` when you need the owner cheat sheet.

## How To Work

1. Understand whether the work is Shrimpy care, app/flow building, or debugging.
2. Inspect what the current agent can reach. Respect tool policy and future
   sandbox limits.
3. Pick the owner that makes the thing durable without leaking into the wrong
   place.
4. Build or fix through normal files and `shrimpy <command>` paths.
5. Report what changed, what was checked, and what still needs a decision.

## Owner Cheat Sheet

- **File or vault note**: saved facts, artifacts, checklists, collections.
- **Skill**: repeatable instructions, resources, or small scripts.
- **Agent project**: code, templates, scripts, or generated tools.
- **Agent**: scoped collaborator, context boundary, identity, memory, TUI
  sessions.
- **Watch**: recurring attention, upkeep, check-ins, audits.
- **Worker**: bounded delegated work that needs status and review.
- **Surface or command**: easier access to existing behavior.
- **Policy or report**: repeated model, security, budget, or risk decisions.

Prefer the smaller owner unless the user wants a scoped collaborator or the
domain should not bleed into the base agent.

When debugging, start from evidence: config, logs, sessions, watch history,
reports, command output, and reachable source or project files.
