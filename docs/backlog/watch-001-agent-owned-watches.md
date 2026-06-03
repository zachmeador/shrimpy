# WATCH-001: Agent-Owned Watches

Status: review
Priority: P1
Area: Watches
Depends On: none

## Why

Shrimpy needs a way for agents to notice things over time without turning the
runtime into a central brain.

The bad shape is:

```text
global clock/router -> fake heartbeat/status channel -> agent wakes
```

That makes recurring work feel like runtime-owned routing and encourages
channels that are not meaningful rooms or logs.

The better shape is:

```text
agent-owned watch -> observe/check -> record run -> optionally send meaningful message
```

A watch is part of an agent's habits. It can periodically check local state,
run a deterministic command, inspect a narrow feed, or look for a change. If it
finds something worth communicating, it sends a normal attributed message into a
meaningful channel. Channel presence and the agent's own wake policy decide what
happens next.

## Model

- **Watch** — an agent-owned background attention rule. It answers "what does
  this agent want to keep an eye on?"
- **Trigger** — what fires the watch: time, a command observation, a file event,
  a feed item, or explicit manual run.
- **Action** — the deterministic work to perform when due, such as a command or
  built-in inspection.
- **Run** — the durable operational record of what happened.
- **Observation** — optional structured output from a run: no change, changed,
  failed, threshold crossed, item found, etc.
- **Message** — optional channel communication created from an observation.
- **Wake** — never clock-owned. A message can wake an agent only through
  channel visibility and that agent's own wake policy.

There is no watch router. The runtime only provides a clock and runner for
agent-owned watches.

## Shape

Agent watch definitions live with the owning agent in
`agents/<id>/watches.json`.

Example:

```json
[
  {
    "id": "open-pr-review",
    "name": "Open PR review",
    "enabled": true,
    "trigger": { "kind": "time", "cron": "0 */2 * * *" },
    "action": {
      "kind": "command",
      "command": "shrimpy github scan-open-prs --json"
    },
    "emit": {
      "policy": "on_change",
      "channel": "dev-log",
      "template": "Open PR state changed: {{summary}}"
    }
  }
]
```

This is owned by the agent. The emitted message is ordinary channel
communication. The channel is meaningful because `dev-log` is a real work log,
not a fake wake pipe.

## Current State

- Agent-owned watches live in `agents/<id>/watches.json`.
- Time triggers use `{ "kind": "time", "cron": "..." }` or
  `{ "kind": "time", "everyMs": 60000 }`.
- The gateway loads all agent watch files, advances time triggers with the
  watch clock, and records watch run history under
  `runtime/watches/`.
- `shrimpy watches` lists, shows, manually runs, and inspects watch history.
- Emitted messages carry watch provenance and are routed through ordinary channel
  membership and agent channel policy.
- `shrimpy watches` is the one public command for watch inspection and manual
  runs. `agents/<id>/watches.json` is the one public config location for this
  work.

## Build

- Rename the mental model from watch-owned jobs to agent-owned watches.
- Keep a small runtime clock/runner service, but make ownership explicit in
  every definition, run record, inspection view, and emitted message.
- Remove the gateway requirement that at least one watch exists.
- Stop seeding an enabled broad heartbeat as a default. Keep memory, journal,
  security, mechanic, or other recurring work explicit and agent-owned.
- Add watch execution modules:
  - `src/watches/actions.ts`
  - `src/watches/runner.ts`
  - `src/watches/run-store.ts`
- Keep `src/watches/clock.ts` focused on due-time calculation and persisted next-run state.
- Replace `kind: "agent"` actions with clearer primitives:
  - `kind: "command"`: run a deterministic command and capture output.
  - `kind: "message"`: send explicit text/system content to a meaningful
    channel.
  - Optional later: `kind: "builtin"` for narrow Shrimpy inspections that should
    not require shelling out.
- Add emit policies:
  - `never`: record the run only.
  - `always`: emit a message every successful run.
  - `on_output`: emit command stdout only when non-empty.
  - `on_change`: emit only when successful comparable output changed.
  - `on_failure`: emit only when action execution fails.
- Persist watch run history separately from channel logs, for example:
  - `runtime/watches/<agent-id>/runs.jsonl`
  - `runtime/watches/<agent-id>/active.json`
- Record at least: owner agent id, watch id, run id, trigger, started/finished
  times, status, attempts, observation summary, output hash, emitted channel
  message ids, and error.
- Make emitted channel messages attributed and inspectable:
  - sender/source identifies the watch owner or system watch runner;
  - origin includes watch id, run id, target channel, and `shrimpy watches show`
    / `history` inspect commands.
- Upgrade CLI inspection:
  - `shrimpy watches list [--agent <id>]`
  - `shrimpy watches show <agent>/<watch>`
  - `shrimpy watches history <agent>/<watch>`
  - `shrimpy watches run <agent>/<watch>`
- Expose only `shrimpy watches`; do not keep the old command as a legacy alias.
- Implement real concurrency behavior or remove the knob:
  - `forbid`: skip when the same watch is already active.
  - `allow`: permit overlapping runs.
  - `replace`: abort or mark the old run only if the runner can really do it.
- Implement retry only if attempts and backoff are recorded in run history.
  Otherwise remove retry from the active schema until needed.

## Boundaries

- Do not make watches a central routing system.
- Do not let a watch select an agent to wake. It may send a message; channel
  presence and agent-owned wake policy do the rest.
- Do not create fake channels merely to wake an agent. Channel messages are for
  real communication or semantic logs.
- Do not make every watch emit. Recording "nothing changed" in run history is a
  valid and often preferred outcome.
- Do not bury named work under a broad heartbeat. Memory, journal, security,
  mechanic, and app-specific checks should be individually inspectable watches.
- Do not make channels the operational source of truth for watches. Run history
  is operational state; channels are communication.
- Do not add legacy compatibility paths or migrations unless the user explicitly
  asks for them.

## Replacement

- Replace old `{ channel, instructions }` recurring definitions with explicit
  agent-owned watch definitions.
- Replace old `action.kind = "agent"` channel targets with `command` or
  `message` watch actions.
- Remove the old default enabled heartbeat.
- Update setup templates, docs, and tests to describe recurring work as
  agent-owned watches, not global clock jobs or special agent wakeups.

## Related Items

- [channels.md](../reference/channels.md): channel presence, agent-owned wake
  policy, and channel-message attribution/provenance.
- [MECH-001](mech-001-skill-opportunity-watch.md): a mechanic
  usage assessment should be a mechanic-owned watch that records run history and
  emits a user-facing message only when there are useful recommendations.
- [SECURITY-002](security-002-default-security-audit-agent.md): a default
  security audit should be a security-agent-owned watch, not hidden heartbeat
  work.

## Done

- Recurring work is represented as agent-owned watches.
- Gateway/runtime can run with zero configured watches.
- Watch runs are persisted and inspectable without relying on channel logs.
- Command and message actions are supported.
- Emit policies `never`, `always`, `on_output`, `on_change`, and `on_failure`
  are implemented and inspectable.
- Emitted channel messages carry attribution/provenance back to owner agent,
  watch id, and run id.
- CLI inspection can list, show, manually run, and inspect history for watches.
- No default broad heartbeat is seeded.
- Tests cover watch ownership, run persistence, emit policies, emitted-message
  provenance, concurrency behavior, and no-op runs that emit nothing.
