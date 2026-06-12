# CODE-002: Agentic Worker Sessions

Status: review
Priority: P1
Area: Coding Agents
Depends On: [CODE-001](code-001.md)

## Why

Coding delegation needs a durable worker record: one spec in, inspectable status/logs out, with follow-up amendments available until the parent closes the work.

Shrimpy agents should delegate coding work by writing a build spec and handing it to a managed worker backed by Codex or Pi. A worker is a durable Shrimpy record around a backend coding session/thread: the spec, detailed logs, structured status, and a compact summary. The worker stays open for parent review until the parent closes it.

## Interaction Model

Spec-as-contract, minimal agent:agent interaction.

- The parent writes a succinct, self-contained build spec (the `coding-delegation` skill defines the packet). The spec is a contract: the worker executes it autonomously until the goal is complete or it is blocked.
- One worker turn is one contract execution. The backend process runs headless, emits structured events, and exits when the turn completes. Exit is the normal completion signal.
- Follow-ups are contract amendments, not conversation: an unblocking fact after the worker reports blocked, or a corrective delta after parent review finds the result misses the spec. Amendments resume the same backend session/thread under the same worker id.
- The parent reviews results (status, summary, logs, diff), not live progress. Mid-turn steering is a non-goal; correction is cancel + amend.
- Structured status and the compact summary are the interface between worker and parent. Messaging exists only to deliver the spec and its amendments.

## Current State

- `run_child` has been removed; worker delegation is the durable path.
- `shrimpy worker start|list|status|read|tail|send|wait|cancel|close` commands and `state/workers.json` records exist. Codex workers run detached through `codex exec --json`; Pi workers run through Shrimpy's direct Pi session path with the `coding` model policy; Claude Code is deferred to P3.
- The all-agent `coding-delegation` source-default skill defines the prompt-side handoff packet (the contract) and describes the current worker CLI.
- Channel inspection no longer guesses at worker-shaped provenance. CODE-002 introduces the first-class worker protocol/status shape instead of `origin.workerId`, `sourceKind: "worker"`, or `worker:` actor ids.
- Session status and turn-context plumbing include owned worker outcomes. Current-session and current-channel workers appear as detailed items, and other owned outcomes collapse to compact counts with inspection commands.

## Build

- Define a first-class worker session model: stable id, parent lineage (session and kind), owner agent, goal/spec, cwd, backend kind, related channel when applicable, status, timestamps. Workers stay open until the parent closes them.
- Add CLI coverage before tool automation:
  - `shrimpy worker start ...`
  - `shrimpy worker list`
  - `shrimpy worker status <id>`
  - `shrimpy worker read <id>`
  - `shrimpy worker tail <id> [--follow]`
  - `shrimpy worker send <id> <prompt>` — contract amendment (unblocking fact or review delta), not chat
  - `shrimpy worker wait <id>` — blocking, for humans and scripts; no agent-facing async continuation primitive
  - `shrimpy worker cancel <id>`
  - `shrimpy worker close <id>`
- Make worker status structured: at least running, complete, blocked, failed, cancelled.
- Support backend types behind one adapter seam: `codex`, `pi`, and explicit deferred status for `claude`. Select Pi/Shrimpy worker models through the `coding` model policy.
- Default execution shape is a headless one-shot turn: spawn with the spec, stream JSON events, treat process exit as turn completion. Use a PTY only if a backend requires terminal behavior. Pi workers may run in-process via SDK/RPC under the same lifecycle.
- Verified backend drivers (local CLI versions, 2026-06):
  - `codex` (0.13x): `codex exec --json`, with `codex exec resume <session-id> --json` for amendments.
  - `pi`: Shrimpy direct-session path using the owning agent, worker cwd, stable worker id session label, and `coding` model policy.
