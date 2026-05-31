# SCHED-002: Schedule Inspection Surfaces

Status: todo
Priority: P1
Area: Schedules

## Why

Schedules are now ordinary Shrimpy workspace state, but inspection is split
between per-agent definitions, aggregate gateway status, scheduler state, and
channel logs. Users and agents need one reliable schedule inventory from the
CLI, and the TUI status surface should expose the same information without
leaving the current session.

The current `shrimpy agent schedules <id>` command is useful for one agent's
raw definitions, but it does not answer workspace-level questions such as
"what schedules exist?", "which one fires next?", "where will it post?", or
"when did this schedule last run?".

## Build

- Add a workspace-wide `shrimpy schedules [--agent <id>] [--json]` command.
- Add `shrimpy schedules show <schedule-id> [--json]` for one resolved schedule,
  where agent schedules use the resolved `agent-id/local-schedule-id` id.
- Report the source path, owner agent when relevant, local id, enabled state,
  trigger, timezone, concurrency policy, target channel/action, next run from
  scheduler state, and last observed run from channel logs when available.
- Include both `agents/<id>/schedules.json` and `config/schedules.json`.
- Back the command with a shared schedule-inspection service rather than
  duplicating gateway scheduler loading logic in CLI and TUI code.
- Add TUI `/status schedules` as a read-only schedule summary using the same
  service.
- Add `/status schedules` to the TUI status section list and point users to
  `shrimpy schedules` for full detail.
- Update `docs/reference/cli.md` and schedule-related reference docs.

## Boundaries

- Keep this item read-only. Schedule create/edit/disable workflows can be a
  later item.
- Do not introduce a scheduler database; derive inspection from config files,
  scheduler state, and channel logs.
- Do not make the TUI parse command output. CLI and TUI should share a service
  or formatter-friendly data model.
- Do not add compatibility shims or legacy aliases.

## Done

- `shrimpy schedules` lists all configured workspace and agent schedules.
- `shrimpy schedules --agent <id>` filters to one agent's schedules.
- `shrimpy schedules show <schedule-id>` prints one resolved schedule.
- JSON output is stable enough for agents to consume.
- TUI `/status schedules` shows schedule count, next due run, recent run
  activity, and the active agent's schedules.
- Tests cover schedule inventory, JSON output, filtering, missing ids, and TUI
  status text generation or its shared data source.
