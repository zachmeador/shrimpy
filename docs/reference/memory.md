# Memory

> a shrimpy never forgets

Design aspiration: Shrimpy should preserve the continuity that matters, make it
legible and recoverable, and avoid turning memory into hidden framework state or
prompt sludge.

## Current Shape

Memory is agent-owned Markdown under `agents/<id>/context/`.

- Top-level `context/*.md` files are loaded as session context for that agent.
- `context/people/<actor-id>.md` is loaded only for turns from that actor.
- `context/channels/<name>.md` is loaded only for turns in that channel.
- `context/journal/**` is durable upkeep material and is not loaded by the
  default `agent:context/` source unless an explicit bounded source is added.

The path is the routing index. Shrimpy does not parse headings to decide what
memory belongs to a turn, and there is no framework-owned global memory blob.

## Ownership

Agents write memory in their own voice as notes to their future selves. The
framework provides context-loading primitives, CLI inspection, skills, and
schedules; the owning agent decides what is worth preserving during normal
upkeep. The user can also edit memory files directly.

Workspace-wide facts belong in `profile/*.md`, especially `profile/USER.md` and
`profile/SYSTEM.md`, because those files are shared truth rather than one
agent's working model.

## Upkeep

Fresh setup seeds ordinary schedules for memory work:

- `memory-management` runs daily and asks the agent to review recent activity,
  update its own context files when durable memory is warranted, and prune stale
  notes.
- `journal-daily` writes a same-day journal note only if activity warrants it.
- `journal-compact` summarizes old daily and weekly journal notes into longer
  horizon files.

These are normal scheduled agent turns. They use skills and CLI/file inspection;
they are not a separate memory control plane.

## Context Assembly

The prompt assembler loads memory through the same source model as other context:
file, directory, command, and runtime sources all become bounded prompt blocks.
At turn time, path-indexed memory slices from `context/people/` and
`context/channels/` appear in the `<context>...</context>` envelope only when
they match the active sender or channel.

Inspect memory and context loading with:

```bash
shrimpy context --agent <id> --sections
shrimpy context files list --agent <id>
shrimpy context files show --agent <id> <path>
shrimpy context sources list --agent <id> --channel <name>
shrimpy context turn --agent <id> --channel <name>
```

## Boundaries

- Memory changes should be explicit, reviewable, and reversible through ordinary
  files and git history when the workspace is tracked.
- Channel logs, sessions, vault files, and project documents are evidence, not
  the memory product.
- Compaction is working-context maintenance, not long-term memory.
- Shrimpy does not keep `state/memory.json`, derived peer cards, a
  `consolidate_memory` task, or a special memory tool.
