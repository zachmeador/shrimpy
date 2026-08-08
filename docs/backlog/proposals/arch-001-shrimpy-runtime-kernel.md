
---
status: draft
priority: P1
area: Architecture
depends_on: []
---

# 🦐 ARCH-001: Shrimpy Runtime Kernel

Shrimpy should be organized around agents and sessions, not around the gateway’s message-delivery pipeline. The gateway is an optional always-on host for unattended work. The TUI is an independent interactive host. Both use the same process-independent runtime kernel.

This redesign establishes explicit ownership for state, authorization, attention, session execution, and delivery. It replaces implicit coordination through channel files and gateway-specific wiring with a transactional state model, a small session engine, and a few comprehensible host loops.

## Why

Shrimpy is conceptually simple:

- An agent is a persistent identity with memory, capabilities, and attention policy.
- A session is a private Pi context belonging to an agent.
- Comms allows authorized actors to exchange durable messages.
- A host runs sessions.
- The TUI hosts explicitly opened interactive sessions.
- The gateway hosts unattended sessions and external adapters.

The implementation currently blurs these concepts. The gateway participates in message persistence, routing, attention, session control, session execution, reply recovery, delivery, scheduling, identity, and operational bookkeeping. Important behavior emerges from several components agreeing about message provenance, content types, filenames, runtime callbacks, and process ownership.

This makes changes locally understandable but globally risky. Features tend to be added wherever data already passes rather than behind the concept that should own the behavior.

The goal is not to introduce more architectural nouns. The goal is to reduce Shrimpy to a small transactional state machine whose ownership and crash behavior are obvious.

## Architectural Thesis

Shrimpy has one process-independent kernel used by every entry point:

```text
                  Shrimpy state
                       ↑
      ┌────────────────┼────────────────┐
      │                │                │
     TUI            Gateway       Inspection CLI
      │                │
      └────────→ SessionEngine ←────────┘
                       │
                       ↓
                   Pi session
```

The kernel exposes behavior, not storage internals. The TUI and gateway may instantiate the same implementation in different processes, but neither reaches through the kernel into another subsystem’s tables, files, queues, or policy data.

The gateway provides background availability. It is not the source of truth and is not required for direct use of Shrimpy.

## Core Invariants

1. The TUI always works without a gateway.
2. Killing the gateway affects background availability, not durable truth or direct agent sessions.
3. Every accepted message is durably committed before success is reported.
4. Every session has at most one live executor.
5. Every queued turn is either pending, claimed, completed, failed, or explicitly cancelled; it cannot silently disappear.
6. A process crash cannot permanently strand a claimed turn.
7. External delivery is retryable and idempotent.
8. Authorization is checked at one unavoidable comms boundary.
9. An agent cannot declare its own identity, provenance, or authority.
10. An agent decides whether an authorized stimulus deserves attention.
11. A scheduler executes agent-owned wake requests but does not invent agent policy.
12. Normal responses do not depend on the model remembering to call a publication tool.
13. Every piece of derived state has an explicit rebuild rule.
14. Every important state transition is inspectable without replaying model reasoning.
15. Runtime code never depends on generated JSON or JSONL exports.

## Concept Ownership

### Agent

An agent is durable data plus policy, not necessarily a long-lived service object.

An agent owns:

- Identity.
- Instructions and memory references.
- Model and tool policy.
- Attention policy.
- Session selection rules.
- Self-requested wake behavior.

Attention evaluation is conceptually a pure decision:

```text
consider(agent, authorized stimulus) → ignore | queue turn for session
```

Authorization and attention are separate. Authorization determines whether an actor may reach an agent or conversation. Attention determines whether the agent chooses to spend work on an authorized stimulus.

### Session

A session is a private Pi context owned by one agent.

A session does not know whether it is running inside the TUI, gateway, a worker process, or a test. It does not import host-specific status, transport, scheduler, or channel-storage concepts.

A stable session engine accepts a turn request and returns a turn result:

```text
SessionEngine.run(TurnRequest) → TurnResult
```

The turn request contains:

- Agent identity.
- Session identity.
- Authorized stimulus or direct user prompt.
- Context inputs.
- Scoped capabilities.
- Cancellation signal.

