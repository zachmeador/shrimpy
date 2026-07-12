# 🦐 Agent Loop Workflows

Date: 2026-07-10
Status: Research

## Executive Take

An agent loop is repeated model-directed work with an explicit reason to continue and an explicit reason to stop. The most useful patterns differ along several independent axes: what starts work, what continues it, what decides it is done, how many actors participate, where state lives, and which actions require approval.

For Shrimpy, loop workflows should be compositions of existing and future primitives rather than separate runtime modes:

- Pi owns the inner model/tool loop and session mechanics.
- Shrimpy owns triggers, durable run state, routing, background execution, and cross-session coordination.
- Skills describe how to perform and verify work; they should not become the scheduler or workflow state store.
- Workers provide separate execution contexts for delegated coding tasks; channels provide routing and logs, not hidden workflow coordination.

Shrimpy already has most of the pieces for manual tool-using work and scheduled polling. Goal-evaluated continuation is technically close because Pi exposes turn lifecycle events and follow-up queues. The missing architectural seam is a durable **run controller** that records the goal, evaluator, attempts, budgets, outcomes, and cancellation state independently of the Pi transcript. Reactive multi-agent workflows should come later as a composition of triggers, run controllers, and workers.

## Loop Dimensions

A loop can be described with six questions:

1. **Trigger:** What starts or wakes it—human input, time, an external event, a queue item, or completion of another step?
2. **Continuation:** What causes another cycle—more tool calls, an evaluator rejection, a retry policy, another queued item, or a human reply?
3. **Stop condition:** Who decides done—the acting model, a deterministic check, an evaluator model, a budget, cancellation, or an external terminal event?
4. **Topology:** Is the work one session, a sequential chain, fan-out/fan-in, debate, reviewer loop, or a dynamic graph?
5. **State scope:** Does state live only in one model turn, in a Pi transcript, in a durable run record, or in an external system of record?
6. **Authority:** Can it act autonomously, or must it pause at approval gates?

This decomposition separates mechanisms that are often bundled together. For example, an autonomous maintenance workflow may be an event or schedule trigger wrapped around a goal-bounded body, with a reviewer topology and permission gates. None of those choices requires a distinct inner agent loop.

## Common Workflow Shapes

| Shape | Trigger | Continuation | Stop | Best fit | Shrimpy/Pi fit today |
| --- | --- | --- | --- | --- | --- |
| In-turn tool loop | One user/model message | Assistant emits tool calls; tool results return to the model | Assistant emits no more tool calls, errors, or is aborted | Ordinary tool-using work | Native Pi strength |
| Manual turn loop | Human message | Human reviews and sends another message | Human or acting model considers the task complete | Exploration, ambiguous work, decisions | Native Pi session plus Shrimpy direct/channel sessions |
| Goal-evaluated loop | Human, event, or schedule starts a run | Evaluator rejects the latest attempt and injects feedback | Pass, attempt/token/time budget, cancellation, or blocker | Work with testable done criteria | Mechanically easy to prototype; durable control state is missing |
| Retry/recovery loop | Operation failure | Policy retries with backoff or changed input | Success, non-retryable failure, or retry budget | Flaky providers, CI, external APIs | Pi handles some model retry; Shrimpy lacks a general run-level retry policy |
| Scheduled/polling loop | Cron or interval | Clock starts independent runs | Watch disabled or external terminal condition | Recurring summaries, maintenance, checking external state | Shrimpy watches already cover the trigger; downstream run ownership needs strengthening |
| Event/queue loop | Message, webhook, file change, issue, review, or queue item | More events or queue items arrive | Subscription disabled or queue drained | Reactive home-agent work | Channel messages are event-like; typed watch triggers beyond time are not implemented |
| Human-gated loop | Any trigger | Human approval or missing input resumes it | Goal passes, human cancels, or budget ends | Irreversible, sensitive, or subjective actions | Conversation can ask and resume, but there is no durable paused-run lifecycle |
| Sequential workflow | Prior step completes | Output becomes the next step's input | Final step passes or a step fails | Scout → plan → implement, draft → review → revise | Pi ships an example subagent extension; Shrimpy workers can be orchestrated by prompts but have no workflow record |
| Fan-out/fan-in workflow | Parent run starts children | Children finish; aggregator or judge compares results | Winner/consensus selected or budget ends | Alternative solutions, research, adversarial review | Pi can run parallel tool calls and example subagents; Shrimpy has detached workers but no join/judge coordinator |
| Continuous daemon loop | Service start | Events, ticks, or state changes | Service stop, fatal failure, or explicit disable | Gateway, inbox watcher, long-lived environment monitor | Shrimpy gateway and watch clock are the service layer; agent reasoning should remain bounded runs within it |