- Define an explicit non-interactive permission posture per backend adapter, consistent with the non-destructive contract. Headless turns cannot answer permission prompts: a worker that hits an unanswerable gate must surface as blocked, not hang.
- Implement execution through a small worker runner. The runner owns the backend process/session, captures stdout/stderr/events, tracks the backend session/thread id when available, and exposes one lifecycle to Shrimpy.
- Give every external worker a process group and cleanup path: send `SIGTERM` on cancel/close when a pid is known, poll briefly, escalate to `SIGKILL` if the process group is still alive, apply the same cleanup when stale reconciliation finds a dead supervisor, preserve captured logs, and mark worker state clearly.
- Support per-turn max runtime with `--timeout-ms` on start and amendment turns; timed-out turns are recorded as cancelled.
- Bake the worker instruction contract into every dispatched spec: pursue the goals without waiting for hand-holding, stop and report when blocked, avoid destructive actions, leave merge/publish/delete/reset decisions to the parent.
- Store two views of the same work: raw backend events/logs for full inspection, and a compact Markdown summary (goal, status, key actions, files touched, blockers, result) refreshed on state change and finalized at close.
- Feed worker state into turn context as a context producer through the existing renderer — no worker-only prompt wrapper. Relevance tiers: workers of the current session first, current channel next when one exists, other owned workers as a compact count; cross-agent workers only on explicit request. Pi-backed workers use the normal turn-context path (session plan `prepareTurnContext` for direct sessions, rendered context with the explicit turn value for queued dispatch).
- Surface worker status in session-status so agents autonomously notice blocked, failed, and completed work.
- Ownership rule: an agent manages the workers it starts. Do not design cross-agent worker management until there is a concrete need.
- Remove the legacy child-run delegation surface so worker records are the only delegation primitive.

## Boundaries

- No conversational supervision. No chat loop with workers, no mid-turn steering, no long-lived interactive backend control in this slice — claude's streaming-input mode and codex app-server stay parked unless amendment-by-resume proves insufficient.
- Workers do not disappear behind a plain function call: after start, status, amendment, wait, cancel, and close remain available.
- Worker autonomy excludes destructive or irreversible actions by default; workers propose, the parent decides.
- No worker-specific async continuation loop. Observability is inspection commands, turn context, and normal [channels](../reference/channels.md) when a parent explicitly forwards status.
- No worker-specific prompt rewriting or second ephemeral context injection mechanism; use the existing Shrimpy/Pi session hook path unless Pi is the proven constraint for a backend.
- External worker backends stay optional; Shrimpy must work without them.
- No second channel system; no isolated git worktree ownership in this slice (workers run in the cwd they are given); no legacy child-run aliases.
- Backend process/session handling stays behind adapters so Codex and Pi do not leak different control models into the worker CLI.
- No dangling worker processes: if Shrimpy sees a running worker whose recorded supervisor pid is gone, it attempts to terminate and then force-kill the recorded process group before marking the state clearly.

## Notes

- Related: [CODE-001](code-001.md) detects worker backend availability before those backends are enabled; it records CLI versions too, since flags and JSON event schemas drift.
- Related P3 follow-ups: [CODE-003](later/code-003-claude-code-worker-adapter.md) for Claude Code and [CODE-004](later/code-004-agent-worker-tools.md) for daemon tools exposing worker controls to agents.
- Related: the stable turn-context boundary is documented in [turn-context.md](../reference/turn-context.md); workers add facts through turn context, not durable prompt prefixes.
- Design pressure is sketched in [../musings/asynchronous-agents.md](../musings/asynchronous-agents.md); Pi SDK/RPC options in [../research/pi-agent.md](../research/pi-agent.md).
- Spec quality is the lever. Most delegation failures should be fixed by improving the coding-delegation contract format, not by adding runtime interaction.
- A worker reporting complete does not close itself. Parent review decides accept, amend, or close.

## Done

- Workers can be started, inspected, amended, waited on, cancelled, and closed from the CLI.
- Worker status (running/complete/blocked/failed/cancelled) is structured and inspectable without a second worker-specific waiting path.
- Worker metadata records parent lineage, session kind, goal/spec, backend, cwd, status, related channel when applicable, and timestamps.
- Worker storage includes detailed logs and a compact Markdown summary with goal, status, key actions, files touched, blockers, and latest result, refreshed during work and finalized at close.
- Amendments resume the same backend session/thread under the same worker id until the parent closes it.
- Each backend adapter has an explicit non-interactive permission posture, and a worker that hits an unanswerable permission gate surfaces as blocked.
- External workers run through the runner with process-group cleanup on cancellation, close, and stale-pid reconciliation, including `SIGKILL` escalation after a grace period.
- Backend types exist for codex, claude, and pi, with Codex and Pi implemented end to end and Claude returning an explicit deferred status.
- Dispatched specs include the shared autonomy and non-destructive contract.
- Turn context feeds owned worker outcomes back to agents with current-session/current-channel relevance tiers and compact counts for other owned workers that need review. Cross-agent worker inspection remains explicit through the CLI.
- Generated session status surfaces completed, blocked, failed, and cancelled worker counts so agents notice outcomes during background wake turns.
- Tests cover lifecycle, persistence, cancellation, close cleanup, stale supervisor cleanup, relevance-tiered worker context, generated worker status context, Codex session-id parsing, and Pi direct-session result mapping.
