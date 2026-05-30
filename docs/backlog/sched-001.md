# 🦐 SCHED-001: Demote Heartbeat to Watched Schedule Config

Status: todo
Priority: P2
Area: Scheduler

## Why
Heartbeat is intended to be a normal scheduled maintenance wake, not a first-class runtime primitive or a second async control plane. The current architecture mostly follows that direction, but status/config code still treats heartbeat as a special concept.

Shrimpy should keep the seeded default heartbeat behavior while making the framework concept generic: schedules emit addressed channel messages, channels route/log, sessions think, and status can watch configured schedules by label.

## Build
- Replace heartbeat-specific status config (`heartbeatChannel`, `heartbeatScheduleId`) with generic watched schedule config.
- Generalize gateway status summary fields such as `lastHeartbeat` and `nextHeartbeatAtMs` into watched schedule results keyed by configured label or schedule id.
- Fix scheduled-run detection so watched schedule status works for addressed scheduled text messages, not only legacy/system-shaped heartbeat payloads.
- Keep setup seeding a default `heartbeat` schedule and `heartbeat` channel, but make that ordinary workspace config rather than a runtime special case.
- Rename or isolate `createHeartbeatSchedule()` so heartbeat is clearly a seeded default schedule, not scheduler-layer policy.
- Update `shrimpy status`, `shrimpy gateway status`, docs, and tests to describe watched schedules / maintenance schedules generically while preserving readable output for the default `heartbeat` label.

## Boundaries
- Do not create a second scheduler, steward service, or heartbeat control plane.
- Do not remove the default heartbeat schedule from new workspaces.
- Do not add migration compatibility paths unless explicitly requested.
- Do not make scheduled maintenance policy live in framework code; policy belongs in schedule instructions, skills, context, and normal agent turns.

## Notes
- Likely files: `src/config/gateway-status.ts`, `src/gateway/status.ts`, `src/commands/status.ts`, `src/commands/gateway-status.ts`, `src/scheduler/builtins.ts`, `src/gateway/scheduler-service.ts`, `src/setup.ts`, and setup/config tests.
- Related direction: `CTX-007` adds session-status pointers for scheduled/steward turns without creating a heartbeat control plane.

## Done
- Heartbeat remains available as the seeded default maintenance schedule.
- No runtime/status APIs expose heartbeat-specific field names except display labels from config.
- Gateway status can watch any configured schedule/channel pair.
- Tests cover the seeded heartbeat label and at least one non-heartbeat watched schedule.
