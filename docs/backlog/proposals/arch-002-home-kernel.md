---
status: draft
priority: P2
area: Architecture
depends_on: []
---

# 🦐 ARCH-002: Home Kernel

Shrimpy is a home of agents. Agents have private minds. They share rooms. Hosts run minds. Windows show rooms.

The **kernel** is an in-process library that owns durable facts and the four decisions that turn a stimulus into work. It is not a daemon. The **attendant** is an optional process that keeps the house available when nobody is at the terminal. Killing it must not make the home unusable.

This note is a target architecture. It names concepts from the jobs they do, not from the current tree. Other architecture notes should later be reconciled to this one; this note does not try to absorb them.

## Vocabulary

| Term | Meaning |
|---|---|
| **Home** | The durable on-disk place: authored files, the kernel store, Pi transcripts, and media |
| **Kernel store** | The one transactional database for rooms, messages, and in-flight work |
| **Agent** | A persistent identity with memory, a power ceiling, and attention policy |
| **Person** | A human actor |
| **Service** | A non-person, non-agent author: a watch, a job, the CLI, or the attendant |
| **Actor** | A person, agent, or service |
| **Room** | A shared durable conversation |
| **Charter** | A room's members, optional window binding, and purpose |
| **Envelope** | Declared routing on a message: author, to, audience, wake, notify |
| **Body** | What could be rendered in a transcript |
| **Marker** | A renderable non-speech line in a room, such as a session boundary |
| **Session** | One agent's private mind for one room or one job |
| **Session key** | `agent` plus kind and name: `room/<id>`, `job/<id>`, `run`, or `setup` |
| **Turn** | One execution of a session |
| **Kernel** | In-process library: facts plus the four decisions |
| **Turn engine** | Runs Pi for one turn and returns a result |
| **Host** | A process that can own and run sessions |
| **Terminal** | The owner's interactive host |
| **Attendant** | The background host: ingress, unattended turns, wakes, delivery, crash repair |
| **Window** | A transport that shows rooms, such as Telegram or a local web console |
| **Client** | An external UX that drives a mind and may keep its own chat log |
| **Permit** | The recorded powers for a session: tools, file roots, command permission |
| **Ceiling** | An agent's maximum permit; every session permit is a subset |
| **Attention** | Whether an agent chooses to spend a turn on an authorized stimulus |
| **Lease** | The exclusive right to run a session |
| **Job** | Bounded delegated work with a completion point |
| **Watch** | An agent-owned rule that later produces a stimulus |
| **Companion** | A one-level agent owned by a household agent |
| **Household** | The top-level agents the user knows and addresses |
| **Meter** | An optional hook that may allow, deny, or settle scarce actions |
| **Post, hold, wake** | The agent verbs for speech, silence, and later attention |

Two integration patterns, kept distinct:

- A **window** translates a transport into rooms. The room is the conversation record.
- A **client** drives a mind through the turn engine. The external UX is the conversation record.

## Why

The product is simple. The implementation currently has no owner for the important decisions, so each new behavior lands in the nearest pipe: the background process, the conversation log, a filename, a provenance field, or a watchdog.

That produces two glued-together products. Direct terminal chat is a private Pi session. External chat is a log-and-daemon machine. Jobs are a third spawn path. New windows and clients cannot share a home until those paths are the same engine with different hosts.

It also makes a conversation log do four jobs: transcript, RPC bus, delivery queue, and crash ledger. Consumers then reverse-engineer intent. Speaking becomes a model ritual, so forgetting to speak is a product bug. Authority is global, so a scratch room and a private room get the same power. Crash behavior is folklore across several files.

The fix is ownership, not more machinery. Name the decisions. Put facts in one library. Let hosts be thin. Let a transcript be a query, not an operating system.

## Current State

Today the long-running process participates in persistence, routing, attention, session control, session execution, reply recovery, delivery, scheduling, identity, and bookkeeping. Direct terminal sessions bypass the conversation log. Publication is a tool, with a second model call to recover silence. Session control publishes into the log and polls for an ack. Deliverability and wake behavior are inferred from provenance. Humans are transport plumbing, not members. One tool policy applies everywhere an agent runs. Command watches execute shell inside the daemon. Job children boot a full app with the host's authority.

The current primitives are still the right ones: a durable home, persistent agents, shared logs, private sessions, agent-owned watches, Markdown skills, and a CLI for every feature. This note keeps those jobs and changes who owns them.

## Thesis

