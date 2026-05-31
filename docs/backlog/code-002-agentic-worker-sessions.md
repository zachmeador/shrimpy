# CODE-002: Agentic Worker Sessions

Status: draft
Priority: P1
Area: Coding Agents

## Why

`run_child` is currently a blocking one-shot Shrimpy/Pi run: the parent gives it
one prompt, waits for completion, and receives final assistant text. That is too
small for agentic coding delegation.

Shrimpy agents should be able to start managed worker sessions backed by Codex,
Claude Code, or Pi. A worker is a durable Shrimpy record around a backend coding
session/thread with a clear work spec, detailed logs, status, and a compact
summary. The backend process may be long-lived or may exit when a turn completes;
the Shrimpy worker stays open for parent review and follow-up until the parent
closes it.

## Build

- Define a first-class worker session model with stable ids, parent lineage,
  owner agent, goal, cwd, tool/provider kind, optional channel/return path,
  status, timestamps, and completion policy.
- Add CLI coverage before tool automation, for example:
  - `shrimpy worker start ...`
  - `shrimpy worker list`
  - `shrimpy worker status <id>`
  - `shrimpy worker read <id>`
  - `shrimpy worker send <id> <prompt>`
  - `shrimpy worker wait <id>`
  - `shrimpy worker cancel <id>`
  - `shrimpy worker close <id>`
- Keep `shrimpy worker wait <id>` as a blocking CLI command for humans and
  scripts. Agent-facing async continuation should use durable waits from
  [WAIT-001](wait-001-durable-agent-waits.md), not a worker-specific poll loop.
- Add daemon tools that expose the same worker controls to Shrimpy agents with
  bounded, structured outputs.
- Make worker status structured enough for durable wait predicates, such as
  waiting until a worker is complete, blocked, failed, or ready for parent
  review.
- Support three first-class worker backend types:
  - `codex` for managed Codex terminal sessions.
  - `claude` for managed Claude Code terminal sessions.
  - `pi` for managed Shrimpy/Pi sessions.
- Keep a clear adapter seam between backend-specific process/session handling and
  the shared worker lifecycle model.
- Implement worker execution through a small Shrimpy worker runner, not by
  sprinkling raw `spawn()` calls through daemon tools. The runner owns the
  backend process while it is running, captures stdout/stderr/events, tracks the
  backend session/thread id, and exposes one lifecycle to Shrimpy.
- Use direct stdio/JSON protocols when a backend supports them; use a PTY only
  when the backend requires terminal behavior for reliable operation.
- Treat process exit as the normal completion signal for non-interactive backend
  turns. On exit, update worker status, refresh the summary, and notify the
  parent through the normal worker/wait surfaces; do not close the Shrimpy worker
  unless the parent asked to close it.
- For follow-up after review, resume the same backend session/thread under the
  same Shrimpy worker id rather than creating a new worker.
- Give every external worker a process group and a cleanup path. On close/cancel
  or Shrimpy shutdown, terminate the process group with a grace period before
  force-killing it.
- Add a parent/watchdog guard so workers are not left running if the Shrimpy
  gateway dies unexpectedly. Use a workspace heartbeat with an owner token rather
  than relying only on parent pid checks; if the heartbeat stops or ownership
  changes, the runner kills its process group and records the worker state.
- On Shrimpy restart, do not adopt already-running external backend processes.
  Terminate them through the recorded process group, preserve captured logs, and
  mark the worker state clearly so the parent can resume with a fresh backend
  process if needed.
- Define a shared worker instruction contract: work autonomously until the
  delegated goal is complete or blocked, keep progress inspectable, avoid
  destructive actions, and leave final approval/publish/merge/delete decisions to
  the parent agent.
- Prefer backend modes that can resume the same backend session/thread for
  follow-up. Non-interactive commands that exit after each turn are fine when
  they provide a reliable way to continue the same conversation.
- Persist worker metadata and enough transcript/process state for later
  inspection after the parent session exits.
- Store detailed worker logs for audit/debugging and maintain a compact Markdown
  summary for turn context, listing, and later review. The summary should be refreshed
  as the worker changes state and finalized when the parent closes the worker.
- Support the normal review loop: when a worker reports that the spec is complete,
  the parent is notified with the worker id and summary; if the user asks for
  changes, the parent sends the feedback to the same worker session unless it has
  already been closed.
- Ensure every external worker process is supervised for its whole lifetime:
  Shrimpy must be able to stop it, observe exit, record final state, and clean it
  up during normal shutdown.
- Surface worker status in session-status and turn context so agents can
  autonomously notice blocked, running, failed, and completed work.
- Scope workers to an owning agent, and record enough lineage for relevance:
  parent session, session kind, optional originating channel, optional return
  channel, goal, and current status.
- Start with a simple ownership rule: an agent manages the workers it starts.
  Do not design flows for one agent managing another agent's workers until there
  is a concrete need.
- Filter worker turn context entries so an agent sees workers it owns, with emphasis
  on workers linked to the current session and, when present, current channel;
  unrelated workers should stay available through explicit inspection commands
  rather than appearing in every turn.
- Replace the current `run_child` path with worker-session primitives. Keep a
  small `run_child`-style helper only if it is a thin wrapper over the same
  worker lifecycle and does not create a second implementation path.

