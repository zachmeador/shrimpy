# SCHED-004: One-Time Scheduled Channel Messages

Status: draft
Priority: P1
Area: Schedules
Depends On: [SCHED-003](sched-003-scheduled-channel-messages.md)

## Why

The most useful near-term continuation is not a general conditional wait system.
It is a one-time scheduled channel message: "remind me tomorrow", "check this
again at 3pm", or "continue this thread in 20 minutes".

This item adds the one-time timer record. Routing follows
[CHANNEL-002](channel-002-attention-routed-channel-events.md) through the same
channel-event path as recurring schedules.

## Build

- Add one-time schedule records alongside recurring schedule definitions, with
  stable id, target channel, message text/content, due time, timezone when
  supplied, owner/source metadata, status, created time, fired time, emitted
  channel message id, and cancellation state.
- Add CLI coverage before tool automation, for example:
  - `shrimpy schedules once --at <time> --channel <name> --text <text>`
  - `shrimpy schedules once --in <duration> --channel <name> --text <text>`
  - `shrimpy schedules cancel <id>`
  - `shrimpy schedules show <id>`
  - `shrimpy schedules list --one-time`
- When due, emit the one-time record through the shared channel append path.
- Include one-time schedule provenance in the emitted channel message and turn
  context: schedule id, due time, target channel, source, and inspect command.
- Make schedule inspection show pending, fired, cancelled, failed, and expired
  one-time schedules alongside recurring schedules.
- Add an agent-facing tool only after the CLI shape is settled, so agents can
  create one-time scheduled messages without hand-editing config.
- Keep completed one-time schedule history bounded but inspectable.

## Boundaries

- Do not build a general conditional polling system here. This is time-based
  scheduling only.
- Do not add one-time-schedule routing semantics beyond
  [CHANNEL-002](channel-002-attention-routed-channel-events.md).
- Do not make one-time schedules static recurring config. They are runtime
  schedule state with explicit lifecycle.

## Notes

- This intentionally stops at time-based scheduling. If command-polling
  continuations become important later, add a specific backlog item then.
- This builds on [SCHED-003](sched-003-scheduled-channel-messages.md), which
  applies [CHANNEL-002](channel-002-attention-routed-channel-events.md) to
  recurring schedules.
- [SCHED-002](sched-002-schedule-inspection-surfaces.md) should include one-time
  schedules once this lands.

## Done

- Users and agents can create one-time scheduled channel messages from CLI.
- Due one-time schedules write ordinary channel messages at the requested time.
- Delivery to agents follows [CHANNEL-002](channel-002-attention-routed-channel-events.md).
- One-time schedules can be listed, shown, cancelled, and inspected after firing.
- Emitted turns include compact schedule provenance and inspect commands.
- Tests cover due-time parsing, firing, cancellation, restart persistence,
  emitted channel message ids, attention diagnostics, and bounded history.