```text
     Terminal     Attendant      CLI        Client       Job
         \            |           |           |           /
          \           |           |           |          /
           └──────────┴───────────┴───────────┴─────────┘
                                │
                      ┌─────────▼─────────┐
                      │      KERNEL       │
                      │   (library API)   │
                      │                   │
                      │  identity         │
                      │  rooms            │
                      │  work             │
                      │  decisions        │
                      └─────────┬─────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              home files              kernel store
           soul, skills,            rooms, messages,
           config, watches,         people, charters,
           media                    turns, leases,
                                    wakes, delivery, jobs
```

Pi transcripts sit beside the kernel, not inside it. The turn engine reads kernel facts, runs Pi, then writes the result back through the kernel.

No kernel type is named after a host, a window, or a client. Hosts never reach around the kernel into each other's files.

## Kernel

The kernel is a library every host links. It owns three logical ledgers in one store, plus four decisions.

```text
┌──────────────────────────────────────────────────────────┐
│                         KERNEL                           │
│                                                          │
│  IDENTITY              ROOMS                 WORK        │
│  agents                charters              turn queue  │
│  people                membership            session     │
│  services              messages              leases      │
│                        bindings              wakes       │
│                        delivery intent       job records │
│                                                          │
│  authenticate → authorize → attend → admit               │
│  who is this    may they     does the     with what      │
│                 post/read    agent care   power          │
└──────────────────────────────────────────────────────────┘
```

**Identity** answers who. An agent cannot declare its own author, provenance, or authority. A person is a stable id with window identities attached. A service author is a real id such as `watch/<owner>/<id>` or `job/<id>`, never a borrowed human.

**Rooms** answer what was said, where, and to whom. A charter is written at creation and is never parsed back out of a label. People and agents are members. A binding is optional: some rooms are internal, some face a window.

**Work** answers what is queued, claimed, due, or in flight. Turns, leases, wakes, delivery, and jobs live here because they must survive a crash as a set.

The kernel stops at “here is a turn to run” and “here is the result to record.” It does not run Pi, format a window, or render the terminal.

### Envelope

A room message is envelope plus body. Dispatch, replay, and delivery may read the envelope. Provenance is a sealed bag that behavior never reads.

- `author` — kind and id, stamped by the kernel
- `to` — optional agent ids; only those agents may attend
- `audience` — `room` (default) or `agents` (an aside: visible in history, never delivered out a window)
- `wake` — `normal` or `live-only` (skipped during backlog replay)
- `notify` — `quiet`, `normal`, or `urgent` as a window hint

On a DM charter, `kernel.post` stamps `to` to the member agents other than the author before attend runs. Labels such as `dm~person~agent` are conventions only. Nothing parses a room id to learn membership.

Body types are speech and media, plus markers. Control records, status acks, and freeform system events do not belong in a room.

### API shape

Hosts call behavior, not storage:

```text
kernel.post(...)          authenticate, authorize, commit, attend, maybe enqueue
kernel.read(...)          authorized history
kernel.wakeAt(...)        schedule a self-owned turn; skip attend on fire
kernel.claimLease(...)    exclusive session executor
kernel.releaseLease(...)
kernel.claimTurn(...)     exclusive turn under a held lease
kernel.completeTurn(...)  one transaction: status, auto-reply, delivery intent, release turn
kernel.admit(...)         permit and runner kind
kernel.explainAttend(...) why an agent woke or stayed quiet
kernel.reconcile(...)     stale leases, unsent job reports
```

A post is durably committed before success is reported. Posting to another agent is not a command to wake. The recipient's attention decides.

## Decision pipeline

Room messages go through four functions that do not call each other. Direct `run` prompts and `wakeAt` turns skip post and attend: they already have an actor and a target session.

```text
stimulus
    │
    ▼
authenticate     stamp author; nothing self-declares
    │
    ▼
authorize        comms grant; a contained agent has no other path into rooms
    │
    ▼
commit message   durable before success
    │
    ▼
attend           per agent, per room; ignore or queue a turn
    │
    ▼
admit            permit plus runner; rooms and messages never grant power
    │
    ▼
host runs the turn engine under a lease
    │
    ▼
kernel.completeTurn    status, auto-reply, delivery intent, release
```

### Authenticate

Map a window user, CLI caller, or bound session to a person, agent, or service. Window users resolve through the person's stored identities. Unmapped senders become a transport-scoped fallback id with no grants. Bound agent tools never supply an author field.

### Authorize

Every `post`, `read`, `wakeAt`, DM creation, and `audience: agents` use goes through one grant hook with the caller's attribution. Denials are loud and inspectable.

The hook answers at least:

- may this actor post to this room
- may they read it
- may they open a two-member DM with a known agent
- may they schedule a wake for themselves
- may they post an aside

Shipped default is allow, matching today's open household. A stub deny must fail with a reason. Contained agents have no other path: the sandbox denies the kernel store, so the runner's RPC is the only door. Trusted in-process sessions bind the tool path only. Bash can still read files; say that honestly.

An agent may `wakeAt` only for itself. It cannot forge another agent's wake or stamp another actor's author.

### Attend

Membership says who may see the room. Attention says who thinks. One function, over the envelope and body, never over provenance:

```text
consider(agent, message, replay) → ignore | enqueue(session key, reason)
```

Evaluate in this order and stop at the first match:

1. Author is this agent → ignore (self).
2. Replay and `wake` is `live-only` → ignore.
3. `to` is present and this agent is not listed → ignore.
4. Agent mode is `none` → ignore.
5. Sender filters are set and this author kind/id is not allowed → ignore.
6. Mode is `addressed` → enqueue iff the agent is in `to`.
7. Mode is `mentions` → enqueue iff the agent is in `to` or the body mentions the agent.
8. Mode is `all` → enqueue for a person author. For an agent or service author, enqueue iff the agent is in `to`, is mentioned, or has explicitly opted into that author.

The last clause is the loop guard. It is documented default behavior, not a hidden extra check. `explainAttend` returns the step that fired and the reason string.

Default mode is `all` with that guard. Agents may narrow mode and sender filters. They may not add impersonation. DM posts already stamp `to`, so a DM still wakes the other member under `addressed`.

The enqueued session is `room/<room-id>` for that agent. Watches and jobs that need a turn without a room message use `wakeAt` or a job session, not a fake author.

### Admit

If a turn will run, resolve the permit for that session key, check it against the agent's ceiling, and choose a runner. Rooms, messages, display names, and membership never grant power.

Invalid configuration fails at load, not at dispatch, and never falls back to a wider permit. The resolved permit is recorded when the session opens. A later config change that would materially widen or swap powers fails visibly. Shrimpy does not silently reopen the session.

The owner's interactive terminal session skips admit and carries no permit. Every other session admits, including other agents posting into a DM the terminal currently shows.

A **meter**, if enabled, sits beside admit. It may deny a scarce action. It may never widen a permit.

## Sessions

A session key is the agent plus a kind and a name:

| Kind | Name | What it is |
|---|---|---|
| `room` | room id | That agent's mind for that room |
| `job` | job id | Bounded delegated work |
| `run` | none | Ephemeral one-shot, no room, no durable transcript unless asked |
| `setup` | none | Onboarding, not a conversation |

There is no profile segment. Different power or context is a different room, a different permit on that room, or a different agent. Four agents in one room are four sessions.

`/new` and `/clear` keep the room and the agent, archive the Pi transcript, open a fresh one, and post a `session_boundary` marker. The room history stays.

### Leases

Every session has at most one live executor. The lease is a kernel-store row: session key, holder (host kind, process id, token), deadline.

- The **terminal** claims the lease for the whole time the session is open, and renews it.
- The **attendant** claims the lease for a queued turn, then releases it.
- **Dispatch skips** any session whose lease is held by another live process.
- **Claim and enqueue are transactional.** A crash cannot create two executors.

If the terminal holds the lease, pending turns for that session run in the terminal process. They are not parked until the attendant is free. A job report or another agent's post into an open DM should paint in the open terminal.

If pinned Pi cannot accept an injected turn on a live interactive session, extend Pi at that seam. Do not build a second terminal to avoid it.

When the terminal exits, it releases the lease. The attendant may then claim leftover pending turns. Turn queue state in the kernel store is the handoff. There is no second seen-file.

What to do when a holder dies mid-model-call is still an open decision. Reconcile must never leave a lease claimed by a dead process forever, and must never start a second executor while the first might still be running.

## Permits

A permit is the recorded powers for one session:

```text
tools:     exact allowlist of tool names
files:     optional roots with read or read-write
commands:  full | read-only | none
```

The agent's default permit is also its **ceiling**. Per-room blocks and inline CLI permits may only narrow. Config load rejects any block that exceeds the ceiling.

The default allowlist is the current built-in and daemon tools, minus tools the agent has disabled. There is no named profile registry.

`files` is containment. Only the contained runner may accept it. The trusted runner refuses that permit. Until a contained runner exists, a `files` permit fails closed. Tool narrowing is never described as filesystem containment. Kernel denials at syscall time are the boundary, not path-checking wrappers.

