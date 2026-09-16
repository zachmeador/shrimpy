# 🦐 Redesign

I'm putting this here so I don't lose it. I'm not doing this redesign right now. These are saved ideas and a possible implementation plan, not an active project contract or instructions for current work.

## First goal

Identify what we can reshape into distinctly separated architectural layers with clear ownership and scope. Each responsibility should have an obvious home, each layer should expose a small interface, and dependencies should have an explicit direction.

Judge the design by how easily someone can follow a complete workflow and change one responsibility. File count alone does not establish whether the architecture is understandable.

Read [purpose and decisions](#what-shrimpy-is-for), [ownership](#proposed-ownership), and [source boundaries](#source-boundaries-and-storage-ownership) for the overall proposal. The detailed contracts cover [agent runtime](#agent-runtime-specification), [protocols](#protocol-and-integration-contracts), [sandboxing](#sandbox-and-supervision), [operations](#operations-limits-and-inspection), and the [implementation proof](#implementation-sequence-and-proof).

## What Shrimpy is for

**Shrimpy gives personal agents a durable home and a place to run.** Their identity, knowledge, work, and relationships should survive the chat window, model turn, and process that happened to be active. A person should be able to leave an agent working, return through a different interface, and understand what happened.

The useful unit is the agent: a named resident with its own workspace and granted authority. Pi supplies the session execution engine. Chat applications supply places to meet. Shrimpy connects those things without making a particular chat application, gateway, or foreground terminal the owner of the agent.

This follows the product intent in the [README](../../README.md) and [design notes](../../docs/reference/design.md), with an important correction to the existing implementation: residence belongs to each agent, not to a central collection of gateway-owned sessions.

Three workflows should make the architecture understandable:

1. `mechanic` maintains the person's environment with the host user's authority. Its status says so plainly. Its work is inspectable and does not acquire legitimacy merely because another agent requested it.
2. `shrimpy` works in its own sandbox, keeps notes and sessions, and runs a useful watch while no chat window is open. It can use approved files and services without needing host access for routine work.
3. Either agent joins a Buzz room alongside foreign agents. The room belongs to Buzz; the Shrimpy agent retains its own sessions and workspace. Leaving that room does not erase the agent.

The framework should make these workflows cheap to understand and extend, including with smaller models. Domain behavior belongs in instructions, skills, files, and useful tools. The runtime supplies predictable mechanics: accept input, run an owned session, retain the result, and communicate through a chosen connection. An idle agent should not need periodic model calls just to remain alive.

### Scope of this redesign

The first target is a personal installation on one Linux or macOS host, initially with `mechanic` and `shrimpy`. Optimize for a small number of resident agents and many saved sessions, with modest bounded concurrency. This is a deployment target, not a measured capacity claim.

Build agent residence, session ownership, sandbox enforcement, direct client access, built-in channels, local context, and simple watches. Preserve useful interactive and background workflows through those same boundaries.

Defer active ownership across hosts, automatic cross-agent memory, arbitrary workflow DAGs, a plugin marketplace, generic federation, complete native Pi UI parity, and a new model execution engine. External integrations may evolve independently. A remote connection can be added later without turning the first implementation into a distributed cluster.

### Architecture decisions in this revision

The [accepted direction](#accepted-direction) records maintainer decisions. The following are engineering recommendations for review, researched against source on **2026-09-07**:

| Decision | Reason and cost |
|---|---|
| One runtime process per agent, multiple sessions inside it. | Gives the agent one state owner and one OS boundary. A process crash affects all its sessions. |
| A resident supervisor per agent when using the proposed SRT backend. | Keeps sandbox proxies, pipes, and attachment alive under one policy. Costs another small process; measure its idle footprint. |
| Local JSON-RPC transport with an ACP adapter. | Separates Shrimpy's durable work semantics from standard client interoperability. Requires explicit protocol translation. |
| SQLite for operational records; Pi JSONL for transcripts; normal files for agent material. | Makes receipt and queue transitions atomic without a database service. Recovery must reconcile the two stores. |
| A terminal client of the runtime. | Closing a terminal cannot terminate the resident agent. Reuse Pi UI components where practical, but do not promise its full in-process UI. |
| SRT as the first sandbox feasibility spike. | Existing OS mechanisms are preferable to inventing containment. Its defaults are insufficient; private reads and cleanup are release gates. |
| Modules within each owner; RPC only across actual process boundaries. | Keeps ordinary code changes local and avoids a framework of internal services. |

### Principles with consequences

Use architecture research to decide where behavior belongs, not to accumulate patterns:

- **Hide decisions that change independently.** Parnas's [module decomposition paper](https://www.cs.tufts.edu/comp/150FP/archive/david-parnas/criteria.pdf) argues for boundaries around design decisions rather than steps in a flowchart. Applied here: changing a chat provider, sandbox backend, or Pi version should each have a clear home; a renamed sequence of orchestration files is insufficient.
- **Define interfaces by purpose.** Cockburn's [ports and adapters](https://alistair.cockburn.us/hexagonal-architecture) separates application behavior from its input/output devices. Applied here: receiving work and publishing a message are meaningful interfaces; CLI, ACP, and Buzz are adapters. Test the behavior without running those applications.
- **Keep correctness with the owner that can establish it.** Saltzer, Reed, and Clark's [end-to-end argument](https://web.mit.edu/Saltzer/www/publications/endtoend/endtoend.pdf) distinguishes transport mechanisms from application guarantees. Applied here: a gateway can establish message acceptance; only the agent can establish its work outcome. Neither can establish exactly-once execution of an arbitrary external tool.
- **Separate restart from recovery.** [Erlang's supervision model](https://www.erlang.org/doc/system/sup_princ.html) makes process lifetime and restart limits explicit. Applied here: the supervisor restarts a failed process with a bounded policy; the agent reconciles its own state. Restarting the gateway never restarts all agents.

## Accepted direction

- An agent should be naturally sandboxable. Its runtime must work through explicit connections and its own workspace, with no need for ambient access to the rest of Shrimpy.
- Chat surfaces connect at the agent runtime boundary. Agents own their turns, sessions, context construction, and execution, regardless of where a conversation happens.
- Shrimpy channels are the simple, built-in communication option, available in a standard setup without another chat service. A lightweight gateway mediates those channels. An agent can use other chat systems or run independently without using Shrimpy channels or connecting to the gateway.
- Host agents run with the permissions of the operating-system user. Shrimpy must describe that authority honestly. Setup creates `mechanic` as the first and only host-level agent by default, and also creates `shrimpy`, sandboxed by default.
- Sandboxing should follow the practical Codex model: enforced filesystem and network boundaries, useful autonomy inside them, and explicit handling of requests beyond them. The implementation backend still needs verification.
- Buzz and other chat apps must be able to host conversations with Shrimpy agents alongside agents from other systems. Shrimpy cannot assume it owns every participant or the chat application.
- Turn-context suggestions are local to the agent's workspace. Cross-agent workspace search and centralized session management are not prerequisites for useful context.

These decisions describe the direction explored in this draft. The implementation proposals below remain open for review.

## Proposed ownership

| Part | Owns | Boundary |
|---|---|---|
| Gateway | Shrimpy channel identities, membership, history, routing, and delivery state. | Serves the built-in channel system. Has no Pi sessions, prompts, model loop, or turn-completion policy. External chat systems own their corresponding room state. |
| Agent runtime | Its incoming work, attention decisions, session selection, turns, tools, compaction, transcripts, memory, local context, watches, and delegated work. | Exposes the boundary for chat adapters and session clients. Uses its own workspace and explicit connections. Requires no Shrimpy channel or gateway to run. |
| Runner | Starting, stopping, and supervising agent processes; applying host or sandbox policy; supplying scoped connections and credentials. | Enforces the execution boundary. A small per-agent supervisor retains required pipes and proxies. It does not interpret prompts or decide how an agent completes a turn. |
| Adapters and interfaces | CLI, TUI, web inspection, ACP, Shrimpy channels, and external chat integrations. | Connect to the agent runtime. Each chat adapter maps sender identity, conversation/thread references, incoming messages, and publication to its own service. |

### Where two agents can talk

These diagrams describe the proposed design. Each agent owns its sessions and context. The service between them owns its room history and delivery.

The built-in path works without installing another chat service:

```text
mechanic                     Shrimpy gateway                 shrimpy
+------------------+         +------------------+         +------------------+
| channels adapter | <-----> | membership       | <-----> | channels adapter |
| agent runtime    |         | channel history  |         | agent runtime    |
|                  |         | routing          |         |                  |
| own sessions     |         | delivery state   |         | own sessions     |
| own context      |         +------------------+         | own context      |
+------------------+                                      +------------------+
```

The same agents can meet in Buzz. This path works with the Shrimpy gateway stopped, and no Shrimpy channel is created for the conversation:

```text
mechanic                        Buzz service                 shrimpy
+------------------+         +------------------+         +------------------+
| Buzz adapter     | <-----> | room membership  | <-----> | Buzz adapter     |
| agent runtime    |         | room history     |         | agent runtime    |
|                  |         | delivery         |         |                  |
| own sessions     |         +------------------+         | own sessions     |
| own context      |                   ^                  | own context      |
+------------------+                   |                  +------------------+
                                       v
                             +------------------+
                             | foreign agent    |
                             | its own runtime  |
                             | Buzz integration |
                             +------------------+
```

Both kinds of chat adapter connect to the same agent boundary. A session client can also interact directly:

```text
CHAT CONNECTIONS                         SESSION CLIENTS
Buzz / Telegram / Shrimpy channels        CLI / TUI / ACP
                |                              |
                v                              v
     message + sender + destination      prompt / resume / stop
                |                              |
                v                              |
     authority and attention                   |
                |                              |
                +---------------+--------------+
                                |
                                v
                    AGENT-OWNED SESSION
                    context -> Pi -> tools
                                |
                   +------------+-------------+
                   |                          |
                   v                          v
           session transcript          explicit publication
           and live session UI         through a chat adapter
```

Session activity does not automatically become a room message. A reply keeps its source conversation and destination through the adapter.

Within each part, separate rules from I/O and keep construction at the edge. The gateway and runner must not import agent session internals. The agent runtime depends on small conversation and session interfaces; a Shrimpy channel ID must not be required to identify a session or run a turn. Shared code should stay small enough to explain its job in one sentence.

Gateway restart must not reset an agent's sessions, cancel its local work, or interrupt unrelated chat connections. Agents own execution recovery; each communication integration owns delivery recovery for its service. Host-level agents remain trusted as the host user: gateway authorization is not OS isolation from `mechanic`.

## Source boundaries and storage ownership

At source revision `27b3a28`, 59 of 237 TypeScript files under `src/` directly import `AppRuntime`, counting type imports. That is evidence of widespread knowledge of application internals, not a claim that all imports form runtime cycles. [AppRuntime](../../src/app/runtime.ts) resolves every agent, workspace paths, surfaces, models, tools, and sessions. [Foreground execution](../../src/sessions/foreground.ts) constructs a channel bus even for transcript-only work. [Gateway delivery](../../src/gateway/channel-delivery-loop.ts) creates agent session owners and disposes them on shutdown. Those dependencies explain why moving a feature often touches unrelated parts.

Organize the replacement around owners and decisions that change independently. These are proposed source modules, not separate packages or a requirement to create every directory immediately:

```text
src/
  main/                  executable construction and config loading
  clients/               CLI, terminal UI, ACP, inspection
  integrations/          channels, Buzz, other chat adapters
  runner/                policy, attachment, sandbox, process lifetime
  gateway/               channel protocol, membership, ledger, delivery
  agent/
    api.ts               public operations and observations
    runtime.ts           constructs one agent; starts and stops it
    work/                input, attention, bindings, scheduling
    sessions/            owned session catalog and coordination
    pi/                  Pi construction, events, tools, resources
    context/             local context and optional search
    publication/         deliberate sends and delivery records
    watches/             due work
    jobs/                delegation and results
    storage/             agent operational records
```

Dependency direction is different from the order of messages at runtime:

```text
Executable composition creates implementations and passes interfaces.

clients / integrations ----------> agent public API
agent coordination -------------> small execution / storage / I/O ports
Pi / SQLite / chat implementations -> the ports they implement

channels integration -----------> gateway public protocol
runner -------------------------> launch and process contracts

No component imports agent/runtime.ts or executable composition.
No gateway or runner module imports Pi session execution.
No context or session rule imports a chat provider or terminal UI.
```

Concentrate Pi execution APIs in `agent/pi`; reusable terminal components can also be used by clients. Keep the execution interface small enough to wrap the Pi operations actually needed. Do not build a universal agent-engine interface in anticipation of replacing Pi. Context and publication receive their own reader or sender functions, never a general `AgentRuntime` object. Keep wire data types with their owning public protocol; avoid an ever-growing shared-core package.

Enforce these boundaries with import checks, including type imports and obvious dynamic imports. A new chat adapter should require changes to that adapter and its configuration/registration, not to session coordination, context, or gateway internals. A new sandbox backend should change runner enforcement and capability reporting. Those change exercises are stronger evidence than smaller files alone.

### Environment versus agent workspace

The **environment directory** belongs to the person's installation. An **agent workspace** is the subset assigned to one agent. Passing the latter into a component never authorizes discovery of its siblings.

```text
environment/
  config/                 trusted agent registration and launch grants
  run/                    supervisor sockets, locks, instance records
  gateway/                built-in channel database and delivery state
  agents/
    mechanic/             its own workspace; host-user authority
    shrimpy/              its own workspace; sandboxed by default
      SOUL.md
      context/ skills/    agent instructions and resources
      vault/ projects/    knowledge and work
      sessions/           Pi transcripts
      state/agent.sqlite  accepted work, bindings, sends, watches, jobs
      cache/              rebuildable local search and derived views
```

These paths illustrate ownership, not an authorized migration of the current workspace. The runner supplies resolved paths and a private HOME/scratch area as needed. Shared read-only resources must be explicitly included in the agent's view. Launch grants, other agents' private files, and gateway storage remain outside the sandbox. A sandboxed agent may edit its preferences and instructions; those files cannot enlarge the trusted launch grant.

Every management operation follows its state owner. CLI changes to sessions, watches, jobs, and agent settings use the agent API. Agent creation, launch policy, and process termination use the runner/operator interface. Channel membership uses the gateway API. Inspection uses live APIs or consistent published snapshots; it must not open a second writable Pi session. An offline maintenance operation first establishes exclusive ownership. Normal Markdown editing remains normal file editing, with changes incorporated at a safe session boundary.

### The gateway's complete job

The built-in gateway is a small communication service: authenticate channel principals; manage channels and membership; accept publications; retain channel history; deliver events to authorized subscribers. It knows neither an agent's Pi session IDs nor whether an agent ought to answer a message.

Use a gateway-local SQLite database for the channel ledger, membership, deduplication, and subscriber progress. Publishing commits a message and its stable channel sequence in one transaction before returning acceptance. Delivery records distinguish gateway acceptance from each subscriber's receipt. The receiving runtime acknowledges only after recording its own input. There is no shared transaction across the two processes.

Order events within a channel by its gateway sequence. Do not promise global ordering across channels, services, or sessions. Reconnect resumes from a cursor; retained message IDs prevent ordinary delivery replay from admitting the same input again. Removing membership prevents future delivery and rejects new publication; it cannot retract material already delivered into an agent's workspace.

An unavailable or slow agent accumulates bounded delivery backlog. Retain shared channel events plus subscriber offsets rather than a separate content copy for every subscriber. When the gateway cannot retain a new message and its promised delivery, reject publication before acceptance with a capacity error. Never discard accepted obligations or advance an undelivered cursor silently. This trades continued publication for bounded, honest delivery under prolonged outages; inspection identifies the subscriber or storage limit causing it. An operator removing a subscription or truncating retained history creates an explicit reconciliation gap.

The gateway does not open a session on an unavailable agent's behalf. Agents reconnect with backoff; the gateway never waits for model completion to accept another channel message. External chat services implement their own corresponding guarantees through their adapters.

## Agent runtime specification

**One agent runtime runs one Shrimpy agent and owns that agent's Pi sessions.** It can keep several sessions open and serve several clients. Its identity and workspace stay fixed for its lifetime. Connecting another client does not create another agent, and disconnecting a client does not end the agent's work.

This is the proposed runtime contract for review. The component boundaries below are implementation targets; they do not require a separate package or process for each component.

### What lives inside the runtime

```text
         CHAT ADAPTERS                 SESSION CLIENTS
   Buzz / channels / others            CLI / TUI / ACP
                |                            |
                v                            v
+--------------------------------------------------------------------+
| ONE SHRIMPY AGENT RUNTIME                                          |
|                                                                    |
|  Intake and authority       Conversation-to-session bindings       |
|              \                /                                    |
|               v              v                                     |
|              Session coordinator                                   |
|              queues, active owners, cancellation                   |
|                    |                                               |
|               +----+------------------------+                      |
|               v                            v                       |
|  +-------------------------+  +-------------------------+          |
|  | Pi session A            |  | Pi session B            |          |
|  | transcript and branch   |  | transcript and branch   |          |
|  | model and settings      |  | model and settings      |          |
|  | tool/extension state    |  | tool/extension state    |          |
|  | active turn             |  | active turn             |          |
|  +-------------------------+  +-------------------------+          |
|               |                            |                       |
|               +-------------+--------------+                       |
|                             v                                      |
|  Agent services: context, resources, publication, watches, jobs    |
|                             |                                      |
|  Agent storage: Pi transcripts, work records, memory, local index  |
+--------------------------------------------------------------------+
                |                            |
                v                            v
        Own workspace                 Explicit connections
                                      Models / chat / allowed tools
```

The composition entry point constructs these components and passes narrow interfaces between them. A context builder receives local readers and search; a publication tool receives a publisher and destination; a session coordinator receives a Pi session factory and work store. None receives an object exposing every service in the application.

| Component | Responsibility |
|---|---|
| Intake and authority | Authenticate the connection, validate input, distinguish chat participation from permission to control a session, and persist accepted work. |
| Conversation bindings | Map an integration's conversation or thread to an agent-owned session. Apply the agent's attention rules to room events. |
| Session coordinator | Open, resume, fork, close, and serialize access to Pi sessions. Schedule work, bound concurrency, route cancellation, and record outcomes. |
| Pi session host | Construct Pi with the session's tools, resources, settings, and transcript. Adapt its lifecycle and events to the coordinator. |
| Context and resources | Resolve agent instructions, skills, local suggestions, and the inputs for a particular turn. |
| Publication | Route deliberate messages through the selected chat connection and track delivery independently of turn completion. |
| Watches and jobs | Produce local work at the appropriate time, track delegated work, and deliver results back to the owning session. |
| Storage | Keep Pi transcripts and agent-owned operational records. Supply local search and inspectable state without contacting the gateway. |

The runner supplies the agent descriptor, workspace roots, enforced execution policy, and allowed connections before startup. The runtime does not need the environment's full agent registry, another agent's paths, or gateway storage. It can start with no chat connections at all.

### What Pi owns, and what Shrimpy adds

Pi remains the execution engine within each session. Shrimpy decides which work enters a session and connects that session to the agent's environment.

| Pi owns within a session | Shrimpy owns around sessions |
|---|---|
| The model/tool loop and streamed execution events. | Admission, attention, routing, and scheduling across sessions. |
| Messages, transcript persistence, the session tree, and context reconstructed from that tree. | Locating owned sessions, conversation bindings, and operational work records. |
| Steering, follow-up messages, cancellation, retry, and compaction machinery. | Who may request these actions, when to invoke them, and how to report their outcomes. |
| Model selection, tools, extensions, and resource-loading APIs. | Agent defaults, allowed resources, per-session construction, and connections to local services. |

Use Pi's supported APIs and extension points. Shrimpy can supply a compaction policy or additional context, but it must not recreate a second transcript, model loop, or independent queue of tool calls.

The installed Pi version at inspection is `0.84.4`. Its `AgentSession` represents a live session. Its similarly named `AgentSessionRuntime` hosts a **single current session**, including replacement operations such as switching and forking. That Pi class is a building block; it is not the multi-session Shrimpy agent runtime specified here. Current [session construction](../../src/sessions/open.ts) already uses both APIs.

### Agent state versus session state

An agent owns its identity, workspace, resource catalog, integration connections, watch definitions, and job records. Provider clients and model catalogs can be shared where their APIs permit it. Shared configuration has a revision so a turn can record which configuration it used.

Each open session gets its own Pi session manager, mutable settings, selected model and thinking level, active tools, extension state, context controller, event subscriptions, and cancellation state. Session A changing its model or compacting must not change session B. Resource definitions may be shared; a mutable extension instance must not accidentally become shared session state.

The current [bootstrap](../../src/sessions/bootstrap.ts), [resource loader](../../src/sessions/pi-resources.ts), and [session opener](../../src/sessions/open.ts) contain useful pieces of this split. Preserve those capabilities while removing their dependence on broad application state and implicit project directories.

Session construction takes explicit paths. Concurrent sessions must not change process-wide environment variables or the process working directory to select their configuration. A session's working directory must be within the authority granted to the agent.

All sessions inside one agent process share its OS authority. A smaller tool list is an application rule, not an additional sandbox. Work requiring a different execution boundary belongs in another runner-managed agent or child environment with an explicit policy.

### Sessions and conversations have separate identities

Use Pi's session ID as the durable session identity exposed by the runtime. Keep an agent-local catalog mapping that ID to its transcript and Shrimpy metadata. A human name or conversation binding points to the session; it does not become a second competing transcript identity.

Reserve that ID in the catalog before returning a newly created session. Pi `0.84.4` supports `SessionManager.create(cwd, directory, { id })`, but defers a new transcript file until an assistant message exists. The catalog therefore distinguishes a reserved session from a materialized transcript. A never-started reservation can be opened with its reserved ID after restart. A started session with no transcript is interrupted work, not evidence that nothing happened. See the pinned [SessionManager implementation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/src/core/session-manager.ts).

An integration binding identifies a configured connection or account. Within it, the adapter supplies its native conversation and thread references. The complete binding is needed: a room ID from one account must not accidentally select a session for another account.

```text
INPUT OR CLIENT                         AGENT-LOCAL BINDING

Buzz account X / room 12 / thread 8 ---> Pi session A
Shrimpy channels / channel 4 ---------> Pi session B
CLI explicitly opens session C ------> Pi session C
Watch configured for session D ------> Pi session D

No channel ID is needed to create or identify any Pi session.
Sharing a session between conversations requires an explicit binding.
```

The adapter declares its conversation scope; the runtime applies configured bindings and creates a session when appropriate. The default is separate sessions for separate conversation scopes. Joining two surfaces to the same session is an explicit choice with visible context-sharing consequences. A shared session does not itself bridge their messages.

Resume reopens the same Pi session and restores its saved state. A fork creates a new session with an explicit relationship to its source. Moving the active branch within a Pi transcript keeps the same session identity. Detach removes a client subscription.

Close requires session-management authority: it rejects admission while closing, cancels the active execution and all already queued inputs for that session with recorded outcomes, then releases in-memory resources. History and bindings remain. A later new prompt or eligible conversation event can reopen the saved session; disabling future conversation work is a separate binding/attention change. Closing therefore cannot immediately restart previously queued work. Automatic idle eviction only releases an idle instance and changes no accepted work. Archive changes discoverability, and deletion is a separate explicit operation.

Only one live runtime may own an agent workspace on a host, and only one owner may write a session. The runner attaches clients to that owner or launches it once. Its lock serializes supervisors, while a persistent instance record identifies the child and its cleanup state; both live outside the child's writable workspace. Acquiring a lock released by a dead supervisor is insufficient to launch another child. The replacement first establishes previous-child cleanup. An instance token distinguishes restarts; a PID or expired timestamp alone never proves it is safe to launch another writer. Simultaneous ownership across hosts through shared storage is outside the initial design.

### Intake and the session interface

The runtime exposes a small set of operations independent of chat transport:

- Describe the agent, its effective execution policy, and supported capabilities.
- List, create, inspect, resume, fork, and close owned sessions.
- Submit a prompt, deliberately steer an active session, queue a follow-up, or cancel work.
- Subscribe to session activity and inspect durable work outcomes after reconnecting.

Chat adapters additionally submit conversation events and implement publication. Watches and delegated results submit local work through the same coordinator. Transport handlers convert requests into these operations; they do not run Pi directly. An ACP adapter preserves standard ACP behavior when translating them, including the standard prompt response and cancellation semantics.

Separate three identities: the source message or client submission, the accepted work item, and the session in which it executes. One session runs many turns. Initially, each ordinary admitted input starts its own execution; a harness can deliver a batch as one input, and deliberate steering can join an existing execution. Do not add automatic cross-source coalescing to the first implementation. Record the relationships instead of treating a channel message ID as a universal turn ID.

Every accepted input carries authenticated provenance, a stable submission ID, its target or conversation binding, structured content, and any authorized reply destination. Connection identity comes from the authenticated adapter or client, never a sender string supplied in model text. Attachments become scoped references or copied local files; receiving a pathname does not grant access to that path. Chat text remains conversation data, not runtime configuration.

Treat interactive commands as separately authorized operations. Pi tries extension slash commands before its input hook. For conversation content, call `prompt` with `expandPromptTemplates: false`; in Pi `0.84.4` that disables native extension-command dispatch and skill/template expansion. An input hook alone is too late to establish this boundary. Trusted extensions still execute within the agent's authority. See [Pi prompt handling](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/src/core/agent-session.ts).

Room membership alone does not grant the right to inspect other sessions, change the model, stop work, or enable tools. The runtime checks each operation against the connection's granted authority. A model cannot impersonate a session-control client by emitting protocol-shaped text.

Persist a receipt before acknowledging accepted work. Deduplication keys include the authenticated source and its submission ID; identical IDs from unrelated connections do not collide. Retrying that key with the same content returns the same receipt; conflicting content is rejected. A receipt means the runtime owns the input; it does not mean Pi has started or that the agent will answer. Attention rules can record an event as ignored or deferred without starting a model call. Full queues reject new work before acknowledging acceptance.

This follows the explicit client-token pattern in [AWS's idempotent API guidance](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/). Identical prompt text is not an idempotency key: intentional repeated requests remain valid. Retain deduplication records throughout the supported replay window; an expired replay cursor must require reconciliation, not silently treat old events as new work.

Default attention rules ignore the agent's own published messages and distinguish addressed work from room observation. Use verified source identities and explicit conversation policy, including limits on automatic agent-to-agent exchanges. A room should not create an unbounded reply loop. Optional reply reminders, semantic attention models, or completion-review model calls remain agent policy; they are not mandatory steps in every runtime turn.

### Scheduling, steering, and cancellation

The coordinator maintains a serial execution lane per session and a configurable bound on active sessions. Start with one active execution per agent by default; allow configured concurrency after the independent-session checks pass. Schedule eligible sessions fairly instead of letting one busy conversation consume the entire queue. Two ordinary prompts must not mutate the same Pi session concurrently. Model changes, resource reloads, branch changes, and other session mutations use that session's lane.

Open sessions lazily and bound the number of live Pi instances separately from the number of stored sessions. Idle instances can be closed after their Pi queues settle; persisted work and conversation bindings survive. Restarting an agent should not require opening every historical session.

Ordinary incoming work waits in the runtime's durable queue while a session is busy. It does not silently become steering. Explicit steering and follow-up requests use Pi's own APIs once admitted. Record that handoff and reconcile Pi's pending state; do not leave two queues independently responsible for executing the same input. Steering can join an existing execution, so work receipts must identify that relationship instead of inventing a separate isolated turn.

Cancellation is a control operation that can interrupt a busy lane. It identifies the active execution so a delayed stop cannot cancel the next turn. It invokes Pi's `abort()`, which awaits its idle lifecycle, before declaring the session stopped or opening it for another prompt. Tool adapters must also establish the disposition of their local executions; an external service may already have performed a side effect. Stopping an execution includes any steering already incorporated into it, and the affected receipts reflect that scope. Unrelated queued work is retained unless the caller requests its cancellation; inputs handed to Pi but not consumed must be reconciled explicitly.

```text
accepted input --> queued --> context prepared --> Pi execution
                      |                                |
                      | cancel before start            +--> tools
                      v                                +--> retry
                  canceled                             +--> compaction
                                                       +--> continuation
                                                       |
                                                       v
                                                Pi settles / is idle
                                                       |
                                                       v
                                              record work outcome

explicit stop ----------------> Pi abort --> wait for idle --> outcome
```

A raw `agent_end` event is not sufficient proof that the session is idle. Pi may still retry, compact, or continue queued work. Resolving `prompt()` is also insufficient: an extension may handle input without a model call, or the call may merely enqueue input. The coordinator uses Pi's settled/idle lifecycle and tracks which admitted inputs were included. It distinguishes handled-without-model, completion, failure, cancellation, and interruption with an uncertain outcome. A failed publication is recorded separately; it does not automatically cause another model turn.

If a tool cannot stop, the session remains unavailable for new execution. Escalation to process termination goes through the runner and affects every session in that agent process. Report that scope before an operator-initiated termination; never report successful cancellation while the old execution still runs.

Concurrency also exposes shared workspace edits. Session serialization protects session state, not every file an agent can modify. Delegated coding work that needs independent checkouts must explicitly obtain them; opening another Pi session does not isolate filesystem writes.

### Context, resources, and tools

Build turn input through one path for direct clients, chat, watches, and delegated results. Capture the agent configuration revision, session settings, authenticated source metadata, and selected local context before invoking Pi. Pi reconstructs its own transcript context and applies its own compaction machinery.

The Shrimpy context builder reads the agent's instructions, approved resources, explicitly delivered artifacts, and optional suggestions from that agent's workspace. It receives no all-agent search service. Search failure omits suggestions and produces an inspectable diagnostic; it does not prevent the prompt from running.

Record the context actually attached to the session and its source identifiers. Local suggestion delivery state means that material was attached to a particular input, not that a provider successfully consumed it. A retry must not lose context because an earlier attempt marked suggestions delivered before recording the input.

Skills and instructions are resources with known origins. Load approved agent resources explicitly rather than discovering another workspace through ambient Pi paths. Apply resource changes at a session boundary and record the revision; do not mutate extensions underneath an active turn. Native TUI renderers belong in the UI integration, while the underlying execution events remain usable by headless clients.

Tools receive the dependencies they need: scoped filesystem access, process execution, allowed service connections, publication, or job submission. Dynamic tool lists and MCP/client-provided tools remain subject to the agent's granted authority. A client offering a host terminal must not bypass the runner's sandbox through that tool connection.

### Publication and session observation

A session client observes model output, tool events, and state changes. A chat participant receives only content deliberately published through a chat adapter. These are separate interfaces even when the same application uses both.

Publication names an integration binding and its native conversation/thread destination. A reply can use the destination attached to an admitted input; it must not consult a process-wide "current channel" or whichever session the TUI happens to display. If multiple inputs are coalesced, preserve their individual destinations rather than guessing one. A prompt with no chat source has no implicit chat destination.

Create a stable publication ID and local delivery record, then commit an attempt-start transition before calling the remote service. On restart, a publication with no attempt can send; an attempt lacking a final result may already have succeeded. The adapter maps the ID to the service's idempotency and delivery mechanisms. Track pending, confirmed, failed, or uncertain delivery separately from the turn outcome. If the service cannot deduplicate or confirm an ambiguous send, report uncertainty instead of claiming exactly-once publication or blindly sending again.

Client streams are observations, not another transcript store. Reattachment returns a state snapshot and a cursor for subsequent events. If a cursor has expired, require resynchronization from persisted session state rather than silently omitting activity. Raw token deltas need not be retained; reconstruct observations from available Pi entries and persisted work outcomes, subject to the durability limits below.

### Durable state and recovery

All of the following belongs to the agent's workspace. The gateway has its own independent storage for Shrimpy channels.

| State | Owner and recovery rule |
|---|---|
| Pi session JSONL | Pi is the transcript writer and owns its tree and compaction records. Shrimpy uses supported APIs and custom entries for necessary correlation metadata. |
| Session catalog and conversation bindings | Runtime storage resolves owned session IDs and source destinations without inspecting gateway state. |
| Accepted inputs and work outcomes | Runtime storage records receipt, queue position, execution association, and outcome so reconnects do not resubmit work blindly. |
| Publications and integration cursors | Runtime and adapter record local send/receive progress. Remote service acceptance remains a separate fact. |
| Watches and delegated jobs | Agent-owned definitions and execution records preserve due work, parent relationships, and known results. |
| Instructions, memory, and artifacts | Agent-owned files retain their existing role as useful inspectable material. |
| Search index and derived views | Rebuildable from this agent's authorized files and records. Their loss does not prevent session resume. |

Use one SQLite database per agent for related operational records. Store current state and necessary correlations; do not build a general event-sourcing framework or mirror Pi's transcript into tables. A source receipt, its content, binding decision, and queued work are committed together. This fits SQLite's [application-local use cases](https://www.sqlite.org/whentouse.html) while avoiding another service. Keep writes short and use durable commit settings for acknowledged work. If WAL is selected, the database and sidecar files belong on the same local filesystem; SQLite [does not support WAL across a network filesystem](https://www.sqlite.org/wal.html).

Pi's transcript and the runtime's operational store cannot be assumed to share an atomic transaction. Associate them with stable work IDs using Pi metadata where appropriate. On startup, reconcile incomplete transitions against persisted session entries before deciding what can run.

Commit a work item's `started` transition before invoking Pi or any potentially effectful command. Persist a terminal outcome only after the execution settles and its available transcript correlation has been recorded. These ordering rules make the crash gaps inspectable:

| Last established point | Recovery |
|---|---|
| Input receipt did not commit. | The sender can retry with the same submission key. No acceptance was established. |
| Input committed; work never marked started. | Schedule the queued work once after ownership is established. |
| Started committed; Pi output absent or incomplete. | Mark interrupted. Even absent output does not establish absence of effects. |
| Pi settled; terminal work record missing. | Reconcile available entries. Report an uncertain outcome where completion cannot be established; do not rerun automatically. |
| Publication recorded; no send attempt started. | Send after establishing current authority and capacity. |
| Send attempt started; final result absent. | Treat as potentially delivered, even if the crash might have preceded network I/O. |
| Publication accepted remotely; local confirmation missing. | Query or retry only using the service's supported idempotency contract; otherwise retain uncertain delivery. |

An explicitly requested continuation is a new admitted input with the interrupted work available as context. A transcript containing a tool call cannot establish that its external action is safe to repeat. Preserving this uncertainty is preferable to a recovery loop that silently repeats a purchase, message, or file operation.

Distinguish process-crash recovery from power-loss durability. Pi `0.84.4` appends JSONL synchronously but offers no public per-entry fsync guarantee. SQLite's [atomic commit guarantees](https://www.sqlite.org/atomiccommit.html) do not extend to those separate files. The first release can promise durable accepted inputs under its configured storage assumptions and honest interrupted execution; it must not promise that every streamed token or tool result survives sudden power loss. The Pi adapter should detect malformed/truncated transcript tails and report repair needs without inventing results.

Agent-writable files and operational records are not a tamper-proof audit log. Protecting the rest of the host is the sandbox's job; protecting an agent's state from its own authorized tools would require another boundary.

Gateway or chat-service failure only changes that connection's delivery state. Local sessions continue. Runtime failure interrupts its sessions; the runner may restart the process, but the runtime owns reconciliation and decides what work is safe to resume.

### Watches, delegation, and process lifetime

Watches belong to the agent runtime. A due watch produces local work or a scoped local action; it does not need to post a message through the gateway to wake its own agent. It can target an existing session or request a separate session according to its definition. Watches record due/run identity so restart does not accidentally duplicate admission.

The initial model is a resident agent process: watches run while it is running. Waking a stopped agent requires an explicit runner scheduling capability. Even then the runner only launches or signals the agent; it does not construct the watch's prompt or own its turn.

Delegated work records its parent session, requested scope, execution backend, cancellation handle, and result. A local Pi task can use another session owned by this runtime. A separately sandboxed task goes through the runner. An external agent backend owns its own transcript; Shrimpy records a job reference and delivered result rather than pretending it is a local Pi session. Another Shrimpy agent remains a peer contacted through an enabled communication integration, with its own runtime and authority.

Local delegation returns a job handle and delivers completion as new local work. It must not hold the last execution slot while waiting for a child to acquire that same slot. Canceling a parent session and canceling its jobs have explicit, separately reported scopes.

At startup, acquire agent ownership, validate the supplied workspace and policy, open local stores, reconcile interrupted work, initialize resources, then accept connections and schedule work. A failed optional chat connection must not prevent local use. Policy enforcement failure is a launch failure.

On shutdown, stop admission, persist pending work, and either drain or explicitly cancel active sessions under the selected shutdown policy. Wait for Pi to become idle, dispose session resources, flush stores, and release ownership. Disconnecting a UI or losing a gateway connection is neither shutdown nor cancellation. Configuration changes take effect at safe boundaries; widening OS authority requires the runner's separately authorized policy change.

### Terminal UI and client lifetime

**Build the first terminal UI as a client of the resident runtime.** Its required scope is prompt entry, assistant/tool streaming, cancellation, session list/resume, fork, model/thinking selection, and detach. Reuse Pi terminal primitives where useful. Headless execution and the terminal must use the same admission and session operations.

Today [Shrimpy's TUI](../../src/tui/interactive.ts) hosts Pi directly. Pi `0.84.4` [InteractiveMode](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/src/modes/interactive/interactive-mode.ts) supports injected terminal IO, but also mutates live sessions, installs process handlers, and calls `process.exit()` on shutdown. Its [session-switching runtime](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/src/core/agent-session-runtime.ts) aborts/disposes the outgoing session. A PTY does not turn those behaviors into safe attachment to a resident owner.

Exact native extension UI and complete InteractiveMode parity are deferred. If they become requirements, first establish a supported upstream UI-host seam rather than monkeypatching process exit or opening a second writer. Pi's [RemoteSession client](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/src/client/remote-session.ts) is useful prior art, but its exclusive lease and automatic steering policy cannot be adopted unchanged. Its experimental remote protocol is not an additional first-release protocol commitment.

Switching the viewed session must leave other sessions running. Switching agents attaches to a different runtime. Closing the terminal detaches the client; it never means stop the agent. An ACP subprocess is likewise a bridge to the owner, not another session host.

A work item records any client-provided tool connections it depends on. If that client disconnects, those tools become unavailable; the runtime must not substitute an unrestricted host service. Pending permission requests receive no implicit approval. Runtime-owned provider/chat connections can continue independently. Persistent work is not a promise that a vanished client can still supply its filesystem, terminal, or MCP server.

### Where the current code moves

| Current implementation | Proposed treatment |
|---|---|
| [Bootstrap](../../src/sessions/bootstrap.ts), [resolver](../../src/sessions/resolver.ts), [open](../../src/sessions/open.ts), and [Pi resources](../../src/sessions/pi-resources.ts) | Extract the agent resource services and session factory. Keep Pi integration; replace broad workspace/application inputs with explicit dependencies. |
| [SessionPool](../../src/sessions/pool.ts) and [turn output](../../src/sessions/turn-output.ts) | Replace channel lanes with session coordination and Pi settled/idle completion. Keep scheduling and cancellation inside the agent. |
| [Identity](../../src/sessions/identity.ts), [transcript store](../../src/sessions/transcript-store.ts), and [ownership](../../src/sessions/ownership.ts) | Separate Pi identity, conversation bindings, and process ownership. Retain Pi transcript operations without requiring a channel namespace. |
| [Turn-context builder](../../src/context/turn/builder.ts), [delivery](../../src/context/turn/delivery.ts), and [search](../../src/workspace/search.ts) | Use agent-local readers, indexing, and attachment records. Remove centralized session and cross-agent corpus requirements. |
| [Daemon tools](../../src/tools/daemon.ts) and [channel runtime](../../src/agents/channel-runtime.ts) | Separate source-aware input routing and publication from session execution. Channel-specific delivery stays in the channels integration. |
| [Watch runner](../../src/watches/runner.ts) and [worker runner](../../src/workers/runner.ts) | Give scheduling and job records an agent owner. Submit execution through local session or runner interfaces. |

## Protocol and integration contracts

Use ordinary function calls within a process and JSON-RPC 2.0 at the local process boundary. Adopt a small versioned Shrimpy protocol for durable work and agent operations, with standard ACP exposed by an adapter. This is a recommendation for the first implementation, not a claim that RPC supplies reliability or sandboxing by itself.

### Local attachment

The host supervisor owns a protected local Unix socket and retains the child's stdin/stdout connection. The CLI and long-lived clients attach there. The child receives framed protocol input on stdin, writes protocol output on stdout, and sends diagnostics to stderr. A client disconnect does not close the supervisor's child connection. Additional inherited descriptors and direct sandbox socket access are later optimizations subject to backend testing.

Authenticate host connections, bind them to a principal and grants, then forward that identity over the trusted child connection. The supervisor owns principal assignment and request routing, including mapping request IDs per connection so two clients using ID `1` cannot collide. Child frames cannot establish new principals or enlarge host grants. Sessions within one runtime share a trust boundary: the supervisor does not prove the honesty of a compromised child's response content. Same-user socket permissions protect against other OS users; they do not isolate a host-level `mechanic`.

Negotiate the protocol version and capabilities before work. Reject unsupported methods, oversized frames, invalid attachments, and incompatible versions with explicit errors. Bound subscriber output buffers; a slow observer gets a resynchronization requirement or disconnect rather than stalling the model loop. Validate wire payloads at ingress; TypeScript types alone do not validate a socket peer.

Use execution IDs for controls, submission keys for retries, session IDs for history, and event cursors for observation. A timeout or lost connection has an unknown outcome until queried. None of those identifiers is interchangeable with a transport request ID.

### ACP mapping

Follow the current stable [ACP prompt lifecycle](https://agentclientprotocol.com/protocol/v1/prompt-turn), [session setup](https://agentclientprotocol.com/protocol/v1/session-setup), and [capability negotiation](https://agentclientprotocol.com/protocol/v1/initialization). Implement required content and MCP behavior within the agent's granted authority and advertise optional features only when they work.

| Agent operation | ACP adapter behavior |
|---|---|
| Describe capabilities | `initialize`, with truthful supported capabilities. |
| Create a session | `session/new`; validate cwd and tool configuration. |
| Load history | `session/load`; replay appropriate updates, then return. |
| Resume or close | Use the corresponding capability-gated standard methods where supported. Close cancels execution and releases active session resources; detach only removes the client. |
| Accept and run a prompt | Persist the internal receipt, but keep `session/prompt` pending until the prompt outcome. Returning acceptance as completion would violate the interface. |
| Cancel | Apply `session/cancel` to the calling controller's active execution and complete its original prompt with the resulting stop reason after cancellation settles. |
| Durable retry or receipt lookup | Negotiated Shrimpy extensions when ACP supplies no equivalent. |

A session can have multiple observers. A standard ACP prompt has one initiating controller; unrelated callers' ordinary prompts queue and do not implicitly steer or cancel it. Restrict session-wide cancellation to its authorized scope. For opaque steering text, the Pi adapter must also disable template/command expansion rather than blindly call interactive `steer()`.

Standard ACP request IDs are not durable submission keys. A client that reconnects and repeats a prompt without the negotiated idempotency extension submits new work. Do not deduplicate by prompt text. Use standard methods before extensions, retain their meanings, and keep extensions negotiated through [ACP's extension mechanism](https://agentclientprotocol.com/protocol/v1/extensibility).

ACP v2 remains a [draft](https://agentclientprotocol.com/announcements/acp-v2-draft). Its asynchronous ideas are useful research; first-release correctness cannot depend on unspecified client adoption or a version number alone. Do not fork ACP into a private protocol and call it interoperable.

### Buzz and other chat systems

A native chat adapter supplies verified source-event identity, conversation/thread scope, sender provenance, and a deliberate publisher. It can satisfy the strongest input-deduplication and attention contract. Prove those fields against the service API rather than infer them from message text. One configured identity/conversation has one ingress path; enabling both a native adapter and a harness relay would duplicate inputs.

Stock [Buzz ACP](https://raw.githubusercontent.com/block/buzz/main/crates/buzz-acp/README.md) is a distinct integration profile. Buzz controls relay listening, batching, and harness deadlines, and starts a Shrimpy ACP bridge attached to the existing runtime. The agent uses Buzz's own tools/CLI for deliberate room publication; streaming an assistant answer is not itself a room send. Required credentials and tools must be provisioned at the actual runtime, not merely placed in the bridge's environment.

The [current Buzz implementation](https://raw.githubusercontent.com/block/buzz/main/crates/buzz-acp/src/acp.rs) supplies prompt text without the structured source-event envelope required for Shrimpy's stronger contract, and automatically selects `allow_once` for permission requests. Treat the harness as the authenticated principal; text naming a sender does not grant that sender authority. Stock integration cannot promise per-event deduplication across reconnect or approve expanded sandbox authority. Pin and test a compatible Buzz revision before shipping the integration. These limits do not require routing Buzz through Shrimpy channels.

## Sandbox and supervision

The agent runtime is the unit of filesystem/network containment. Its Pi sessions, direct Node file operations, extensions, Bash tools, and descendants must all remain inside the same enforced boundary. Host-level `mechanic` retains the OS user's authority and is labeled accordingly.

Use [SRT v0.0.75](https://github.com/anthropics/sandbox-runtime/releases/tag/v0.0.75), inspected at commit `40804af269e1616092e9971de12a1f358f58eba9`, as the first backend experiment. Codex's [official sandbox documentation](https://learn.chatgpt.com/docs/sandboxing) supports the Seatbelt/macOS and bubblewrap/Linux family of mechanisms. It does not establish that wrapping an entire Pi runtime already works. The existing [Pi sandbox survey](../../docs/research/pi-sandboxing-implementations.md) and [runtime scout](../../docs/research/sandbox-runtime-scout-2026-08-26.md) remain useful evidence.

### A resident supervisor, not a central agent brain

```text
+--------------------+       +-------------------------------+
| CLI / TUI / ACP    | ----> | PER-AGENT SUPERVISOR          |
| attach and detach  |       | protected host socket         |
+--------------------+       | lifetime lock and instance ID |
                             | launch policy and credentials |
                             | sandbox proxies and cleanup   |
                             +---------------+---------------+
                                             |
                                     framed stdin/stdout
                                             |
                                             v
                             +-------------------------------+
                             | ONE AGENT PROCESS             |
                             | Pi sessions + tools           |
                             | context + watches + jobs      |
                             | agent workspace and store     |
                             +-------------------------------+

mechanic: host authority       shrimpy: enforced sandbox authority
Each agent has its own supervisor and process.
The optional Shrimpy gateway is outside both process lifecycles.
```

SRT's [sandbox manager](https://github.com/anthropics/sandbox-runtime/blob/v0.0.75/src/sandbox/sandbox-manager.ts) keeps configuration, proxies, and credential state in module globals and initializes once. Independent policies cannot safely share that singleton. A per-agent supervisor retains these resources while the runtime runs; an OS service manager may supervise it. This is the concrete reason for the extra process. Measure its idle cost and avoid loading Pi or application policy there.

If the runtime crashes, its supervisor checks cleanup and can restart it with bounded backoff. Repeated crashes stop automatic restart and leave a diagnostic. If the supervisor dies, the child must stop accepting work when its control connection disappears; backend cleanup must also address descendants that do not cooperate. Starting a replacement waits for established ownership release and cleanup, not merely a stale heartbeat.

### Effective access must be demonstrated

```text
SANDBOXED AGENT
    +-- read/write --> own workspace, private HOME and scratch
    +-- read --------> explicit runtime and resource roots
    +-- connect -----> approved model/chat/tool services
    |
    +------ X -------> sibling agent files and gateway storage
    +------ X -------> host configuration and unrelated credentials
    +------ X -------> host tools offered through an unscoped bridge
```

SRT's [filesystem defaults](https://github.com/anthropics/sandbox-runtime/blob/v0.0.75/README.md#filesystem-configuration) allow reads broadly. Shrimpy requires an explicitly restricted read view as well as write restrictions. Its [macOS](https://github.com/anthropics/sandbox-runtime/blob/v0.0.75/src/sandbox/macos-sandbox-utils.ts) and [Linux](https://github.com/anthropics/sandbox-runtime/blob/v0.0.75/src/sandbox/linux-sandbox-utils.ts) implementations handle root denies, exceptions, and special files differently. Do not assume that one broad deny plus path exceptions produces identical privacy on both systems.

The runner resolves real paths and constructs the policy from trusted grants. Test symlinks, changed ancestors, nested read/write exceptions, nonexistent paths, special files, loopback, Unix sockets, and proxy bypass. A missing enforcement dependency or required socket filter is a failed sandbox launch. There is no automatic fallback to host execution. If SRT cannot satisfy the required boundary on a supported platform, select a different backend before calling that platform supported.

Separate filesystem/network containment from resource limits. Bounded queues and concurrency do not create OS-level memory, CPU, disk, or process-count isolation. Report which controls the selected backend actually enforces. Multiple sessions still share one event loop and fatal-error boundary; a blocking extension can affect the whole agent.

### Credentials and host-side tools

Start with explicit per-agent credential grants and a clean environment. A dedicated provider or chat credential supplied to an agent is visible to its code, including tools and extensions. Pipes and environment variables are delivery mechanisms, not secret isolation inside the process. Use provider-side scope and spending limits where available, and describe the actual credential's powers.

Do not inherit the host's whole environment, Pi authentication directory, SSH agent, or browser profile. Current [child environment construction](../../src/app/environment.ts) and [bootstrap](../../src/sessions/bootstrap.ts) require replacement at this seam. If a sandboxed integration requires a broadly privileged host credential, use a deliberately scoped provider connector or leave it disabled. A credential broker would need provider-specific streaming, refresh, cancellation, and error handling; it is not a generic first-release subsystem. It belongs beside the runner/provider adapter, not inside the channel gateway.

Keep three authorities distinct: OS permissions of the agent process; operations a caller may invoke through the agent API; and powers of services acting outside the sandbox on its behalf. ACP filesystem/terminal tools and external MCP servers must respect their own scoped grants. An ACP permission response cannot enlarge OS policy, and a message to `mechanic` is a request for its judgment, not automatic permission to run host code.

### Cancellation and cleanup are different checks

Pi being idle, the Node process being dead, and every descendant being stopped are different facts. [Node documents](https://nodejs.org/api/child_process.html#subprocesskillsignal) that terminating a parent does not necessarily terminate descendants. Linux SRT uses a PID namespace and parent-death behavior; macOS detached-process cleanup needs its own proof. Never claim process-group signaling alone establishes hostile-descendant containment everywhere.

The backend gate must exercise a direct file operation, extension, Bash command, ordinary child, and detached grandchild; then separately cancel the turn, kill the runtime, and kill its supervisor. Verify the resulting process tree and file/network access. If cleanup is uncertain, block replacement ownership and report the affected instance. These are later isolated implementation experiments, not claims established by this document's research.

## One conversation through the boundaries

This sequence assumes a native Buzz adapter with verified event provenance. The stock ACP harness has the narrower guarantees described in [protocol and integration contracts](#protocol-and-integration-contracts). Neither path requires the Shrimpy gateway or a shadow channel.

### One Buzz message, from arrival to reply

The adapter preserves where the message came from. The agent chooses the session and builds context locally. Publishing a room reply is an explicit action during the turn; tool activity and the full transcript remain available through the agent's session interface. This path has no gateway dependency.

```text
TIME      BUZZ + ADAPTER             AGENT RUNTIME          AGENT WORKSPACE
 |              |                         |                       |
 |    receive message                     |                       |
 |              |                         |                       |
 v              |-- message + sender ---->|                       |
                |   + reply destination   |                       |
                |                         | check request         |
                |                         | choose session        |
                |                         |                       |
                |                         |-- load context ------>|
                |                         |<-- local inputs ------|
                |                         |                       |
                |                         | run Pi + tools        |
                |                         |-- append transcript ->|
                |                         |                       |
                |<-- publish this reply --|                       |
    send to original room/thread          |                       |
                |-- delivery result ----->|                       |
                |                         |                       |
                |                         | finish turn           |
                |                         |-- save outcome ------>|
                |                         |                       |

Buzz owns room history. The agent owns its full session transcript.
Only deliberately published content goes back into the Buzz room.
```

## Operations, limits, and inspection

A local installation still needs clear operating behavior. The runtime reports whether it is starting, ready, draining, stopped, or failed. Report connection health and work outcomes separately: a provider can be unavailable while local inspection remains healthy; a process can be alive while its event loop is unresponsive. The supervisor can report process health without pretending to know turn completion.

Every accepted input should answer: where it came from, why it was queued or ignored, which session/execution owns it, which configuration was used, whether it is waiting on a tool or connection, and whether anything was published. Expose that through agent-friendly CLI inspection and structured output. Record state transitions with agent, instance, session, work, and publication identifiers as applicable. Keep model conversation in Pi transcripts; operational logs should not duplicate prompts or expose credentials.

### Bound work before accepting it

The following are initial engineering defaults to validate, not measured capacity claims or new product promises:

| Resource | Initial rule |
|---|---|
| Active execution | One per agent by default; configurable bounded concurrency and fairness between sessions. |
| Pending input | At most 256 items and 16 MiB of serialized queued input per agent, with at most 64 items from one conversation. Reject before acceptance when a limit is reached. |
| Protocol frame | At most 1 MiB; attachments use separately bounded references/transfers, not unbounded inline frames. |
| Live session instances | Open lazily, retain only a configured bounded number, evict only idle instances. Start with four; configured capacity must cover active concurrency. |
| Observer backlog | Bounded per client; overflow requires a snapshot/reconnect. A slow client cannot block execution or grow memory indefinitely. |
| Retry and restart | Finite attempts with backoff and jitter; honor provider throttling. Exhaustion produces visible failed/deferred work rather than another hidden loop. |
| Pending publication | Bound count and bytes separately. If a send cannot be durably recorded, fail before invoking the remote service. |

Tune these defaults using the proof workload below. Large attachment size, artifact retention, tool time/output limits, and retry budgets must be explicit in the effective configuration before an integration is enabled. Keep defaults sensible rather than requiring a user to configure every mechanism. Provider and tool timeouts are independent of local RPC responsiveness.

Do not prune deduplication records ahead of the upstream replay window. Expired cursors produce explicit history-gap/reconciliation behavior. Retention can remove transient observations and rebuildable caches first; it must not silently discard accepted pending work or the last evidence of uncertain delivery. A disk-full error prevents new durable acceptance and surfaces a clear degraded state.

### Backup, upgrades, and shutdown

Support an inspectable backup of one agent's material, operational store, and Pi transcripts. A consistent stopped-owner backup is sufficient initially. A later online backup must use the database's supported mechanism and coordinate transcript state; copying a live SQLite main file alone is not a complete WAL backup. Test restoration into a separate directory with authority grants disabled until deliberately configured.

Version the operational schema and report the runtime/Pi/backend versions. Refuse an incompatible newer store rather than mutate it optimistically. Changing the Pi transcript engine or adopting its newer experimental storage model is separate work from this redesign. There is no implicit import, migration, or deletion of the current live workspace.

An operator stop records that the agent is stopped intentionally so supervision does not immediately restart it. Graceful stop ceases admission, drains or cancels under the chosen policy, settles sessions, and flushes storage. Forced stop reports its process-wide scope and preserves interrupted work. A gateway shutdown or a terminal detach invokes neither operation.

## Implementation sequence and proof

Use a fresh isolated workspace and checkout/output directory. This repository's build and test scripts rewrite the live CLI's `dist/`; the source redesign does not authorize changing production behavior. Each step produces a runnable workflow and deletes the replaced ownership path when its callers move. No step runs old and new writers against the same agent data.

1. **Prove one resident agent.** Establish the launch descriptor, supervisor lifetime, sandbox view, local protocol, minimal durable session catalog/receipts, and one Pi session. Use a direct CLI to prompt, inspect, cancel, detach, and resume. Validate reserved session identity before building chat routing. If whole-process enforcement or cleanup fails, resolve the backend choice here.
2. **Establish the agent's own state.** Add the small SQLite store, explicit resource paths, local context, queue/recovery transitions, and independent sessions. Build the terminal client using the same API. Replace direct foreground session writers and the current environment-wide context discovery for the new workflow.
3. **Make channels an integration.** Move input attention and execution into the resident agent. Give the gateway only its channel ledger and delivery. Replace gateway bootstrap/session construction, channel-keyed `SessionPool` ownership, and `AgentChannelRuntime`; remove them as the whole channel workflow cuts over. Gateway stop/restart must leave the agent's work intact.
4. **Prove independent conversations and autonomy.** Add one external chat profile with declared guarantees; verify it with the gateway stopped. Move watches to local admission and implement simple local Pi jobs with result delivery. Preserve separate backend references for external jobs. Remove gateway watch execution, global worker state, and mandatory shadow-channel routing from moved workflows.
5. **Complete the removal and operating surface.** Move all management commands to their owners. Delete `AppRuntime`, obsolete foreground writer factories, ambient all-agent search, and surface-to-channel coupling once no required caller remains. Rework tests that encoded the old ownership and complete backup/restore, diagnostics, and bounds checks. Review the fresh-workspace result before proposing any existing-workspace transition.

This is a rewrite with coherent cuts, not an invitation to retain compatibility wrappers. Existing files are user data, however: removing old source paths never authorizes deleting or silently upgrading the live workspace. Any production cutover or selected data import is a separately reviewable operation.

### Required evidence

Use fake providers and temporary stores for deterministic contract tests, real Pi integration tests for lifecycle behavior, and OS-level fixtures for sandbox claims. A mock that emits `agent_end` cannot prove cancellation, compaction, or process cleanup. Current [turn-output tests](../../test/session-turn-output.test.ts) and [gateway delivery tests](../../test/channel-delivery-loop.test.ts) need new expectations where they preserve the old ownership.

| Scenario | Pass condition |
|---|---|
| Gateway absent | Local conversation, local watch, and the selected external integration complete without channel files or a gateway process. |
| Two clients, one session | One writer; accepted prompts serialize; disconnect preserves work; a delayed cancellation cannot stop the next execution. |
| Two concurrent sessions | With concurrency configured to two, models, resources, context, publication destinations, and branch operations remain independent. |
| Untrusted room command | A room message beginning with a slash command stays conversation input; it cannot bypass admission through Pi's interactive command dispatcher. |
| Duplicate input | Stable source-key replay returns the original receipt and does not run Pi again. Repeated text with a new key remains new input. |
| Close with a queue | Active and already queued work gets recorded cancellation; nothing restarts until a new eligible input arrives. |
| Full gateway backlog | New publication is rejected before acceptance; previously accepted delivery remains recoverable and the capacity cause is visible. |
| Ambiguous publication | Remote acceptance followed by connection loss yields confirmed or uncertain delivery through service evidence, without a blind duplicate send. |
| Crash gaps | Kill after each receipt/start/transcript/outcome transition. Queued work recovers; possibly executed effects remain interrupted; reserved session IDs survive. |
| Pi lifecycle | Exercise retry, compaction, extension-handled input, steering, and a real tool cancellation. Report the correct outcome only after relevant execution settles. |
| Client tool loss | Disconnect a client providing a tool or permission UI. The operation reports lost capability and never substitutes host authority. |
| Process boundary | Direct Node access, an extension, Bash, children, and detached descendants respect the effective policy. Supervisor death cannot leave an untracked competing writer. |
| Bounded load | Two agents, 100 submitted inputs, one noisy conversation, and one stalled observer remain within configured bounds; other eligible sessions make progress. |
| Restore and modification | Restore a stopped-owner backup in a fresh location; add a chat adapter without editing session rules; replace local search without editing gateway code. |

These are acceptance criteria, not results. This research pass ran no agents, sandbox experiments, builds, or application tests. The architecture is ready for review; the first execution-boundary experiment remains the implementation gate.

### Decisions to revisit only with evidence

The primary remaining risks are narrow: whether SRT satisfies private reads and descendant cleanup on both platforms; the cost and usability of the separate terminal client; the pinned provider/Buzz integrations' actual grants and capabilities; and sensible resource limits under a representative workload. Each has a named proof above. None requires leaving the basic ownership model ambiguous.

Reconsider one-process-per-agent only if measured memory cost or within-agent failure isolation makes it unsuitable. Reconsider the supervisor implementation if a backend can retain scoped connections safely with fewer processes. Reconsider JSON-RPC if a concrete client requirement makes another transport simpler. Reconsider local SQLite if its operating constraints conflict with a real deployment. Until then, build the chosen design rather than adding parallel mechanisms for hypothetical futures.
