# 🦐 Agent Loop Workflows

Date: 2026-07-10
Status: Research
Trimmed: 2026-11-11. Git has the whole note.

## Executive Take

An agent loop is repeated model-directed work with an explicit reason to continue and an explicit reason to stop. The most useful patterns differ along several independent axes: what starts work, what continues it, what decides it is done, how many actors participate, where state lives, and which actions require approval.

For Shrimpy, loop workflows should be compositions of existing and future primitives rather than separate runtime modes:

- Pi owns the inner model/tool loop and session mechanics.
- Shrimpy owns triggers, durable run state, routing, background execution, and cross-session coordination.
- Skills describe how to perform and verify work; they should not become the scheduler or workflow state store.

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

| Shape | Trigger | Continuation | Stop | Best fit |
| --- | --- | --- | --- | --- |
| In-turn tool loop | One user/model message | Assistant emits tool calls; tool results return to the model | Assistant emits no more tool calls, errors, or is aborted | Ordinary tool-using work |
| Manual turn loop | Human message | Human reviews and sends another message | Human or acting model considers the task complete | Exploration, ambiguous work, decisions |
| Goal-evaluated loop | Human, event, or schedule starts a run | Evaluator rejects the latest attempt and injects feedback | Pass, attempt/token/time budget, cancellation, or blocker | Work with testable done criteria |
| Retry/recovery loop | Operation failure | Policy retries with backoff or changed input | Success, non-retryable failure, or retry budget | Flaky providers, CI, external APIs |
| Scheduled/polling loop | Cron or interval | Clock starts independent runs | Watch disabled or external terminal condition | Recurring summaries, maintenance, checking external state |
| Event/queue loop | Message, webhook, file change, issue, review, or queue item | More events or queue items arrive | Subscription disabled or queue drained | Reactive home-agent work |
| Human-gated loop | Any trigger | Human approval or missing input resumes it | Goal passes, human cancels, or budget ends | Irreversible, sensitive, or subjective actions |
| Sequential workflow | Prior step completes | Output becomes the next step's input | Final step passes or a step fails | Scout → plan → implement, draft → review → revise |
| Fan-out/fan-in workflow | Parent run starts children | Children finish; aggregator or judge compares results | Winner/consensus selected or budget ends | Alternative solutions, research, adversarial review |
| Continuous daemon loop | Service start | Events, ticks, or state changes | Service stop, fatal failure, or explicit disable | Gateway, inbox watcher, long-lived environment monitor |

## What Pi Does Not Make Easy

### Deciding whether a domain goal is satisfied

Pi knows when the assistant stopped calling tools; it does not know whether a Lighthouse score, test suite, inbox queue, household task, or research standard is actually satisfied. A goal loop still needs an evaluator contract.

Evaluator order should be:

1. Deterministic command or structured state check when available.
2. Structured tool result or external system state.
3. Evaluator model only when judgment is genuinely required.
4. Acting model self-assessment only as the weakest fallback.

The acting model should not be the sole judge for the same reason a fresh reviewer is useful: it is biased by its own narrative and may confuse effort with completion.

### Reliability boundaries

Longer loops amplify ordinary failure modes: repeated side effects, stale observations, context drift, runaway spend, overlapping runs, partial child completion, and evaluator false positives.

## Likely Shrimpy Shape

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

Pi 1.0.0's actionable `turn_end` and `agent_before_settle` hooks are described in [the Pi note](pi-agent.md#canonical-context-and-actionable-turn-boundaries).

### 2. Workflow composition over workers

A later workflow controller can use the same run record to express:

- sequential steps with explicit inputs and outputs;
- parallel worker children with bounded concurrency;
- a fan-in barrier;
- a reviewer/judge step with fresh context;
- amendment cycles back to selected workers;
- per-child and parent budgets;
- final reporting and cleanup.

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
- Which model policy should evaluators use, and when is a fresh-context evaluator worth its cost?
- Should worker worktree creation be part of the worker backend or the workflow controller?

## Bottom Line

Pi makes the **inside** of an agent attempt easy. The valuable future feature is the **outside** of the attempt: a small durable controller that knows why the run exists, what “done” means, what it has spent, what it is waiting for, and whether another attempt is allowed.