Command watches use a permit with no model tools and `commands` set to what the watch needs, on the contained runner. They do not inherit the attendant's shell.

## Turn engine

There is one `run(turn) → result`. It owns Pi lifecycle, context assembly, tool registration, compaction, and disposal. It does not know the attendant, the terminal, or any window.

```text
TurnRequest
  session key
  permit or unrestricted owner-terminal
  prompt: direct text, or an authorized message id
  cancel signal

TurnResult
  status: completed | failed | cancelled
  final text
  held
  texts already posted to the active room this turn
  tool activity
  inspection metadata
```

The engine:

1. Opens or resumes the Pi session for the key.
2. Builds one Shrimpy-owned system prompt from home files: soul, selected markdown, skill trails. Pi's ambient discovery is off.
3. Builds turn context from the source message and compact pointers (job, watch, session status). Same assembly path the CLI can render. No second prompt builder. No dumping raw logs into the prompt.
4. Registers tools from the permit allowlist, or the full owner set for an unrestricted terminal session.
5. Runs Pi.
6. Returns the result. It does not post, deliver, or mark the turn done.

The host passes that result to `kernel.completeTurn`. It does not apply speech policy and it does not `post` the final itself.

### Turn completion

`completeTurn` is one kernel-store transaction. It:

1. Records the turn as completed, failed, cancelled, or held.
2. Appends the automatic final reply when required.
3. Writes delivery intent for that reply when the room has a window binding and `audience` is `room`.
4. Releases the turn claim.

Auto-reply is required when the triggering author was a person, the session is bound to a room, the turn is not held, final text is non-empty, and that text is not an exact duplicate of a post already made this turn. Unbound sessions such as `run` record the result and stop. No room, no auto-reply, no outbox.

The final message id is derived from the turn, for example `turn/<turn-id>/final`. Retrying `completeTurn` after a crash cannot duplicate it. Progress `post`s during the turn are ordinary kernel posts with their own ids. They must not set `held`. `hold` is the only suppressor.

The host then renders (terminal) or moves on (attendant). The delivery loop sends committed outbox rows. Speech policy is not implemented twice.

Runners are how much of the host's authority the session inherits:

- **Trusted** — in-process, including the owner's terminal. Cannot claim `files`.
- **Contained** — a subprocess that hosts Pi. File roots are enforced by the OS. Model credentials stay with the parent. The child gets scoped tools over RPC.
- **External** — a job backend such as a coding agent, mapping the same permit onto that tool's sandbox flags.

Jobs, command watches, clients, terminal turns, and attendant turns are all consumers of this engine. They are not parallel session constructions.

## Hosts

A host is a process that can hold a lease and run the turn engine. That is the whole category.

### Terminal

`shrimpy` and `shrimpy chat <agent>` open the owner↔agent DM, not a private sideline.

The terminal:

1. Resolves the owner person and the agent.
2. Finds or creates a DM charter: `dm` true, members = that person and that agent.
3. Claims the lease on `room/<that-id>` for its lifetime.
4. Posts keystrokes as that person through `kernel.post`.
5. Runs the resulting turn itself, because it holds the lease.
6. Passes the result to `kernel.completeTurn`.
7. Renders Pi. The final text is usually already on screen; the kernel commit is what makes it durable in the room.

It works with the attendant fully stopped and all attendant runtime files absent. It is not a miniature attendant. It does not run windows, the global scheduler, or delivery retries.

Incoming posts for that room — a job report, a watch, another agent — enqueue turns. The terminal injects them into the live session. The attendant's dispatch loop skips the leased session.

The owner's interactive session is unrestricted. Other agents who wake into the same room still admit under their own permits.

`shrimpy run` stays an ephemeral `run` session: no room, no lease fight with the DM.

### Attendant

A disposable supervisor of five loops. It invokes kernel operations. It does not implement agent policy or session semantics.

```text
1. INGRESS                         2. DISPATCH
   window event                       claim a pending turn
        │                                  │
        ▼                                  ▼
   authenticate who                  admit (permit + runner)
   authorize the post                      │
   commit the message                      ▼
   attend → maybe queue a turn       turn engine → Pi
                                           │
                                           ▼
                                     kernel.completeTurn

3. SCHEDULER                       4. DELIVERY
   due wake → pending turn            outbox → window
                                      record receipt

5. RECONCILE
   expired leases, stuck deliveries, unsent job reports
   → requeue; never invent policy
```

Ingress writes facts. Dispatch claims queued turns whose lease is free, then runs the engine and `completeTurn`. It skips sessions the terminal currently holds. The scheduler only fires agent-owned wakes. Delivery only sends what `completeTurn` already committed. Reconcile repairs crashes.