## What Pi Makes Easy

This assessment is based on Shrimpy's pinned `@earendil-works/*` Pi packages at `0.80.6`, the installed package source, and Pi's upstream [agent loop](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts), [agent session](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/agent-session.ts), and [subagent example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent).

### Inner agentic loop

Pi already performs the canonical model → tool calls → tool results → model cycle. Multiple tool calls from one assistant message can run in parallel unless a tool or session requires sequential execution. Shrimpy should not rebuild this loop.

### Continuation and interruption

Pi's stateful agent has steering and follow-up queues. Steering enters after the current assistant turn and tool batch; follow-up enters when the agent would otherwise stop. `AgentSession` exposes `steer()`, `followUp()`, `sendUserMessage()`, `abort()`, and queue inspection. These are the key mechanical ingredients for an evaluator to say “not done; here is why” without starting a separate top-level session.

Pi's lower-level loop config also has `shouldStopAfterTurn`, but the pinned stateful `Agent`/`AgentSession` construction surface does not expose that callback directly, and stopping early is only half of goal-loop behavior. Evaluator rejection still needs to enqueue feedback that causes another turn.

### Turn lifecycle hooks

Extensions receive `turn_start`, `turn_end`, `agent_start`, `agent_end`, message events, tool events, and provider events. A goal controller can evaluate only terminal-looking turns and enqueue feedback before Pi exits the current agent loop.

The safest integration point is `turn_end`, not `agent_end`. Shrimpy's current [`runSessionTurn()`](../../src/sessions/turn-output.ts) resolves on the first `agent_end`. Pi can perform a post-`agent_end` continuation when an extension queues work from an `agent_end` handler, but Shrimpy's wrapper would already consider that turn finished. Enqueuing evaluator feedback from an awaited `turn_end` extension handler keeps the work inside one Pi loop and produces one final `agent_end`.

### Transcript, compaction, models, and usage

Pi already persists session messages, resumes sessions, compacts context, supports branching/forking, switches model/thinking level, reports session usage, and aborts work. These are strong foundations for a bounded loop. Shrimpy should attach a run record to a Pi session instead of duplicating the transcript.

### Extensible orchestration experiments

Pi extensions can register commands and tools, spawn other Pi processes, and observe their output. The upstream subagent example implements single, parallel, and chain modes, which demonstrates feasibility. It is an example extension rather than a first-class durable workflow scheduler, so Shrimpy should learn from its process and output handling without importing its state model wholesale.

## What Pi Does Not Make Easy

### Deciding whether a domain goal is satisfied

Pi knows when the assistant stopped calling tools; it does not know whether a Lighthouse score, test suite, inbox queue, household task, or research standard is actually satisfied. A goal loop still needs an evaluator contract.

Evaluator order should be:

1. Deterministic command or structured state check when available.
2. Structured tool result or external system state.
3. Evaluator model only when judgment is genuinely required.
4. Acting model self-assessment only as the weakest fallback.

The acting model should not be the sole judge for the same reason a fresh reviewer is useful: it is biased by its own narrative and may confuse effort with completion.

### Durable run control

A Pi transcript records conversation, not the operational truth for a long-running workflow. Shrimpy would still need a record containing at least:

- run id, owner agent, source trigger, and attached session;
- goal and evaluator specification;
- status such as `running`, `waiting`, `complete`, `blocked`, `failed`, `cancelled`, or `budget_exhausted`;
- attempt count and evaluator outcomes;
- time, turn, token, and cost budgets;
- current step and child worker ids for composed workflows;
- cancellation and resume metadata;
- publication/reporting destination and idempotency key.

