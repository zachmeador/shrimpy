# Memory

> a shrimpy never forgets

Shrimpy keeps memory in ordinary files so continuity stays legible and recoverable instead of becoming hidden framework state or prompt sludge.

## Current Shape

Agent memory is Markdown under `agents/<id>/context/`.

- Top-level `context/*.md` files are loaded as session context for that agent.
- `context/people/<actor-id>.md` is loaded only for turns from that actor.
- `context/channels/<name>.md` is loaded only for turns in that channel.
- `context/journal/**` is durable upkeep material and is not loaded by the default `agent:context/` source unless an explicit bounded source is added.

The path is the routing index. Shrimpy does not parse headings to decide what memory belongs to a turn, and there is no framework-owned global memory blob.

## Ownership

Agents write memory in their own voice as notes to their future selves. The framework provides context-loading primitives, CLI inspection, skills, and watches; the owning agent decides what is worth preserving during normal upkeep. The user can also edit memory files directly.

Workspace-wide baseline facts belong in `profile/*.md`, especially `profile/USER.md`, `profile/WORKSPACE.md`, and `profile/SYSTEM.md`, because those files are shared identity and setup truth. Shared model-visible working context belongs under workspace `context/` and is selected with `workspace:context/` sources for all agents, selected agents, selected channels, or an agent/channel pair.

When the user explicitly asks an agent to remember something, the agent should persist the relevant Markdown note before claiming it will be remembered. If it cannot persist the note immediately, it should say that plainly.

Do not use model-visible `context/` directories as filing cabinets. Put saved notes, reports, and other files in `agents/<id>/vault/`. Put code or app work in `agents/<id>/projects/`. Use `agents/<id>/context/` only for memory the agent should load into prompts.

## Upkeep

Fresh setup installs ordinary memory watches disabled by default:

- `memory-management` can run daily and asks the agent to review recent activity, update its own context files when durable memory is warranted, and prune stale notes.
- `journal-daily` can write a same-day journal note only if activity warrants it.
- `journal-compact` can summarize old daily and weekly journal notes into longer horizon files.

When enabled, these are normal watch-origin agent turns. They use skills, CLI commands, and file inspection.

## Context Assembly

The prompt assembler loads memory through the same source model as other context: file, directory, command, and runtime sources all become bounded prompt blocks. At turn time, path-indexed memory slices from `context/people/` and `context/channels/` appear in the `<context>...</context>` envelope only when they match the active sender or channel.

Inspect memory and context loading with:

```bash
shrimpy context --agent <id> --sections
shrimpy context files list --agent <id>
shrimpy context files show --agent <id> <path>
shrimpy context sources list --agent <id> --channel <name>
shrimpy context turn --agent <id> --channel <name>
```

## Boundaries

- Memory changes should be explicit, reviewable, and reversible through ordinary files and git history when the workspace is tracked.
- Channel logs, sessions, vault files, and project documents are evidence, not the memory product.
- Compaction is working-context maintenance, not long-term memory.
- Shrimpy does not keep `state/memory.json`, derived peer cards, a `consolidate_memory` task, or a special memory tool.
