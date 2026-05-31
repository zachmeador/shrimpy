# 🦐 Designing Asynchronous Agents

Date: 2026-04-19
Status: Draft

## Purpose

Capture the first-principles shape of an asynchronous home-agent system that actually feels coherent to a user.

The target is not just "an agent that can wake later." The target is a system that:

- feels like one reliable presence
- can do background work without becoming noisy or spooky
- can monitor itself, create work for itself, and resume work later
- stays inspectable through normal channels, sessions, and logs

## Core Claim

What a user experiences as "one agent" is often better modeled as a small organization with one front door.

That organization may include:

- a visible conversational persona
- one or more background maintenance loops
- short-lived worker sessions for bounded tasks
- persistent app-agents or specialists
- schedulers and completion wakes

The trick is not pretending this multiplicity does not exist.

The trick is:

- giving it one coherent public face
- keeping the internal pieces legible
- making every wake, handoff, and reply feel intentional

## First Principles

- Separate **visible identity** from **internal execution topology**.
- Treat **channels** as the shared world state and delivery log.
- Treat **sessions** as private minds attached to channels.
- Prefer **roles** over hard-coded runtime species.
- Make background work produce **inspectable artifacts**, not invisible magic.
- Make every wake have a **reason**, an **owner**, and an inspectable
  **channel/message path**.
- Let **budget** shape cadence, context size, and model choice.
- Treat heartbeat as a **maintenance sweep**, not the whole architecture.

## Why Simple Polling Is Not Enough

A simple background pattern like:

1. poll shell/job state
2. ask a model whether to wake
3. maybe send a reply

is enough for command completion and a few narrow async cases.

It is not enough for a home agent.

A home agent needs to answer more questions:

- Why did the system wake?
- Which internal actor should handle this?
- What context should that actor see?
- Should this create a fresh worker session or reuse an existing one?
- Does the result belong in the user-facing channel, a scratch channel, memory, or nowhere?
- Who owns the visible reply?

Polling only answers "should I look again?"

A real asynchronous agent needs routing, ownership, coordination, and delivery policy.

## Roles, Not Species

One useful design rule is that these should be runtime roles, not exotic subsystems.

### Front Agent

The visible conversational owner.

This is the thing the user feels they are talking to, even if other agents contribute behind the scenes.

### Triage Loop

A cheap evaluator that notices new events, recent changes, stale tasks, or blocked sessions and decides whether something more expensive should wake.

This may be implemented by:

- string/pattern rules
- structured event filters
- a very cheap model
- a fuller heartbeat turn when needed

### Worker Sessions

Short-lived bounded sessions created for concrete work:

- investigate something
- write code
- summarize a channel
- prepare a candidate reply
- monitor an external process

These should leave lineage behind: who spawned them, for what goal, and where results should return.

### Steward / Maintenance Agent

The thing that keeps the system healthy over time:

- tidies memory
- notices staleness
- reviews unfinished work
- checks whether previous background commitments still matter

This is the role people often try to cram into "heartbeat."

### App-Agents / Specialists

Persistent peers with clearer jobs:

- mechanic
- planner
- media agent
- calendar agent
- home automation agent

These are not worker sessions. They are durable actors with their own memory and habits.

## Wake Types

Asynchronous systems usually need several kinds of wake, not one.

### User-Driven Wake

A human sends a message into a channel.

This is the obvious one.

### Event-Driven Wake

A tool completes, a file changes, a process exits, a transport reconnects, or another agent posts something important.

This is usually more valuable than fixed polling.

### Scheduled Message

A reminder, daily sweep, quiet-hours review, or periodic maintenance check.

This is what heartbeat is closest to.

### Self-Scheduled Continuation

An agent explicitly asks the system to wake it later or re-check something under certain conditions.

This is much richer than a blind fixed interval.

### Health / Repair Wake

The system notices drift, backlog, or stale state and wakes a repair path.

This is important because real async systems miss events, crash, or lose continuity.

## The Single Visible Agent Pattern

One strong default for home agents is:

- one visible account or persona on most surfaces
- many internal agents and sessions behind it

This works well if the runtime cleanly separates:

- visible surface identity
- addressed agent
- reply owner
- attribution

That means the user can feel like they are talking to "Shrimpy" while the system can still:

- delegate to a mechanic
- let a planner inspect the same channel
- run a worker session for a bounded task
- surface a specialist's reply with attribution when it matters

The important point is that the visible agent is not fake.

It is the public interface of a small internal society.

## Self-Talk Without Spookiness

If an agent needs to "talk to itself," that should usually mean one of a few legible things:

- it writes to a normal internal channel
- it spawns a worker session with an explicit task
- it leaves a structured note for later wakeup
- it updates memory or a task artifact

What it should usually not mean:

- invisible recursive prompt chains
- silent mutation of another agent's system prompt
- hidden background state with no inspectable trail

Self-talk is fine. Hidden reality is the problem.

## Session Monitoring Matters More Than Raw Heartbeats

A useful async home agent does not just need a timer. It needs a view of its own ongoing work.

That view should probably be summary-first:

- active sessions
- last activity time
- what each session thinks it is doing
- whether it is blocked, waiting, or running
- pending child work
- recent deliveries
- budget burn or rough cost class

This is important because a good background loop does not just ask:

- "should I say something?"

It asks:

- "what currently exists?"
- "what changed?"
- "which thing, if any, needs attention?"
- "does this require a reply, a worker, a memory update, or silence?"

That is much closer to a session monitor or task steward than a basic heartbeat prompt.

## What Heartbeat Is Actually For

Heartbeat is still useful, but it should be demoted from "the whole async architecture" to "one maintenance tool inside it."

Heartbeat is good for:

- periodic staleness sweeps
- lightweight memory upkeep
- checking if promised follow-ups were missed
- noticing active sessions that look stuck
- reviewing recent changes at summary level
- initiating higher-cost work only when warranted

Heartbeat is bad as the only async primitive because it turns into:

- cron with prompt garnish
- a giant bucket of unrelated chores
- an expensive timer doing event routing badly

If heartbeats do all the real work, the architecture is probably missing better wake paths.

## Suggested Shrimpy Interpretation

Shrimpy already has several of the right primitives:

- channels as durable shared logs
- per-agent per-channel sessions
- scheduler events that enter the same messaging backbone
- session control messages as normal channel events
- a clear distinction between routed channel work and local direct sessions

That is a strong foundation.

The current built-in heartbeat looks too basic mostly because it is still just:

- a fixed scheduled message
- into a heartbeat channel
- with a small extra instruction file

That is fine as scaffolding, but it is not yet the full async story.

The missing layer is closer to:

- richer wake reasons
- a summary view of live sessions
- explicit worker lineage
- self-scheduled re-checks
- clearer delivery ownership
- cheap coordination between persistent agents

## Possible Next Seams For Shrimpy

### 1. Session Status Index

Give the system a compact machine-readable summary of active sessions so a heartbeat or steward can reason over status lines instead of raw transcripts.

### 2. Attention-Routed Channel Messages

Represent asynchronous prompts as ordinary channel messages with fields like:

- reason
- source
- source channel
- related session
- urgency
- budget class

Channel membership and agent attention decide whether a given agent handles the
message. That makes wake behavior an effect of normal routing instead of a
separate runtime path.

### 3. Child Session Contract

When an agent spawns bounded work, store:

- parent session
- goal
- related channel or user request
- timeout or completion rule

This makes "create and monitor sessions" feel like a first-class pattern instead of ad hoc prompt behavior.

### 4. Reply Ownership Policy

Decide explicitly whether a result should:

- become the visible agent's reply
- appear as an attributed specialist update
- stay internal
- only update memory or state

Without this, multi-agent systems either get noisy or collapse back into one hidden router.

### 5. Adaptive Heartbeat

Heartbeat cadence and context size should depend on things like:

- recent user activity
- active background sessions
- recent failures
- current budget
- whether there is anything stale enough to justify a look

That feels much closer to "alive" than a dumb fixed timer.

## Litmus-Test Questions

This direction is probably good if the answer to most of these is yes:

- Can one visible agent delegate heavily without losing coherence?
- Can background agents or workers return results into the same user channel?
- Can the system inspect active work without replaying every raw transcript?
- Can an agent wake itself later in an explicit, inspectable way?
- Can a maintenance loop choose silence intentionally?
- Can a specialist contribute without requiring a separate visible account?
- Can budget reductions degrade cadence and context gracefully instead of just breaking autonomy?

## Product Interpretation

The important leap is this:

An asynchronous home agent is not just "a chat model plus a timer."

It is a message-driven system of sessions, monitors, workers, and specialists that can still present one calm public face.

So the right framing for Shrimpy is probably not:

- "how do we make heartbeat smarter?"

It is:

- "how do we let one visible agent be the public face of multiple internal actors, using normal channels and sessions, without becoming magical or messy?"

If Shrimpy gets that right, heartbeat becomes one useful maintenance role inside a broader async architecture instead of the whole concept.
