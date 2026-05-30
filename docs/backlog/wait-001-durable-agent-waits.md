# WAIT-001: Durable Agent Waits

Status: draft
Priority: P1
Area: Runtime

## Why

Users expect any Shrimpy agent to be able to wait for something and get back to
them later, whether the agent is running in a channel/gateway session or a local
TUI/direct session. The wait should not keep a model turn, TUI process, or child
command blocked just to poll for readiness.

Shrimpy needs a durable continuation primitive: an agent records what it is
waiting for, Shrimpy polls cheaply in runtime, and the agent receives a normal
wake turn only when the condition is ready, cancelled, or timed out. Polling
belongs to runtime; judgment after the condition fires belongs to the agent
session.

## Build

- Define a first-class wait model with stable id, owning agent, origin target,
  condition/check, interval, timeout, status, timestamps, last check result,
  next check time, wake prompt, and delivery state.
- Model the origin target separately from the check so the same wait system works
  for channel sessions and TUI/direct sessions:
  - Channel origin: publish an addressed wake message back through the normal
    channel path.
  - TUI/direct origin: persist a pending wake for that session. If the session is
    open, surface it live when practical; if it is closed, deliver it on the next
    open.
- In an active TUI session, show a visible wait indicator for waits tied to that
  session so the user can either leave the session open, keep working, or make
  more requests with clear state.
- Do not interrupt an active model turn when a wait becomes ready. If the agent
  is already working, queue the ready wake behind the in-progress turn; if the
  session is idle, make the wake the next session event.
- Add CLI coverage before tool automation, for example:
  - `shrimpy waits create ...`
  - `shrimpy waits list`
  - `shrimpy waits show <id>`
  - `shrimpy waits cancel <id>`
  - `shrimpy waits run-due`
- Add an agent-facing daemon tool such as `wait_for` that creates a durable wait
  and returns a compact wait id/status. Agents should not implement their own
  sleep/poll loops.
- Start with deterministic, inspectable checks: command execution with structured
  output and a simple JSON predicate. Add specialized adapters later only when
  they reduce real complexity.
- Store wait state under workspace runtime state, not in static schedule config.
  The gateway/runtime wait runner polls due waits and updates state atomically.
- On false checks, update wait status and next check time without starting a
  model turn.
- On true checks, create one pending wake event, mark the wait ready/delivered,
  and route the wake through the origin target.
- Include the final check result, elapsed time, original wait reason, and any
  timeout/cancel context in the wake turn. Keep the wake compact enough to fit in
  normal turn briefings.
- Support timeout and cancellation. Timeout policy should be explicit: wake on
  timeout, silently expire, or mark failed for inspection.
- Surface pending, ready, timed-out, failed, and cancelled waits through status
  and briefing context so agents can reason about outstanding continuations.
- Keep enough delivered/completed wait history for inspection without growing
  runtime state unbounded.

## Boundaries

- Do not keep the model, TUI, or a shell command running just to wait.
- Do not add a second channel system. Pending wakes are only the non-channel
  delivery queue for direct/TUI sessions.
- Do not make arbitrary hidden agent tool calls during polling. Checks should be
  deterministic runtime operations with bounded output.
- Do not make worker sessions invent their own async wait/wake loop. Workers
  expose status; durable waits decide when an originating agent/session should
  continue.
- Do not make static recurring schedules carry per-conversation continuation
  state. Reuse scheduler mechanics where useful, but wait records are runtime
  state.
- Do not interrupt active TUI work when a wait fires. Ready wakes should preserve
  session order and queue behind the user's current request or the agent's
  current turn.

## Notes

- Related: [CODE-002](code-002-agentic-worker-sessions.md) is the first obvious
  consumer. A worker can expose structured status, and a wait can wake the parent
  agent when that worker is complete or blocked.
- Related: [TOOLS-001](tools-001.md) should make `wait_for` visible and
  enforceable in the effective tool capability view.
- Related: [CTX-007](ctx-007.md) should include pending/resolved waits in compact
  session-status briefings.
- Related: [SCHED-001](sched-001.md) keeps heartbeat/status concepts generic;
  durable waits should reuse generic runtime scheduling concepts without becoming
  another heartbeat control plane.
- `shrimpy worker wait <id>` can remain a blocking CLI command for humans and
  scripts. The async agent-facing version should be `wait_for(worker status is
  ready, wake origin)`.
- Likely files: `src/tools/`, `src/sessions/`, `src/gateway/`,
  `src/scheduler/`, `src/context/turn/`, `src/commands/`, and new wait state
  helpers under `src/waits/`.
- The implementation name should probably use "pending wakes" for queued
  direct/TUI delivery. "Session inbox" is broader than the intended first slice.

## Done

- Any configured agent can create a durable wait from a channel session or a
  TUI/direct session.
- False checks update wait state without starting a model turn.
- Ready checks wake the originating channel or create a pending wake for the
  originating TUI/direct session.
- Active TUI sessions visibly indicate waits tied to the current session.
- Ready wakes in an active TUI session queue behind any in-progress user request
  or model turn instead of interrupting it.
- A closed TUI/direct session receives pending wakes when it is opened again.
- Waits can be listed, inspected, cancelled, and manually advanced from CLI.
- Wait state records owner, origin target, check result, status, timing, timeout,
  and delivery outcome.
- Turn briefings/status surfaces make relevant pending and resolved waits visible
  without replaying raw transcripts.
- Tests cover channel wake delivery, TUI/direct pending wake delivery, timeout,
  cancellation, false check no-op behavior, and true check exactly-once wake.
