# SCHED-002: Schedule Inspection Surfaces

Status: review
Priority: P1
Area: Schedules

## Why

Schedules are ordinary Shrimpy workspace state, but inspection had been split
between per-agent definitions, aggregate gateway status, scheduler state, and
channel logs. Users and agents needed one reliable schedule inventory from the
CLI, and the TUI status surface needed the same information without leaving the
current session.

The existing `shrimpy agent schedules <id>` command is still useful for one
agent's raw definitions, but it does not answer workspace-level questions such as
"what schedules exist?", "which one fires next?", "where will it post?", or
"when did this schedule last run?".

## Build

- Add a workspace-wide `shrimpy schedules [--agent <id>] [--json]` command.
- Add `shrimpy schedules show <schedule-id> [--json]` for one resolved schedule,
  where agent schedules use the resolved `agent-id/local-schedule-id` id.
- Report the source path, owner agent when relevant, local id, enabled state,
  trigger, timezone, concurrency policy, target channel, expected attention
  behavior, next run from scheduler state, last observed run from channel logs,
  and recent emitted channel message id when available.
- Include both `agents/<id>/schedules.json` and `config/schedules.json`.
- Back the command with a shared schedule-inspection service rather than
  duplicating gateway scheduler loading logic in CLI and TUI code.
- Add TUI `/status schedules` as a read-only schedule summary using the same
  service.
- Add `/status schedules` to the TUI status section list and point users to
  `shrimpy schedules` for full detail.
- Update `docs/reference/cli.md` and schedule-related reference docs.

## Review State

- Implemented a shared schedule-inspection service that inventories agent-owned
  schedules from `agents/<id>/schedules.json` and workspace schedules from
  `config/schedules.json`.
- Implemented `shrimpy schedules [--agent <id>] [--json]` and
  `shrimpy schedules show <schedule-id> [--json]`.
- Implemented TUI `/status schedules` as a compact read-only view backed by the same
  service.
- Inspection reports source paths, owner/local ids, enabled state, trigger,
  timezone, concurrency policy, target channel, explicit membership, expected
  attention, session path, scheduler next-run state, recent emitted message id,
  and diagnostics for missing membership/attention.
- Tests cover schedule inventory, JSON output, agent filtering, one-schedule
  show output, missing ids, emitted message provenance, and missing attention
  diagnostics.
- No remaining implementation work is expected for this item before final
  review.

## Boundaries

- Keep this item read-only. Schedule create/edit/disable workflows can be a
  later item.
- Do not introduce a scheduler database; derive inspection from config files,
  scheduler state, and channel logs.
- Do not make the TUI parse command output. CLI and TUI should share a service
  or formatter-friendly data model.
- Do not add compatibility shims or legacy aliases.

## Notes

- Related: [CHANNEL-002](channel-002-attention-routed-channel-events.md) owns the
  shared channel-event routing contract that schedule inspection should explain.
- Related: [SCHED-003](sched-003-scheduled-channel-messages.md) applies that
  contract to recurring schedules.
- Related: [SCHED-004](sched-004-one-time-scheduled-channel-messages.md) adds
  one-time runtime schedules that should appear in the same inspection surfaces.

## Done

- `shrimpy schedules` lists all configured workspace and agent schedules.
- `shrimpy schedules --agent <id>` filters to one agent's schedules.
- `shrimpy schedules show <schedule-id>` prints one resolved schedule.
- JSON output is stable enough for agents to consume.
- TUI `/status schedules` shows schedule count, next due run, recent run
  activity, target channel, expected attention behavior, and the active agent's
  schedules.
- Tests cover schedule inventory, JSON output, filtering, missing ids, emitted
  message provenance, and the shared data source used by TUI status text.
