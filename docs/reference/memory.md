# Memory

> a shrimpy never forgets

Shrimpy keeps memory in ordinary files so continuity stays legible and recoverable instead of becoming hidden framework state or prompt sludge.

## Current Shape

Agent memory is Markdown under `agents/<id>/context/`.

- Any Markdown file under `context/` is loaded as session context for that agent by the default `agent:context/` source.
- Subdirectories such as `context/people/` and `context/channels/` are organizational structure, not special routing boundaries.

The path is structure for humans and tools. Shrimpy does not parse headings to decide what memory belongs to a turn, and there is no framework-owned global memory blob. Treat `context/` as scarce prompt budget: tiny stable facts, preferences, active references, and compact pointers only.

## Ownership

Agents write memory in their own voice as notes to their future selves. The framework provides context-loading primitives, CLI inspection, skills, and watches; the owning agent decides what is worth preserving during normal upkeep. The user can also edit memory files directly.

Workspace-wide Shrimpy/Pi framing belongs in `context/SYSTEM.md`; durable workspace-owner identity and hard preferences belong in `context/USER.md`; local environment details and path breadcrumbs belong in `context/WORKSPACE.md`. Shared model-visible working context belongs under workspace `context/` and is selected with `workspace:context/` sources for all agents, selected agents, selected channels, or an agent/channel pair. User/person-specific memory normally belongs in the owning agent's `agents/<id>/context/`.

When the user explicitly asks an agent to remember something, the agent should persist the relevant Markdown note before claiming it will be remembered. If it cannot persist the note immediately, it should say that plainly. Memory changes should be explicit, reviewable, and reversible through ordinary files and git history when the workspace is tracked.

Do not use model-visible `context/` directories as filing cabinets. Put saved notes, reports, journals, and other files in `agents/<id>/vault/`. Put code or app work in `agents/<id>/projects/`. Use `agents/<id>/context/` only for memory the agent should load into prompts.

## Upkeep

An agent or user can configure an opt-in watch for recurring memory upkeep. The `memory-management`, `journal-daily`, and `journal-compact` skills guide suitable work; each watch remains an ordinary watch-origin agent turn with its own owner, cadence, channel, and message.

## Context Assembly

The stable prompt assembler loads memory from file and directory sources. Directory context sources load Markdown recursively in deterministic path order; live runtime facts and automatic producers stay in turn context.

Inspect memory and context loading with:

```bash
shrimpy context --agent <id> --sections
shrimpy context files list --agent <id>
shrimpy context files show --agent <id> <path>
shrimpy context sources list --agent <id> --channel <name>
shrimpy context producers list --agent <id> --channel <name>
shrimpy context turn --agent <id> --channel <name>
```