The turn result contains:

- Final assistant text.
- Tool activity and structured outcome.
- Completion, failure, or cancellation status.
- Session metadata needed for inspection.

The session engine owns Pi lifecycle, transcript access, context assembly, tool registration, compaction integration, and orderly disposal.

### Comms

Comms owns:

- Actor identity.
- Communication authorization.
- Conversations and participation.
- Durable messages.
- Address resolution.
- External delivery intent.
- Read and post operations.

Comms does not own:

- Agent attention.
- Session lifecycle.
- Scheduling.
- Model execution.
- Surface-specific behavior.
- Worker lifecycle.

The agent-facing interface is intentionally narrow:

```ts
interface AgentComms {
  post(input: {
    to: Destination;
    content: Content;
    notify?: "quiet" | "normal";
  }): Promise<MessageReceipt>;

  read(input: {
    conversation: ConversationHandle;
    limit?: number;
    before?: MessageHandle;
  }): Promise<Message[]>;
}
```

The capability is bound by the host to an agent, session, current conversation, and communication grants. The agent cannot supply authorship, credentials, raw transport routing, or provenance.

A destination is an opaque handle for the current conversation, another authorized conversation, a known agent, or a known person. Comms resolves the physical route.

Posting a message to another agent does not command that agent to wake. It creates an authorized stimulus that the recipient’s attention policy evaluates.

### Attention

Self-waking is separate from comms:

```ts
interface AgentAttention {
  wakeAt(input: {
    at: string | number;
    note: string;
    session?: SessionHandle;
  }): Promise<WakeReceipt>;
}
```

The capability is bound to the requesting agent. An agent can request its own future attention but cannot forge another agent’s wake request.

The scheduler understands time, persistence, claiming, and firing. It does not understand sender impersonation, channel provenance, model prompts, or delivery behavior.

### Hosts

A host is a process that can own and execute sessions.

#### TUI Host

The TUI:

- Opens an explicitly selected agent session.
- Claims exclusive ownership of that session.
- Runs turns directly through the session engine.
- Renders final assistant output.
- Supplies scoped comms and attention capabilities.
- Functions fully without a gateway.

The TUI does not start a miniature gateway. It does not need to run external surfaces, the global scheduler, background dispatch, or delivery retries.

If the TUI posts a durable message while the gateway is stopped, the post succeeds. Unattended recipients remain pending until a background host becomes available.

#### Gateway Host

The gateway is a disposable supervisor for a small set of background loops:

1. Surface ingress accepts external input and commits authorized messages.
2. Turn dispatch claims pending unattended turns and invokes the session engine.
3. The scheduler converts due wake requests into pending turns.
4. External delivery claims and sends committed outbox entries.
5. Reconciliation recovers stale claims and incomplete work after crashes.

The gateway does not implement agent policy or session semantics. It invokes kernel operations and manages component lifecycle.

## Interaction Flows

### Direct TUI Turn

```text
user prompt
  → TUI-owned session
  → SessionEngine
  → Pi
  → TurnResult
  → render in TUI
```

No gateway or comms round trip is required for the direct response.

### External Human Message

```text
surface adapter
  → authenticate actor
  → Comms transaction
  → durable message
  → agent attention decision
  → pending background turn
  → gateway claims turn
  → SessionEngine
  → final result committed to conversation
  → delivery outbox
  → surface adapter
```

### Agent-to-Agent Message

```text
agent session
  → scoped comms.post
  → authorization
  → durable message
  → recipient attention decision
  → optional recipient turn
```

### Self-Wake

```text
agent session
  → scoped attention.wakeAt
  → durable wake request
  → scheduler fires
  → pending turn for the owning agent/session
```

### Worker Completion

```text
worker completes
  → durable worker outcome
  → authorized completion stimulus
  → owner agent attention decision
  → optional continuation turn
```

The worker records what happened. The agent decides what to do about it.

## Persistence

SQLite is the authoritative store for Shrimpy-owned structured state, including:

- Agents and structured policy.
- Conversations and participation.
- Messages.
- Wake requests.
- Pending and completed turns.
- Session ownership leases.
- Worker lifecycle records.
- Delivery outbox and receipts.
- Idempotency keys.
- Process claims and operational checkpoints.

Pi sessions remain in Pi’s native format unless Pi provides a compelling reason to change them.

Human-authored agent materials such as Markdown instructions, skills, media, and large artifacts may remain files. They are referenced through the kernel rather than accessed ad hoc by unrelated subsystems.

Generated JSON or JSONL serves only as a portable content export and disaster-recovery aid. Normal runtime code never reads it.

A logical mutation and its pending export record are committed in the same SQLite transaction. A retryable exporter writes versioned, checksummed JSON records and marks the export complete. Failure to export does not affect runtime correctness.

## Backup And Recovery

Use SQLite’s supported online backup mechanism or `VACUUM INTO`; do not copy a live database file casually.

Maintain:

- A backup before every schema migration.
- Recent rolling hourly backups.
- A smaller daily retention set.
- Backup checksums.
- Schema and logical export versions.
- The last exported sequence or checkpoint.
- Automated integrity verification.

Recovery is:

```text
verify active database
  → restore newest valid backup when necessary
  → import later complete exports when available
  → rebuild disposable indexes and caches
  → reconcile stale claims
  → reopen existing Pi sessions
```

A backup or export is not considered valid until it can be opened, checked, and identified by schema version.

## Transactional Work

Operations that cross conceptual boundaries are expressed as database state transitions rather than multi-file choreography.

Accepting an external message may atomically:

- Insert the message.
- Record its authenticated actor.
- Evaluate eligible agent recipients.
- Insert pending turn requests.
- Insert external delivery work when appropriate.
- Insert a logical export event.

Claiming a turn atomically records:

- Claim token.
- Owning process.
- Lease deadline.
- Attempt number.

Completing a turn atomically records:

- Terminal outcome.
- Final response.
- Any conversation post.
- Any external delivery work.
- Release of the claim.

A crashed or expired claimant can be reconciled without guessing from several files.

## Containment

Contained agents do not receive database access, filesystem state access, transport credentials, or ambient Shrimpy authority.

They receive capability-scoped tools over an RPC boundary:

```text
contained session
  ├─ comms.post
  ├─ comms.read
  ├─ attention.wakeAt
  └─ explicitly granted work tools
```

Trusted local sessions may use the same interfaces in-process. The interface is shared; the security claim is not. In-process dependency injection is not described as containment.

Every capability request carries host-bound attribution. Denials fail explicitly and are inspectable.

## UX Implications

- `shrimpy` and direct TUI chat work normally when the gateway is stopped, missing, unhealthy, or restarting.
- A stopped gateway means external surfaces and unattended execution are unavailable; it does not make local agents unusable.
- Normal assistant text is the response to the current interaction. Agents do not need to call a reply tool for ordinary answers.
- Agents use explicit messaging only for progress posts, other conversations, other actors, and unsolicited updates.
- Messages accepted while no background host is running remain durable and visibly pending.
- Restarting the gateway resumes pending work without replaying already completed turns.
- Agent-to-agent messages carry honest attribution and are subject to recipient-owned attention policy.
- Self-wakes show their owner, requested time, note, target session, firing state, and outcome.
- Worker results return as inspectable stimuli rather than hidden prompt injection.
- Session ownership conflicts produce a clear error or wait state rather than double execution.
- Users can inspect why an agent woke, which session ran, which process owned it, and where the result was delivered.
- Generated JSON exports remain available for inspection and recovery but are never required for Shrimpy to function.

Regressions to avoid:

- TUI startup or direct conversation must never wait for a gateway socket.
- A progress post must not suppress the final response.
- Gateway restart must not duplicate completed turns or external deliveries.
- A contained agent must not be able to bypass comms authorization through direct state access.
- Pending work must not be silently discarded because no host was available.
- Storage or export failure must fail visibly rather than acknowledge an undurable operation.

## Build Shape

### Kernel Contracts

Define host-independent domain types for:

- Agent identity and policy.
- Session identity.
- Authorized stimulus.
- Turn request and result.
- Conversation and message handles.
- Wake requests.
- Ownership claims.
- Delivery work.
- Capability grants.

No kernel type may be named after the gateway, TUI, Telegram, or another host or adapter.

### Structured Store

Introduce one transactional repository boundary over SQLite. Schema access remains private to the repository implementation. Other modules call domain operations rather than issue arbitrary SQL or open the database independently.

Add integrity checking, migrations, online backups, logical exports, claim recovery, and inspection commands.

### Session Engine

Extract one session engine shared by foreground, background, worker, and test hosts. Remove gateway status, channel persistence, surface activity, watchdog, and delivery concerns from session execution.

### TUI Host

Make the TUI use the session engine directly with local state and scoped capabilities. Verify full operation with no gateway process, socket, PID file, or health record.

### Gateway Host

Reduce the gateway to lifecycle management for ingress, unattended dispatch, scheduling, delivery, reconciliation, health reporting, and optional sidecars.

Each loop communicates through kernel operations and durable work records.

### Agent Capabilities

Replace ambient channel buses and self-declared message construction with bound comms and attention capabilities. Ordinary final responses flow through the invoking host.

### Remove Superseded Paths

Delete direct structured-state file mutation, log-polled control RPC, provenance-based behavior inference, duplicate foreground/background session construction, and gateway-specific domain types. Do not retain compatibility wrappers or parallel runtime paths.

## Boundaries

- The gateway remains optional.
- The TUI never depends on gateway availability.
- SQLite is an implementation of the state boundary, not a globally shared service locator.
- No subsystem may read or modify another subsystem’s tables directly.
- JSON and JSONL exports are never runtime inputs.
- Pi session storage remains Pi-owned.
- Human-authored Markdown, skills, media, and large artifacts are not forced into relational rows without a concrete need.
- Surfaces translate transport input and output; they do not manage sessions or attention policy.
- The scheduler executes due work; it does not decide whether arbitrary messages deserve attention.
- Workers report outcomes; they do not decide user-facing delivery.
- Agent attention policy does not grant communication authority.
- Communication authority does not force an agent to wake.
- Do not add a general-purpose event framework, dependency-injection container, actor framework, or distributed-systems protocol unless a demonstrated requirement cannot be met by transactions and explicit loops.
- Do not introduce backward-compatibility or migration behavior without a separate explicit decision.

## Open Decisions

- Whether human-managed global configuration remains a validated file or becomes structured state edited exclusively through commands.
- Whether logical recovery exports contain every structured mutation or only durable user content and reconstruction-critical records.
- The precise stale-claim policy for sessions whose owning process disappears during a model call.
- Whether an open TUI-owned session may accept background stimuli or whether those stimuli remain pending until the TUI explicitly returns to them.
- Which session-selection rules are fixed runtime policy and which are agent-configurable attention policy.
- Backup retention defaults and whether optional backups outside the active workspace should be supported.

## Done

- The TUI opens and runs direct agent sessions with the gateway fully stopped and all gateway runtime files absent.
- The gateway can be killed during ingress, turn execution, wake firing, and external delivery without silently losing accepted work.
- Restarting the gateway reconciles stale claims and resumes pending work without duplicating completed turns.
- One session cannot be executed concurrently by the TUI and gateway.
- Session execution uses one host-independent engine with no gateway or surface types.
- Authorization, attention, execution ownership, and delivery are independently testable decisions.
- Agents post and read through identity-bound capabilities and cannot self-declare authorship.
- Ordinary final responses require no publication tool.
- Agent-owned wake requests survive restarts and fire into the intended session.
- External delivery uses a transactional outbox with idempotent receipts.
- Structured runtime state has one authoritative transactional store.
- No runtime feature reads generated JSON or JSONL exports.
- A verified rolling backup can restore the structured store.
- Inspection commands explain messages, attention decisions, pending turns, ownership claims, wake requests, and delivery attempts.
- The gateway entry point composes coarse background components and contains no domain routing policy.
- Old direct-file state coordination and gateway-specific session paths are removed rather than wrapped.
- Tests inject crashes between each durable state transition and verify the core invariants.