This state should live under Shrimpy runtime/state paths and remain inspectable through CLI commands. It should not be reconstructed from prose in the transcript.

### Scheduling and external events

Pi sessions do not own cron, daemon lifetime, webhooks, or queue subscriptions. That belongs in Shrimpy. Time watches already provide cron/interval triggers, and channel messages already provide a general event ingress path.

The current watch concurrency policy covers the watch action itself. For a message watch, that action is finished once the message is appended; it does not remain active for the downstream agent work. A short interval can therefore enqueue multiple turns while a long goal run is still active. A future watch-to-run composition needs run-scoped concurrency such as `forbid`, `replace`, `queue`, or `allow`, keyed by the workflow and target.

### Cross-session and multi-agent coordination

Pi can spawn subprocess agents, and Shrimpy workers already provide detached Codex/Pi turns, persistent worker records, amendments, waiting, cancellation, and summaries. Neither layer currently provides a durable DAG, fan-in barrier, judge decision, child budget propagation, or safe shared-worktree policy.

For Shrimpy, coding workers are the better execution unit than channel chatter between persistent home agents. Channels should remain shared rooms and logs. Workflow coordination should hold worker ids in the run record and publish only meaningful status or results.

### Pause and approval semantics

A session can ask the user a question and receive a later turn, but a durable workflow needs to distinguish `waiting_for_input` from complete or blocked, remember the exact approval requested, and resume the same run when the answer arrives. This is especially important when the trigger was a watch rather than a live user.

### Reliability boundaries

Longer loops amplify ordinary failure modes: repeated side effects, stale observations, context drift, runaway spend, overlapping runs, partial child completion, and evaluator false positives. Pi supplies abort and transcript mechanics; Shrimpy must supply idempotency, retry classification, budgets, leases/concurrency, and recovery after gateway restart.

## Mapping to Current Shrimpy

| Concern | Current owner | Current strength | Gap for richer loops |
| --- | --- | --- | --- |
| Model/tool iteration | Pi agent loop | Mature and already integrated | Do not duplicate |
| Session transcript and context | Pi plus Shrimpy session assembly | Persistent, inspectable, compactable | Link sessions to run ids and evaluator records |
| Human/direct turns | Direct TUI and `run` sessions | Already natural | Optional goal envelope and budgets |
| Background time triggers | Watches and watch clock | Cron/interval, history, command/message actions | Run-scoped concurrency and terminal disable policy |
| Event ingress | Channels, surfaces, gateway delivery | Unified typed message path | Typed external trigger adapters and idempotent event/run correlation |
| Agent execution lanes | Gateway `SessionRegistry` | FIFO serialization per channel session and user stop | A long goal run can monopolize a lane; background runs may need dedicated sessions |
| Verification instructions | Skills | Good place for repeatable checks and scripts | Machine-readable evaluator result contract |
| Delegated coding | Workers | Detached, inspectable, resumable through amendments | Fan-out/fan-in, worktree isolation, judging, and parent run state |
| Public reporting | Channel publication helpers and outbox | Deliberate egress with receipts | One final run report plus optional bounded progress events |

## Likely Shrimpy Shape

Goal evaluation, scheduled execution, reactive triggers, and worker orchestration can share one small run model. Their differences belong in trigger, evaluator, topology, and authority configuration.

### 1. A run controller around a Pi session

Conceptually:

```typescript
interface GoalRunSpec {
  objective: string;
  evaluator: EvaluatorSpec;
  maxAttempts: number;
  maxDurationMs?: number;
  maxTokens?: number;
  maxCost?: number;
}

interface Evaluation {
  passed: boolean;
  summary: string;
  evidence: string[];
  feedback?: string;
}
```

On a terminal-looking `turn_end`, the controller evaluates the external result. If it passes, the run finishes. If it fails with budget remaining, the controller records the evaluation and enqueues a follow-up containing concise evidence and required next work. If the budget ends, it records `budget_exhausted` and lets Pi finish normally.

The evaluator should be injected through Shrimpy's session plan/resource-loader path so it is available to both direct and gateway sessions without becoming a global ambient Pi extension. The goal state belongs to the Shrimpy run controller; the extension is only the awaited lifecycle bridge.

### 2. Independent bounded runs for scheduled work

