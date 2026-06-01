# SCHED-004: One-Time Scheduled Channel Messages

Status: draft
Priority: P1
Area: Schedules
Depends On: [CHANNEL-002](channel-002-attention-routed-channel-events.md)

## Why

The most useful near-term continuation is not a general conditional wait system.
It is a one-time scheduled channel message: "remind me tomorrow", "check this
again at 3pm", or "continue this thread in 20 minutes".

This item adds the one-time timer record. Routing follows
[CHANNEL-002](channel-002-attention-routed-channel-events.md) through the same
channel-message path already used by recurring schedules.

Shrimpy already has a recurring scheduler loop. This item should reuse that
gateway tick and shared scheduler emit path; the new work is durable one-time
record lifecycle, not a second scheduler subsystem.

## Build

- Add a separate runtime store for one-time records, for example
  `state/one-time-schedules.json`. These records are user/agent-created runtime
  state, not static recurring schedule config.
- Store one-time records with stable id, target channel, message text/content,
  due time, timezone when supplied, owner/source metadata, status, created time,
  fired time, emitted channel message id, and cancellation state.
- Add CLI coverage before tool automation, for example:
  - `shrimpy schedules once --at <time> --channel <name> --text <text>`
  - `shrimpy schedules once --in <duration> --channel <name> --text <text>`
  - `shrimpy schedules cancel <id>`
  - `shrimpy schedules show <id>`
  - `shrimpy schedules list --one-time`
- When due, have the gateway scheduler service drain pending one-time records
  and emit them through the same channel append/provenance path as recurring
  schedules.
- Include one-time schedule provenance in the emitted channel message and turn
  context: schedule id, due time, target channel, source, and inspect command.
- Make schedule inspection show pending, fired, cancelled, failed, and expired
  one-time schedules alongside recurring schedules.
- Extend TUI `/status schedules` to include one-time counts, next pending
  one-time due, recent fired/cancelled records, and CLI inspect/create/cancel
  pointers. Do not build a separate TUI scheduling flow first.
- Add an agent-facing tool only after the CLI shape is settled, so agents can
  create one-time scheduled messages without hand-editing config.
- Keep completed one-time schedule history bounded but inspectable.

## Boundaries

- Do not build a general conditional polling system here. This is time-based
  scheduling only.
- Do not add another scheduler loop. Extend the existing gateway scheduler
  service around a one-time record store.
- Do not add one-time-schedule routing semantics beyond
  [CHANNEL-002](channel-002-attention-routed-channel-events.md).
- Do not make one-time schedules static recurring config. They are runtime
  schedule state with explicit lifecycle.
- Do not make TUI the primary creation API. CLI remains the source-of-truth
  command surface; TUI can expose status and command pointers.

## Notes

- This intentionally stops at time-based scheduling. If command-polling
  continuations become important later, add a specific backlog item then.
- Recurring schedule inspection and channel-message routing already exist; this
  item adds the same lifecycle and inspection treatment for one-time records.
- Normal TUI sessions are not channel sessions. If a user asks for a reminder
  from TUI, the created one-time record still needs an explicit target channel
  such as Telegram, a DM channel, or another Shrimpy channel.

## Done

- Users and agents can create one-time scheduled channel messages from CLI.
- One-time schedule records persist in runtime state and survive gateway restart.
- Due one-time schedules write ordinary channel messages at the requested time.
- Delivery to agents follows [CHANNEL-002](channel-002-attention-routed-channel-events.md).
- One-time schedules can be listed, shown, cancelled, and inspected after firing.
- TUI `/status schedules` includes one-time schedule status and CLI pointers.
- Emitted turns include compact schedule provenance and inspect commands.
- Tests cover due-time parsing, firing, cancellation, restart persistence,
  emitted channel message ids, attention diagnostics, and bounded history.