## Boundaries

- Do not make workers disappear behind a plain function call. After a worker
  starts, Shrimpy should track the backend session/thread, capture output from
  each backend process run, expose status, and let the parent send follow-up,
  wait for active work, stop active work, or close the worker when review is done.
- Do not let worker autonomy include destructive or irreversible actions by
  default. Workers may propose those actions, but the parent must decide.
- Do not invent a worker-specific async wait/wake loop. Worker state should be
  observable enough for [WAIT-001](wait-001-durable-agent-waits.md) to wake the
  originating agent/session when a worker reaches the requested condition.
- Do not require external coding-agent CLIs for Shrimpy to keep working.
- Do not invent a second channel system; when a worker needs a channel return
  path, use normal Shrimpy channels. Otherwise, keep status, summaries, and logs
  available through worker inspection commands and parent-session turn-context items.
- Do not design isolated git worktree ownership in this slice. Workers run in the
  cwd they are given; worktree strategy can be a separate backlog item later.
- Do not add legacy aliases once the worker-session interface replaces
  `run_child`.
- Keep backend-specific process handling behind adapters so Codex, Claude Code,
  and Pi do not leak different control models into agent-facing tools.
- Do not leave dangling worker processes. If Shrimpy cannot reconnect to a
  running external worker after restart, it must have a conservative cleanup path
  that marks the worker state clearly and ensures the process is not left running
  unmanaged.

## Notes

- Related: [CODE-001](code-001.md) should detect whether Codex and Claude Code
  CLIs are available before those backends are enabled.
- Related: the completed effective capability view should expose and enforce
  worker-control tools.
- Related: [CTX-007](ctx-007.md) should include worker/session status in compact
  turn-context items.
- Related: [WAIT-001](wait-001-durable-agent-waits.md) should provide durable
  continuation for "wait until this worker is done, then wake me" flows across
  both channel and TUI/direct sessions.
- Design pressure is sketched in
  [../musings/asynchronous-agents.md](../musings/asynchronous-agents.md),
  especially worker sessions, explicit lineage, pending child work, and the child
  session contract.
- Research notes suggest starting from managed CLI turns: coding-agent CLIs can
  accept a full prompt/spec, exit when done, and often persist a session id that
  can be resumed for follow-up. See [../research/pi-agent.md](../research/pi-agent.md)
  for Pi SDK/RPC options and [../research/ralph-loops.md](../research/ralph-loops.md)
  for one-shot Claude loop patterns.
- Local CLI inspection suggests the likely backend drivers:
  - `pi`: prefer the SDK/RPC path because it already exposes prompts, follow-up,
    abort, state, messages, and structured events.
  - `claude`: prefer `claude -p --output-format stream-json` for managed turns,
    with `--session-id`/`--resume` to continue the same worker conversation.
  - `codex`: prefer `codex exec --json` for managed turns, with `codex exec
    resume --json <session>` to continue the same worker conversation. Keep
    app-server/remote-control as a possible richer backend later, not a blocker
    for the first worker implementation.
- The important product line is that a Shrimpy agent can autonomously supervise
  coding workers: inspect what happened, iterate with them, and choose whether
  to publish, continue, or discard the result.
- Worker prompts should make the operating contract explicit: pursue all
  requested goals without waiting for hand-holding, stop and report when blocked,
  avoid destructive actions, and defer parent-owned decisions such as merging,
  publishing, deleting, resetting, or broad rewrites.
- Worker turn context relevance likely needs tiers: current parent session first,
  current channel/return channel next when a channel exists, other active
  workers owned by the same agent as a compact count or summary, and cross-agent
  workers only when explicitly addressed or requested.
- Worker storage should prefer two views of the same work: raw backend/session
  events for full inspection, and a compact Markdown summary that captures goal,
  status, key actions, files/artifacts touched, blockers, and final result.
- A worker reporting "complete" should not close itself. Parent review decides
  whether to send changes, accept the result, or close the worker.

## Done

- Workers can be started, inspected, messaged, waited on, and cancelled from CLI.
- Shrimpy agents can perform the same lifecycle operations through daemon tools.
- Worker completion/blockage/failure status can be used as a durable wait
  condition without adding a second worker-specific waiting path.
- Worker metadata records parent lineage, session kind, goal, backend, cwd,
  status, optional return path, and timestamps.
- Worker storage includes detailed logs and a compact Markdown summary refreshed
  during work and finalized at worker close.
- Completed work can receive follow-up under the same Shrimpy worker id by
  resuming the same backend session/thread until the parent closes it.
- External workers run through the Shrimpy worker runner with process-group
  cleanup and workspace-heartbeat protection against dangling processes.
- External worker processes are supervised, terminated or reattached on restart,
  and never left running without Shrimpy knowing how to clean them up.
- Turn context make worker relevance clear enough that an agent with multiple
  active sessions can tell which workers matter to the current turn.
- Worker backend types exist for Codex, Claude Code, and Pi, with at least one
  backend implemented end to end and the others represented by explicit
  availability/status errors until implemented.
- Worker session prompts include the shared autonomy and non-destructive action
  contract.
- Worker state appears in relevant session-status and turn context.
- Tests cover lifecycle, persistence, cancellation, restart inspection, and
  agent tool output shapes.
