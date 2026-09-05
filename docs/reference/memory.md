# 🦐 Memory

Agents keep continuity in ordinary Markdown files. Prompt memory lives in `agents/<id>/context/`; saved reports, journals, and research belong in the agent's vault, with a short pointer in memory when useful. See [workspace.md](workspace.md#storage-rules) for storage locations.

## Ownership

Agents write notes to their future selves: stable facts, preferences, active references, and enough context to resume useful work. The owning agent decides what is worth retaining; users can edit the same files directly.

When a user asks an agent to remember something, persist the note before claiming it will be remembered. If saving fails, say so. Memory changes are reviewable through ordinary files; recovery requires that the specific file is tracked or backed up. Shrimpy's default [workspace checkpoints](workspace.md#checkpoints) exclude agent memory.

## Upkeep

Keep prompt memory small. Prune stale facts, combine repeated notes, and move detailed records into the vault. The `remember` skill guides capture; `memory-management`, `journal-daily`, and `journal-compact` guide upkeep. Recurring upkeep is opt-in through ordinary watches with a chosen owner, cadence, and destination.

## Context Assembly

The default `agent:context/` source loads Markdown recursively, including subdirectories. Directory names organize notes rather than selecting which turn sees them. Use [context-assembly.md](context-assembly.md#stable-sources) for source selection, scoping, and delivery.

Inspect what reaches a session with `shrimpy context --agent <id> --sections`.