A time watch should start or signal a bounded run rather than imply one immortal agent call. The run gets its own id, session attachment, evaluator/budget, and final outcome. For ordinary recurring summaries, each tick is one independent run. For polling-until-terminal work such as a PR, each tick can inspect external state and either no-op, perform a bounded repair run, or mark the recurring job terminal.

This avoids holding a model call open while nothing changes and lets the gateway restart safely between observations.

### 3. Workflow composition over workers

A later workflow controller can use the same run record to express:

- sequential steps with explicit inputs and outputs;
- parallel worker children with bounded concurrency;
- a fan-in barrier;
- a reviewer/judge step with fresh context;
- amendment cycles back to selected workers;
- per-child and parent budgets;
- final reporting and cleanup.

The agent can choose actions through normal tools/CLI, while the controller persists lifecycle truth. Deterministic orchestration should be code; judgment about which branch to pursue can remain model-driven.

### 4. Trigger adapters remain outside Pi

Time watches, channel events, future webhooks, file changes, and external queues should all produce a normalized start/signal request for the run controller. A trigger should not need to know how Pi loops internally.

## Suggested Order of Experiments

1. **Document and instrument existing loops.** Count Pi turns, tool cycles, watch-triggered turns, worker turns, duration, tokens, and outcomes without changing behavior.
2. **Prototype a deterministic goal loop in a direct session.** Use a command evaluator, a hard attempt cap, one attached Pi session, and a `turn_end` continuation bridge. This proves the Pi seam without adding scheduling or subagents.
3. **Persist minimal run records and CLI inspection.** Add start/show/list/cancel semantics before allowing background execution. Exact command names can wait until the state model is settled, but every capability must remain CLI-reachable.
4. **Let a time watch start a run.** Add run-scoped concurrency and restart recovery. Avoid interpreting watch-message publication as the lifetime of the downstream run.
5. **Add evaluator-model fallback.** Keep it separate from the acting model when practical and record its evidence, model, tokens, and decision.
6. **Compose two or three workers.** Start with a fixed scout/reviewer or implement/review/revise pattern, explicit child limits, and isolated worktrees for concurrent writes.
7. **Generalize triggers and topology only after repeated examples.** Event watches and dynamic graphs should emerge from concrete home-agent workflows, not from building a generic workflow engine first.

## Design Guardrails

- Every autonomous goal run has an attempt cap and at least one finite time, token, or cost budget; every run is cancellable.
- Deterministic checks outrank model judgment.
- Evaluations store evidence, not only pass/fail prose.
- Schedules create bounded runs; they do not keep a reasoning turn alive between observations.
- Retried actions must be idempotent or explicitly guarded.
- A long background run should not silently monopolize a conversational channel session.
- Progress publication is bounded and intentional; internal evaluator prompts stay out of public channels.
- Worker completion is an observation, not automatic acceptance.
- Parallel writers use isolated worktrees or non-overlapping scopes.
- Skills teach the agent how to work and verify. Runtime state records what is running and why.
- Start with one run and one evaluator. Add multi-agent topology only when it improves a measured bottleneck.

## Open Questions

- Should goal runs attach to existing conversational sessions, or always use dedicated run sessions and summarize back into the conversation?
- What is the smallest evaluator result schema that works for commands, structured state, and model judges?
- Should a recurring job be one durable parent with child runs, or only a watch plus independent runs?
- Which run statuses should wake the owning agent or notify a human?
- How should a human answer correlate to a paused run without making channels into workflow stores?
- Which model policy should evaluators use, and when is a fresh-context evaluator worth its cost?
- Should worker worktree creation be part of the worker backend or the workflow controller?
- Can Pi expose a more direct session-level next-turn/evaluation hook in a future version, or is the extension bridge sufficient?

## Bottom Line

Pi makes the **inside** of an agent attempt easy. Shrimpy already makes scheduled attention, durable agents, routing, and detached workers possible. The valuable future feature is the **outside** of the attempt: a small durable controller that knows why the run exists, what “done” means, what it has spent, what it is waiting for, and whether another attempt is allowed.

That controller would make goal, scheduled, reactive, and multi-agent workflows one coherent system built from Shrimpy's existing primitives.
