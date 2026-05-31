# Shrimpy Vision Reconciliation

Last run: 2026-05-25T16:47:33+00:00

## Summary

Stable docs are broadly current for the `memory-redesign` branch. The reference surface now describes the implemented context-source model, agent-owned Markdown memory, default upkeep schedules, channel/session split, Telegram surface, gateway scheduler, and CLI-first workflow.

This run found several small docs/template drifts and fixed them:

- `docs/reference/cli.md` omitted implemented schedule-inspection and surface-state commands.
- Seeded memory upkeep skill examples referenced non-existent `shrimpy channels --peer/--since` flags.
- `AGENTS.md` still described the pre-redesign workspace shape (`MEMORY.md`, `state/memory.json`, root prompt files).
- `src/setup/templates/WORKSPACE.md` described runtime state as living under `state/` instead of splitting durable `state/` from disposable `runtime/`.

Remaining differences are tracked backlog, not stale docs: richer channel inspection is covered by `docs/backlog/channel-001.md`; session-status turn context items are covered by `docs/backlog/ctx-007.md`; runtime context producer CLI uniformity is covered by `docs/backlog/ctx-008-runtime-context-producers.md`.

## Source Set

- Stable docs: `docs/README.md`, `docs/reference/overview.md`, `docs/reference/architecture.md`, `docs/reference/runtime.md`, `docs/reference/configuration.md`, `docs/reference/workspace.md`, `docs/reference/context-assembly.md`, `docs/reference/memory.md`, `docs/reference/turn-context.md`, `docs/reference/cli.md`, `docs/reference/surfaces.md`, `docs/reference/development.md`
- Backlog: `docs/backlog/index.md` plus active item notes referenced there
- Setup/templates: `src/setup/templates/**`
- Implementation evidence: `src/cli.ts`, `src/commands/**`, `src/app/**`, `src/config/**`, `src/context/**`, `src/sessions/**`, `src/channels/**`, `src/surfaces/**`, `src/gateway/**`, `src/scheduler/**`, `src/memory/**`, `src/skills/**`, `src/tools/**`, `src/setup.ts`

Musings and research were treated as background context only; authoritative behavior comes from `docs/reference/`, backlog, and code.

## Capability Matrix

| Area | Vision | Implementation Evidence | Status | Reconcile Next |
| --- | --- | --- | --- | --- |
| CLI coverage | Every real feature has a `shrimpy <command>` path. | `src/cli.ts`, `src/commands/**`, `docs/reference/cli.md`; this run added missing docs for `agent schedules`, `agent schedule`, and `surface show`. | Implemented | Keep CLI docs in sync when adding subcommands. |
| Workspace model | File-backed home workspace with profile docs, agents, channels, runtime/state, skills, and framework docs. | `src/app/paths.ts`, `src/setup.ts`, `AGENTS.md`, `docs/reference/workspace.md`, `src/setup/templates/WORKSPACE.md`. | Implemented | None before merge. |
| Sessions | Pi owns transcripts; Shrimpy owns framing, local labels, channel sessions, reset/restore/thinking/compaction inspection. | `src/sessions/**`, `src/commands/sessions.ts`, `docs/reference/runtime.md`, `docs/reference/compaction.md`. | Implemented | None before merge. |
| Channels | Append-only JSONL logs route messages; membership and attention decide which agents wake. | `src/channels/**`, `src/agents/channel-policy.ts`, `docs/reference/architecture.md`, `docs/reference/surfaces.md`. | Implemented | Richer inspection remains `CHANNEL-001`, not doc drift. |
| Agents | Persistent actors with SOUL, context, skills, schedules, sessions, tools, attention policy. | `src/agents/**`, `src/commands/agent*.ts`, `src/setup/defaults.ts`, `docs/reference/configuration.md`. | Implemented | None before merge. |
| Surfaces | Surface verticals translate transport traffic to/from typed channel messages and maintain addressed-agent state. | `src/surfaces/**`, `src/commands/surface.ts`, `docs/reference/surfaces.md`; `surface show` docs added this run. | Implemented | None before merge. |
| Gateway and scheduler | Gateway runs surfaces, watches channels, and emits schedule messages into ordinary channel sessions. | `src/gateway/**`, `src/gateway.ts`, `src/scheduler/**`, `docs/reference/runtime.md`, `docs/reference/configuration.md`. | Implemented | None before merge. |
| Memory | Memory is agent-owned Markdown under `agents/<id>/context/`; no derived memory writer or special memory tool. | `src/memory/context.ts`, `src/context/**`, `src/tools/daemon.ts`, `docs/reference/memory.md`, `docs/reference/workspace.md`. | Implemented | None before merge. |
| Skills | Skills are Pi-style instruction/resource bundles under workspace or agent skill dirs. | `src/skills/service.ts`, `src/setup/templates/skills/**`, `docs/reference/skills.md`, `docs/reference/architecture.md`. | Implemented | Consider future channel-inspection CLI helpers so memory skills can avoid raw JSONL/JQ recipes. |
| Setup/templates | Fresh setup seeds docs, default agent, context stubs, workspace skills, channel config, and default schedules. | `src/setup.ts`, `src/setup/defaults.ts`, `src/setup/templates/**`, `test/setup-init.test.ts`. | Implemented | None before merge. |

## Drift And Gaps

- Fixed: seeded memory skill recipes used `shrimpy channels read --peer/--since` and `shrimpy channels list --since`, but those flags do not exist. They now use `shrimpy channels --json`, channel log paths, `jq`, and `shrimpy channels read <channel> --limit ... --json`.
- Fixed: `docs/reference/cli.md` did not list `shrimpy agent schedules <id>`, `shrimpy agent schedule <id> <schedule-id>`, or `shrimpy surface show <surface> <thread-id>`.
- Fixed: `AGENTS.md` listed removed workspace files and omitted the current `profile/`, `context/`, `runtime/`, and schedule paths.
- Fixed: `src/setup/templates/WORKSPACE.md` now distinguishes durable `state/` from disposable `runtime/`.
- Reconciled by SCHED-001: status now reports generic scheduled-run activity instead of heartbeat-specific status keys.
- Planned, not drift: richer channel search/filtering would make upkeep skills cleaner; `docs/backlog/channel-001.md` is the right home for that work.

## Decisions Or Clarifications Needed

- None required before final merge review.

## Next Actions

- Final merge review can treat stable docs as current after the fixes from this run.
- When `CHANNEL-001` lands, replace the raw JSONL/JQ upkeep examples with first-class `shrimpy channels` filters.

## Run Log

- 2026-05-25T16:47:33+00:00: Created tracker. Audited stable docs against memory-redesign branch. Fixed CLI reference omissions, scheduled upkeep skill recipes, stale `AGENTS.md` workspace paths, and setup workspace wording.