A window adapter never decides who wakes or what tools they get. The attendant never stamps authorship or reads provenance to guess deliverability.

### CLI

Inspects and mutates home files, posts through the kernel, and runs one-shots. Session lifecycle uses the control port of the host that holds the lease, or a maintenance lease when nobody owns the session. It never publishes a fake room message and polls for an ack.

Command spelling can wait. The surface should cover at least: rooms, sessions, people, jobs, watches, permits, attend-explain, and attendant status. Every one of those is a `shrimpy <command>` path.

### Control port

Any host that holds leases exposes a local control port. Unix domain socket on Unix; the Windows equivalent later. Local only. No chat log.

Operations: `session.new`, `session.clear`, `session.restore`, `session.set`, `session.stop`, `session.status`, `host.status`. Window remote commands (`/new`, `/clear`, `/stop`, and the like) call the same operations in-process inside the attendant and confirm on the transport.

Routing:

- Live owner → that host's control port, wait for a real reply.
- Unowned → take a maintenance lease, apply the session-store change, `kernel.post` a boundary marker if the session is a room.
- Terminal-owned, command from outside → reject: use that host's controls.

Success on a room session posts a `session_boundary` marker. The Pi transcript keeps its own lifecycle records. The room does not carry control/ack pairs.

### Client

A stdio (or similarly local) adapter that drives the turn engine for a selected agent. Agent selection is fixed for the process lifetime. Client-supplied workspace text, MCP lists, and working directories cannot expand the agent's ceiling. Standard output is protocol; diagnostics go to redacted stderr.

The first client is an ACP server so an external chat UX can launch a Shrimpy mind. That UX may keep its own history. Shrimpy keeps the transcript of the work it did. Do not mirror that traffic into rooms unless there is a separate reason to maintain two logs.

## Windows

A window authenticates, translates, and formats. It does not run sessions, choose attention, or mint authority.

People are members of rooms. A window maps a transport user to a person at ingress. Unmapped senders author as a transport-scoped fallback with no grants. Command access is a person grant, not a per-window user table.

Examples of windows: Telegram, Discord, an owner-local web console, the terminal when it is showing a DM. Each is a vertical translator. Shared code is for identity mapping and remote commands, not a transport-neutral bridge framework.

A window-bound room delivers when `audience` is `room`, the author is not a human, and the body is not a marker.

## Storage

The headache is not which brand of database to love. It is how many places can make the home *wrong* if they disagree.

Each fact has one home. Shrimpy-owned runtime truth is one store. Authored materials stay files because that is the product. Pi keeps its own transcripts because we wrap Pi, we do not reimplement it. That is three critical layers, not five. Readable dumps, inspector caches, and per-loop cursor files are not a fourth truth.

```text
home files          kernel store           Pi transcripts
(authored)          (runtime truth)        (private minds)
soul, skills,       rooms, messages,       session jsonl
config, watches,    people, charters,      Pi owns the format
media, vault        turns, leases,
                    wakes, delivery, jobs
```

SQLite is the default kernel store because it is a file in the home, needs no daemon, and gives transactions, crash recovery, and online backup. The architecture cares about those properties, not the brand. Replacing SQLite later is a storage-engine swap behind the kernel API, not a redesign.

### What lives where

| Fact | Home | Why |
|---|---|---|
| Soul, skills, agent config, watch definitions | Files | People and agents edit them as documents |
| Media, vault, large artifacts | Files | Too big and too blob-like to earn a row |
| People, room charters, membership, bindings | Kernel store | Authn, membership, and the first message must commit together |
| Messages | Kernel store | Accepting a message and queuing a turn is one mutation |
| Turns, leases, wakes, delivery, jobs | Kernel store | Crash recovery is a set, not a file tail |
| Resolved permit on an open session | Kernel store | The live session pins what it opened with |
| Watch clock and run history | Kernel store | Next-fire and last-run are work, not documents |
| Private session transcripts | Pi files | Pi owns the mind's format |

A watch definition in a file and a next-fire time in the kernel store are two different facts. A message in the kernel store and a JSONL dump of the same room are not. The dump is a view.

Package management may own definition files. Lived memory, vaults, transcripts, and the kernel store are never a package.

### Why rooms are not a second database

A chat log that is also the crash ledger, the delivery queue, and the RPC bus is how the current home got hard to change. Splitting that into “JSONL is the transcript, SQLite is the bookkeeping” looks cleaner and still leaves two truths. Delete the bookkeeping database and you guess about leases, receipts, and whether a turn already ran. Delete the JSONL and the database is a chat app nobody can read without it. Either way the home can be wrong.

