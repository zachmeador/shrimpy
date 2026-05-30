# Memory Redesign — Implementation Tracker

Design: [memory-system-design.md](memory-system-design.md)
Branch: `memory-redesign`
Started: 2026-05-11
Completed: 2026-05-27
Last updated: 2026-05-27

Completed record for the one-cutover refactor. The branch is ready to merge once the patch is committed and merged into `main`.

## Slices

| # | Slice | Status | Notes |
|---|---|---|---|
| 1 | Source model: `ContextSource` / `ContextBlock` shapes; unified source list replaces `context.resources` + `briefing.commands` | **done** | Types live in `src/context/source.ts`. Config schema uses `context.sources` and accepts strings for file/directory sources plus `{type:"command",...}` for command sources. `briefing.commands` is gone. |
| 2 | Agent context directory: `agents/<id>/context/` discovery in assembly; drop `agent:MEMORY.md` from defaults | **done** | Directory resources end with `/`. `agent:context/` loads top-level `.md` files only; subdirs are reserved for turn-scoped slices or explicit sources. |
| 3 | Delete derived: remove `src/memory/derived/`, `consolidate_memory`, public `shrimpy memory ...` CLIs, and the Pi `memory` daemon tool | **done** | Derived implementation and public memory CLIs are gone. Scheduler `system_task` actions are rejected, the no-op system-task path is removed, setup no longer grants a `memory` tool, legacy `MEMORY.md` parser/writer helpers are gone, and no memory-specific state file is reserved without a consumer. |
| 4 | Keyed-slice producer: load `context/people/<sender>.md` and `context/channels/<channel>.md` for the active turn | **done** | `buildMemoryBriefing` reads paths directly from `src/memory/briefing.ts`. `src/context/turn/memory.ts` was removed. |
| 5 | Rename: `buildTurnBriefing` → `buildTurnContext`; `BriefingItem` → context item; `shrimpy briefing` → `shrimpy context turn`; fold command config | **done** | Turn-context API is renamed: `buildTurnContext`, `renderTurnContext`, `TurnContext`, `TurnContextItem`, `TurnContextInput`. `shrimpy briefing` CLI is removed. `shrimpy context sources list/run` and `shrimpy context turn` are implemented. |
| 6 | Skills + schedules: memory upkeep skills, `shrimpy context files list --older-than`, setup stubs, per-agent schedule pattern | **done** | Setup installs workspace skills `memory-management`, `journal-daily`, and `journal-compact`; setup writes `context/identity.md` and `context/habits.md`; context file list/show and source inspection CLIs are covered. Fresh setup seeds conservative upkeep schedules. |

## Delivered Behavior

- Agents load `agents/<id>/context/*.md` as session-scoped prompt material.
- Per-turn keyed slices load `context/people/<sender>.md` and `context/channels/<channel>.md`.
- The derived peer/channel implementation is gone — no global memory blob, no public derived-memory CLI, no `consolidate_memory` scheduler path, and no daemon `memory` tool.
- Setup writes `context/identity.md`, `context/habits.md`, and the workspace memory upkeep skills; no new `MEMORY.md`.
- `state/memory.json` is gone; no replacement memory-specific state file is reserved.
- `agent:context/` is the default agent context source.
- `shrimpy context files list --older-than <dur>` and `shrimpy context files show` are available.
- `shrimpy context sources list/run` and `shrimpy context turn` are available.
- Unified `context.sources` config replaces `context.resources` and `briefing.commands`.

## Decisions Made During Implementation

- **Directory resources are path-suffixed with `/`** (`agent:context/`), not a separate config type.
- **Top-level only directory expansion.** `agent:context/` loads `context/*.md` but not `context/people/*.md`, `context/channels/*.md`, or journal subdirectories. Subdirectories are turn-scoped slices or explicit sources.
- **No unused channel-cursor reservation.** The memory refactor does not keep a replacement state file without a concrete consumer. Future cursor work can add one with the feature that needs it.
- **Memory upkeep cadence is seeded conservatively.** Fresh default workspaces get `memory-management` daily at 03:00, `journal-daily` daily at 22:30, and `journal-compact` Sundays at 04:00, all logging through the normal `heartbeat` channel.
- **No `context/agents/` or `context/apps/` taxonomy yet.** Peer agents use `context/people/agent-<id>.md`; app/project notes stay in top-level context, vault, or project docs until a real routed app entity exists.
- **`BriefingState` / `briefingState` not renamed.** It is the on-disk state file format and runtime directory (`runtime/briefings/<agent>.json`). Renaming would require workspace migration on existing installs.
- **`MemoryBriefing` / `buildMemoryBriefing` not renamed.** Path-indexed memory slice still lives in `src/memory/briefing.ts`. Naming change can ride with a future file move.
- **`PromptSection` and `TurnContextItem` not merged into one type.** `ContextBlock` is the shared source/block vocabulary; existing prompt-section and turn-item renderers remain distinct because they serve different prompt slots.

## Verification

- 2026-05-25: `npm run build`
- 2026-05-25: `node --test test/setup-init.test.ts test/agents.test.ts test/scheduler.test.ts test/skill-command.test.ts`
- 2026-05-25: `npm test`
- 2026-05-25: `git diff --check`

## Notes

- No automatic migration of `MEMORY.md` / `state/memory.json`. Existing single-user workspace handles its own copy-over.
- The `<context>` prompt envelope format does not change.

## Post-Merge Backlog

- Generic heartbeat/status cleanup is tracked separately in `docs/backlog/sched-001.md`.