Put the message in the same transaction as the turn it queued, the delivery it requested, and the author it stamped. `rooms read` is a query. It should still feel like reading a transcript: speech, media, markers, no RPC.

Hosts do not elect a log-writer process. Any host may call `kernel.post`. The kernel store serializes writers. Who runs unattended loops is still the attendant. Those are different jobs.

### Views are not truth

CLI output, JSON dumps, and a trailing JSONL export of a room are for humans, grep, and disaster recovery. Runtime never reads them back. If an export exists, the kernel records “this mutation is pending export” in the same commit as the mutation. A failed dump does not un-accept a message. A missing dump does not mean the room is gone.

Do not add per-subsystem state files for cursors, receipts, seen-marks, or handled-ids. If the attendant needs a cursor, it is a row in the kernel store. If a host needs a private cache, it must be rebuildable from the store and safe to delete.

### Crash, backup, restore

The kernel store is the one operational artifact to back up. Use the engine's online backup, not a copy of a live file. Keep a backup before every schema migration, a short rolling window, checksums, and a schema version. Definition files and Pi transcripts are backed up as ordinary home files; they are not reconstructed from the kernel store.

Recovery:

```text
verify the kernel store
  → restore the newest valid backup when necessary
  → rebuild disposable views and caches
  → reconcile stale leases
  → reopen existing Pi sessions
```

A backup is not valid until it opens, checks, and identifies its schema version. Losing the kernel store is a restore event. It is not “degrade to at-least-once and hope the logs agree.”

Media files are referenced from message rows. A missing blob is a broken attachment, not a missing conversation.

### What this refuses

- A second authoritative copy of messages, membership, or work
- A private database per host or per loop
- Treating a readable export as an input
- Stuffing soul, skills, or media into tables so everything lives in one file
- Reimplementing Pi transcripts so everything lives in one file
- Casual copies of a live kernel-store file as backup

## Speech and continuation

The default follows who caused the turn. `kernel.completeTurn` applies it. Hosts do not.

- A **human-triggered** turn auto-posts its final assistant text to the bound room unless `hold` was called. `hold` is the only suppressor. A mid-turn progress post must never swallow the conclusion. Empty finals and exact duplicates of text already posted in that turn are skipped.
- An **agent- or service-triggered** turn keeps final text private. The agent posts when there is something to say.

The final auto-reply uses a deterministic id derived from the turn. Completing the same turn twice cannot produce two finals.

Agent-facing tools shrink to:

- `post` — this room by default, or another authorized room; asides use `audience: agents`
- `hold` — intentional silence for this turn
- `wake` — agent-owned future attention, with a load-bearing note
- `read` — authorized history

The user-facing async loop is:

```text
ask in a room
  → agent answers “running”
  → job or wake completes
  → same room, same session, inspectable stimulus
  → agent reports or holds
```

## Jobs and watches

Both produce inspectable stimuli. Neither impersonates a person. Neither is a second runtime.

### Jobs

A job is bounded work with an owner agent, a goal, a backend, a permit (subset of the owner's ceiling), and usually a related room.

Spawn records the job in the kernel store and runs it through the turn engine. Default runner is contained. External backends map the same permit onto their sandbox flags. Uncontained jobs require explicit config.

On completion the kernel posts a service-authored message: author `job/<id>`, `to` = owner, `audience` = `agents`, body = summary plus artifact pointers, deterministic id `job/<id>/report`. Attend then decides. The owner speaks or holds. The job never decides user-facing delivery.

Crash windows: the job record is truth. Reconcile posts a pending report once. Same-id different content fails loudly.

Amendments resume the same `job/<id>` session.

### Watches

Authored watch definitions stay files: trigger and action. The clock and run history live in the kernel store.

A **message** action is `kernel.post` as `watch/<owner>/<id>` with a declared envelope. No sender impersonation. Agents who must wake on their own watches list that service id or rely on `to`.

A **command** action runs on the contained runner with a command-only permit. It does not execute in the attendant process. Output may post as a service message when the watch says so.

Missed while the attendant was down: fire once on next start with the original due time. Do not stack missed runs. Fire ids are deterministic: `watch/<id>/<fire-at-ms>`. An identical retry is skipped. Same id, different body, fails loudly.

### Wakes

`wakeAt` is operational, not an authored watch file. It is a one-shot row in the kernel store: owner, time, note, target session (default: current). The note is load-bearing. It fires into that session, then expires. Inspection lists pending wakes next to watches. Cancellation is CLI-side in this architecture; no agent cancel tool is required to land the kernel.

Heartbeat, if it exists, is a cheap steward looking at summaries. It is not the routing system.

## Household

Top-level agents are the household. A companion is an ordinary agent with a parent pointer, a root under that parent, and grouped discovery. Depth is one. No companion attendants, no nested homes, no inherited soul.

Before creating a persistent actor, use the smallest thing that works:

- a skill for reusable instructions
- a tool or context producer for deterministic facts
- a job for bounded work with an end
- a companion only for enduring identity, separate memory, and independent action over time
- a household agent when the actor belongs to the home, not to one parent

Selected companion output may enter a parent turn only through an inspectable context producer. Companions do not ambiently mutate a parent's mind.

This layer is composition on top of the kernel. It does not change how a turn runs.

## UX Implications

- `shrimpy` and direct terminal chat work with the attendant stopped, missing, unhealthy, or restarting. They must never wait for an attendant socket.
- A stopped attendant means windows and unattended execution are unavailable. It does not make local agents unusable.
- Opening the terminal to an agent opens the owner↔agent DM. Keystrokes are human posts. A job report or another agent's post into that DM paints in the open terminal.
- Session lifecycle commands get a real reply from the owning host's control port. Window `/new` and `/clear` confirm on the transport and leave a boundary marker, not a control/ack pair.
- `explainAttend` (or the equivalent command) shows why an agent woke or stayed quiet.
- Ordinary assistant text is the reply. Agents post explicitly for progress, other rooms, other actors, and unsolicited updates. A quiet human-triggered turn means the agent held, visible in the session transcript.
- Messages accepted while no attendant is running remain durable and visibly pending. Restarting the attendant resumes pending work without replaying completed turns.
- Session ownership conflicts produce a clear error or wait state, never double execution.
- `/new` and `/clear` keep the room, keep the agent, start a fresh session, and leave a boundary marker in the room. The transcript does not disappear.
- People are configured once and inherited by windows. Command access is a person grant.
- Inspection explains why an agent woke or stayed quiet, which session ran, which process held the lease, which permit governed it, and where the result was delivered. `rooms read` still looks like a transcript.
- Restoring the home's operational state is restoring the kernel store plus ordinary home files. There is not a separate “rebuild chat from logs, then guess at in-flight work” ritual.
- A permit that asks for file containment fails closed until a contained runner exists. Tool narrowing is never described as filesystem containment.
- Denied comms grants and denied admits fail loudly with a reason. Nothing important is a silent drop.
- Clients such as an ACP-launched chat UX are a mind, not a second Shrimpy room, unless the user later asks for mirroring.
- A user who never creates a companion still sees a flat household.

### Regressions to avoid

- Terminal startup or direct conversation waiting on the attendant
- Double dispatch across terminal/attendant lease handoff
- A progress post suppressing the final reply
- Attendant restart duplicating completed turns or window deliveries
- A contained agent bypassing authorize through direct file access
- Pending work discarded because no host was available
- Storage or export failure acknowledged as success
- Rooms, display names, or message text granting authority
- Watch-driven agents that previously woke via impersonated human senders becoming unreachable; they must use `to`, mentions, or an explicit service-author filter
- Wallet balance, if a meter exists, expanding a permit
- Client input replacing soul, tools, model policy, or workspace roots

## Build

This is the target shape, not one branch. Sequence later work so each slice deletes the path it replaces. Do not land a parallel runtime.

1. **Contracts.** Host-independent types for actors, rooms, envelopes, turns, leases, wakes, permits, and delivery. No type named after a host or window.
2. **Kernel library.** Domain operations over home files and one kernel store. Schema access stays private. Integrity checks, online backups, and inspection commands belong here.
3. **Four decisions.** Pure, separately testable authenticate, authorize, attend, and admit. Default-allow authorize is acceptable until permits land, but the chokepoint must exist and a stub deny must fail loudly.
4. **Turn engine.** One engine shared by terminal, attendant, jobs, clients, and tests. Remove window, attendant, and delivery types from session execution.
5. **Terminal host.** Owner DM session, local lease, inject pending turns into the live Pi session, full operation with the attendant absent.
6. **Attendant host.** Reduce to the five loops. Control port for session lifecycle. Dispatch skips leased sessions. No domain routing policy in the entrypoint.
7. **Speech.** Auto-reply lives in `completeTurn`, not in hosts. Delete publication-tool swarms and reply-recovery watches.
8. **Windows.** Translators over kernel.post / delivery. People as members. Envelope delivery rule.
9. **Jobs and watches.** Completion and firings become service-authored stimuli. One child-session spawn path through the turn engine.
10. **Permits and containment.** Ceiling validation, per-room permits, trusted vs contained runners. Command watches move onto the contained runner.
11. **Clients.** A local ACP host over the turn engine, capabilities advertised only when enforced.
12. **Household.** Companions as ordinary agents with a parent pointer, after the kernel is real.

Exact CLI spelling can follow these nouns in a later pass. Every feature still needs a `shrimpy <command>` path.

## Boundaries

- The attendant remains optional. The terminal never depends on it.
- The kernel is a library, not a globally shared service locator and not a daemon.
- Do not elect a process-wide log-owner role. The kernel store serializes mutations. Any host may post.
- Rooms, messages, and in-flight work share one kernel store. File dumps of rooms are views, not a second log.
- JSON and JSONL exports are never runtime inputs.
- Pi session storage remains Pi-owned.
- Human-authored Markdown, skills, media, and large artifacts stay files unless a concrete need appears.
- Windows translate. Clients drive minds. Do not force a client to be a window.
- The scheduler executes due wakes. It does not decide whether a message deserves attention.
- Jobs report outcomes. They do not decide user-facing delivery.
- Hosts do not apply speech policy. `completeTurn` does.
- Attention does not grant communication authority. Communication authority does not force a wake.
- The owner's terminal session skips admission. Other sessions do not.
- No profile ids, named permit registries, or sender impersonation.
- No nested homes, companion attendants, or recursive ownership.
- No general-purpose event bus, actor framework, or DI container.
- No wallets, chains, or pricing in core. A meter is an optional hook.
- No legacy shims, compatibility wrappers, or parallel old/new paths. Replace, then delete.
- Do not add migration behavior unless the maintainer asks for it separately.

## Open decisions

- The stale-lease policy for a session whose host disappears during a model call: wait, fail, or requeue, and how that looks to the user.
- Kernel-store backup retention, and whether copies outside the active home are supported.
- How much of the envelope is agent-settable on `post` versus kernel-normalized from the charter.
- Whether the first client persists only as ordinary session files, or supports load-across-process-restart once client session ids map cleanly.
- Companion address spelling, when household work is scheduled. It must be safe across config, mentions, actor ids, session identity, logs, commands, and filenames.

## Done

- The terminal opens the owner↔agent DM with the attendant fully stopped and all attendant runtime files absent. An external post into that open DM runs as a turn in the terminal process.
- One session cannot be executed concurrently by the terminal and the attendant. Lease handoff does not replay or drop turns.
- Session lifecycle round-trips over the control port. No code polls a room for an ack.
- Attend is one ordered function. Tests cover author kind × mode × `to` × mention × replay. `explainAttend` matches it.
- Permits ceiling-check at load, pin on session open, and fail closed for `files` until a contained runner exists.
- Command watches do not execute unrestricted shell in the attendant.
- The attendant can be killed during ingress, turn execution, wake firing, and delivery without silently losing accepted work.
- Restarting the attendant reconciles stale leases and resumes pending work without duplicating completed turns.
- Session execution uses one host-independent turn engine.
- Authenticate, authorize, attend, and admit are independently testable.
- Agents post and read through identity-bound capabilities and cannot self-declare authorship.
- Ordinary final responses require no publication tool. `hold` is the only auto-reply suppressor. `completeTurn` records status, appends that reply, writes delivery intent, and releases the claim in one transaction. Retrying it cannot duplicate the final.
- Agent-owned wakes survive restarts and fire into the intended session.
- Job completion returns as an inspectable stimulus in the related room.
- Window delivery uses committed outbox records with idempotent receipts.
- Room history contains speech, media, and markers. It does not contain RPC. `rooms read` is a query over the kernel store.
- Rooms, messages, and in-flight work live in one kernel store. Runtime never reads generated exports as truth. Deleting a dump loses nothing; deleting the kernel store is a restore.
- Inspection explains messages, attention decisions, pending turns, leases, wakes, permits, and delivery attempts.
- The attendant entrypoint composes the five loops and contains no domain routing policy.
- Old log-polled control, provenance oracles, and duplicate session constructions are gone rather than wrapped.
- Tests inject crashes between durable state transitions and verify the invariants above.

## Notes

This is an independent architecture draft. It should not be edited to match other backlog notes, and those notes should not be edited to match it until a later reconciliation pass.

The kernel is small on purpose. If a change needs a new kind of daemon, a new kind of log, or a new kind of agent, it is probably in the wrong layer.
