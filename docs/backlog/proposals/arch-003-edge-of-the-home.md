---
status: draft
priority: P2
area: Architecture
depends_on:
  - ARCH-002
---

# 🦐 ARCH-003: The Edge of the Home

Shrimpy owns conversations as facts. The world owns conversations as transports.

Multi-agent chat is becoming a commodity pattern. Chat tools are adding agent peers; agent tools are adding chat surfaces; every month there is a new room system that Shrimpy could theoretically live inside. This note fixes Shrimpy's answer to all of them with one rule: a message becomes a fact of the home at exactly one point, and stops being the home's business at exactly one point. Everything outside those two points belongs to someone else's product.

The home does not move into another tool's house, and other tools do not get to run the home's rooms. Between them stands a deliberately thin edge: windows that translate transports into room posts, and clients that drive minds through the turn engine.

This note is about that edge: who may stand at it, how they prove who they are, how agents decide who is worth answering from which transport, what crosses in each direction, and what Shrimpy refuses to own. The kernel, the decision pipeline, leases, permits, and hosts are specified separately (currently ARCH-002). Where this note says "kernel," it means that library of durable facts and decisions. The two drafts reconcile later; neither absorbs the other yet.

## Why

Two pressures are converging on the current design.

**From inside:** the channel JSONL log is load-bearing infrastructure pretending to be a transcript. It is simultaneously the conversation record, an RPC bus for session control, the delivery queue with receipts scattered across cursor files, and the crash ledger for gateway resume. Routing, attention, and control semantics hide inside `gateway/channel-delivery-loop.ts`, `agents/channel-runtime.ts`, and `sessions/pool.ts`. Because the log is doing four jobs, every surface adapter inherits four jobs' worth of vocabulary, and no surface can be thin.

**From outside:** the ecosystem is standardizing how external software drives agents (ACP today, more later), while chat products race to add multi-agent rooms. Each new product tempts Shrimpy toward one of two losing responses: write another bespoke adapter into the treadmill, or conclude that chat infrastructure should be outsourced entirely and let the home dissolve into someone else's room system.

Both responses are wrong for the same reason: they mistake the transport layer for the valuable layer. Transports are commodities with no moat. What only Shrimpy has is the home: persistent identity, attention policy, transactional message-to-turn commitment, leases, watches, wakes, and transcripts that survive crashes. That is the product. The edge must be built to protect it.

A third pressure is quieter but growing: interoperability expectations. When someone runs Hermes or Buzz or any multi-agent orchestrator and hears about Shrimpy, the natural question is "can my stuff talk to your agents?" Today the answer requires an integration project. It should require one command.

## Current State

- `channels/<name>.jsonl` files serve as transcript, RPC bus (`gateway/session-control-runtime.ts` intercepts control messages from the log), delivery queue (`channels/outbox.ts` with per-message receipts on disk), and crash ledger (`runtime/cursors/`, `runtime/watches/`, gateway handled-message marks).
- Surfaces carry real logic. Telegram's bridge, formatter, poller, and outbound modules understand addressing, presence, threads, commands, and delivery semantics. Adding Discord or Buzz means re-earning all of it.
- Identity mapping lives per surface. Persons exist (`state/users.json`) but window user tables and grants accrete around each adapter. There is no verification model: a mapped Telegram user id is trusted fully, and nothing records why.
- Agents have no outbound identity story. Whatever identity the adapter sends with is what the world sees, and attribution lives nowhere as a fact.
- Attention is implicit: membership plus gateway wiring decides who wakes. No agent can state a policy about which senders, sender kinds, or windows deserve responses.
- Remote commands arrive as specially formatted chat messages and are confirmed through the log rather than through a control channel with real replies.
- Reply recovery is a second model call (`sessions/channel-reply-watchdog.ts`) that guesses whether the assistant spoke, because "the agent replied" is inferred from the log instead of recorded as a fact.
- There is no ACP server, so external clients that could drive a Shrimpy mind cannot.

## Thesis

```text
        THE WORLD (commodity)              THE HOME (product)
  Telegram  Discord  Buzz  Hermes  ACP   ┌──────────────────────────┐
     \        |        |      |      /    │          KERNEL          │
      \       |        |      |     /     │                          │
       ┌──────┴────────┴──────┴────┐      │  identity   rooms        │
       │  WINDOWS: translate       │─────▶│  messages   attention    │
       │  a transport into posts   │ ingress │ turns      wakes    │
       └───────────────────────────┘      │  leases     delivery    │
                                          │  intent                  │
       ┌───────────────────────────┐      │                          │
       │  CLIENTS: drive a mind    │─────▶│  turn engine             │
       │  through the turn engine  │      │  (Pi underneath)         │
       └───────────────────────────┘ egress└──────────────────────────┘
```

One seam, crossed in exactly two ways:

- **Ingress:** a window authenticates a transport actor and offers a post to `kernel.post`. From commit onward, the message is a fact of the home: envelope stamped by the kernel, attention evaluated by the kernel, turns queued in the same transaction. The window has no further role.
- **Egress:** the kernel commits delivery intent for a post bound to a window. From commit onward, delivering it is mechanical: the attendant's delivery loop hands the row to the window adapter, which formats and sends under the authoring agent's transport identity, records an idempotent receipt, and retries on failure. The window never decides whether something should be delivered.

Everything before the ingress commit is the world's problem. Everything after the egress commit is the world's problem. Everything between the two is the home, and nothing outside the home may write to it except through `kernel.post`.

## Actors: who can stand at the edge

Everything the edge does begins with naming the actor on the other side. The kernel recognizes five classes:

| Class | What it is | Examples |
|---|---|---|
| **Person** | A human the household knows by name | Zach, a family member |
| **Household agent** | An agent that lives in this home | Shrimpy, Mechanic, a companion |
| **Foreign agent** | An agent whose mind lives elsewhere | A Hermes bot in a shared Buzz room |
| **Service** | A non-person, non-agent author the home itself created | `watch/<owner>/<id>`, `job/<id>` |
| **Fallback** | An unmapped transport sender | A random Telegram account |

Classes matter because every downstream decision — authorize, attend, context assembly, delivery — should be able to reason about *what kind of thing* is talking without re-parsing display names or provenance.

### Inbound authentication

Each window declares, per mapped sender, how strongly that identity was verified. Three verification classes:

| Verification | Meaning | Examples |
|---|---|---|
| `cryptographic` | Proof travels with the event | Nostr key signatures (Buzz) |
| `platform` | The transport's operator vouches for the account id | Telegram/Discord user ids over authenticated bot APIs |
| `asserted` | The sender claims an identity; nothing checks it | Unauthenticated web console, self-named connections |

Rules:

- A person binds transport identities explicitly: `shrimpy person bind <person> --window telegram --user <id>`. Bindings record person id, window id, transport user id, verification class, and when the binding was made. There is no silent first-contact promotion: an unmapped sender never becomes a person without an explicit operator action.
- Unmapped senders author as fallback ids shaped like `window/<window>/unknown/<transport-user>`, with no grants. Fallback authors can exist in rooms (a public porch room may allow them), but attention defaults treat them as strangers and authorize treats them as nobody.
- The window cannot claim a stronger verification class than its transport supports. A self-claimed name over an unauthenticated socket is `asserted`, whatever the config wishes.
- Verification strength is a fact that rides the envelope. Downstream consumers — attention rules, prompt assembly, inspection commands — see it and decide what it is worth. The kernel does not score trust; it records it honestly.
- Spoofing reality check: `platform` verification is strong against outsiders and weak against the platform itself. `cryptographic` survives both. The docs say this plainly instead of pretending all mapped senders are equal.

### Outbound authentication: agent identities on transports

When a household agent speaks through a window, the transport sees an identity. That identity must be honest and deliberate:

- **Agents get their own identities.** Wherever a transport supports distinct identities, each household agent gets its own: its own Nostr keypair on Buzz, its own Telegram bot or clearly distinguishable sender where bots are the mechanism. An agent never borrows the owner's identity, never inherits a person's account, and never lets another agent speak under its name.
- **Credentials live in windows, not in the kernel.** Transport credentials are window configuration files. The kernel stores only opaque references ("this agent's Buzz identity") alongside envelope authorship facts. Contained sessions can never reach credential files because permits exclude them, and the turn engine never needs them — formatting and signing happen in the window adapter at egress time.
- **Where a transport forces a single identity** (one bot token, one relay membership), the window renders attribution honestly — the equivalent of "via \<agent>" — and the home never relies on transport display names as truth. The durable record of who said what is the envelope's kernel-stamped author, always.
- **Key lifecycle is a CLI concern.** Generation, rotation, and revocation happen through inspectable commands (`shrimpy agent rotate-key <id> --window buzz`), not by hand-editing config. Rotation takes effect at next egress; in-flight outbox rows deliver under whichever identity is configured when their turn comes, and receipts record what was used.

Foreign agents entering home rooms get real actor ids too (`foreign/<origin>/<name>`), minted at first ingress and stable thereafter, so conversation history stays attributable across sessions. They authenticate however their window verified them — typically `cryptographic` on Buzz, `platform` nowhere yet, because no major chat platform has native agent accounts. A foreign agent claiming to be someone specific without cryptographic backing is just a fallback with a confident display name, and the envelope says so.

## Rooms face windows; agents do not

A rule that resolves half the cross-transport questions before they form:

**Presence belongs to rooms, not to agents.** A room may be bound to a window. An agent never is.

Consequences, each of which would otherwise be a special case:

- Asking "is Shrimpy on Telegram?" is malformed. Asking "which rooms face Telegram, and is Shrimpy in them?" is well-formed and answerable from config.
- A person reaches an agent through any window they are verified on, because what they actually reach is a room bound to that window that the agent attends. New transport, new binding, no per-agent setup.
- An agent cannot "be reachable" anywhere its rooms are not. There is no ambient presence to secure, impersonate, or lose.
- Removing a window binding changes where conversations surface; it changes nothing about who the agents are.

## Response policy: three layers

"How does an agent decide whether and how to answer someone from another transport?" is really three questions wearing one coat. Separating them puts each answer in the layer that owns it:

```text
Layer 1  REACHABILITY   Which rooms face which windows?        (operator, config)
Layer 2  AUTHORITY      May this actor post/read this room?    (kernel grants)
Layer 3  ATTENTION      Does this agent spend a turn on it?    (agent policy)
         STYLE          How does the agent sound?              (soul + context, not kernel)
```

### Layer 1: reachability

Window bindings are operator decisions made once and inherited by everyone: this room faces Telegram, that DM faces the web console. Agents inherit reachability from their rooms. This layer answers "could the stimulus even arrive?"

### Layer 2: authority

Grants are coarse and kernel-owned: may this actor class, or this specific actor, post into this room, read it, open DMs with its members? Defaults stay open for persons and closed for everything else, matching the household's current posture. This layer answers "was the message even accepted?"

### Layer 3: attention

Attention is the agent's own policy about spending a turn, and it is where cross-transport discrimination actually lives. The attend function evaluates an ordered list of clauses over the stimulus — first match wins, and the matching clause is recorded so `explain-attend` can quote it:

```text
# shrimpy agent policy (per agent, ordered)
attend:
  - accept: author = person zach                 # the owner, anywhere
  - ignore: author-class = fallback              # strangers never wake me
  - mentions-only: author-class = foreign-agent  # outside minds speak when named
  - ignore: window = telegram, hour >= 22        # quiet hours (if clocks land here)
  - accept: default                              # addressed-or-mentioned baseline
```

Clause vocabulary, deliberately small:

- **Matchers:** author id, author class, room id or charter kind, window id, envelope flags (`to`, mention).
- **Actions:** `accept` (queue a turn), `ignore` (record why, queue nothing), `mentions-only`, `addressed-only`.
- **Defaults:** an agent with no policy gets the shipped baseline — accept persons and household members, addressed-only for services, mentions-only for foreign agents and fallbacks.

The evaluation is pure: `(policy, envelope, body, room, window) → accept | ignore + reason`. It runs inside the kernel's attend step, it is testable as a table of cases, and every decision lands in inspection with the clause that fired. ARCH-002's fixed ordering (self-author, replay, `to` filtering, mode ladder) becomes the shape of the default clause list rather than hard-coded behavior — same semantics, now visible and editable per agent.

Dynamic rooms are the vocabulary's first real test. Consumers create rooms at runtime — scene rooms, project rooms, event spaces — and static policy files cannot name those ids. Matchers therefore lean on kinds and roles (`charter-kind = scene`, `author = <stable actor>`), which stay valid across room churn; raw room ids remain for genuinely stable rooms like DMs and standing household spaces. A policy that cannot be written without naming an ephemeral room id is a signal the matcher vocabulary is missing a noun — fix the vocabulary, never improvise sender-string matching.

What this design refuses: attention policy that names transports *instead of* rooms and windows. Windows come and go; policies reference the stable nouns. And attention clauses can never grant authority — ignoring a stranger is not permission to read, and accepting the owner is not license to widen a permit. Layers compose downward only.

### Style: the layer that is not machinery

How an agent *sounds* with a person versus a foreign agent versus the owner — formality, length, language, whether to use markdown — is soul and context territory. The edge's only job is to make sure turn context states the facts plainly: who authored the stimulus (class and id), where it came from (room, window, verification). Given those facts, the model decides tone. No kernel code branches on "how formal should this be." If an agent embarrasses itself on a transport, you fix its soul, not its adapter.

## A worked crossing

A concrete pass through the whole edge, using the scenario that prompted this note: a Hermes agent and a Shrimpy agent share a Buzz room.

1. **Standing invitation.** The operator binds one home room to Buzz and gives the Shrimpy agent's Nostr identity membership there. The Hermes agent is already a member on the Buzz side.
2. **Ingress.** Hermes posts. `buzz-acp` delivers a signed event; the window verifies the signature (`cryptographic`), matches the pubkey to the stable `foreign/hermes/reviewer` actor id, and calls `kernel.post` with the body, the idempotency key (event id), and the verified actor.
3. **Commit and attend.** One transaction stamps the envelope, inserts the message, and runs the Shrimpy agent's attention policy: author class `foreign-agent`, no `to` mention, body doesn't name it — `mentions-only` clause fires, recorded as ignored. Had Hermes written "@shrimpy review this," the accept clause queues a turn in the same transaction.
4. **Turn.** The attendant claims the turn under a lease, admits the session permit, runs the turn engine. Context assembly tells the model plainly: a foreign agent with cryptographic verification asked you something in a shared room. The soul decides how to sound.
5. **Egress.** The final text goes to `completeTurn`, which commits the reply, writes delivery intent (the room faces a window), and releases the claim. The delivery loop hands the row to the Buzz window, which signs with the Shrimpy agent's own key, sends, and records the receipt. Retries on relay failure change nothing about the fact that the agent spoke.

Every step is either a kernel fact, an agent decision, or window mechanics. Nothing in between is improvised. And if the question were instead "can my Hermes orchestrator delegate to a Shrimpy mind?" the answer is the client path: `shrimpy acp --agent <id>`, their tool keeps the UX and the conversation log, Shrimpy keeps the transcript and every boundary from SURFACE-010. Same edge, other crossing, no new machinery.

## Turn context: how edge facts reach the model

Everything above decides *whether* an agent runs. This section fixes *what the agent is told* when it does, because several promises made earlier — style follows actor facts, silence is explainable, strangers are treated as strangers — are only real if those facts actually arrive in the prompt.

### One assembler

A single pure function builds every turn's context, for every host:

```text
assemble(sessionKey, turnRequest, kernelFacts, homeFiles) → TurnContext
```

Same inputs, same bytes out. Terminal, attendant, workers, clients, and tests all call it; none of them prepend, append, or decorate. Because it is pure, `shrimpy context preview <agent>` renders exactly what the next model call would see — what you inspect is what the model gets. The assembler itself lives with the turn engine (ARCH-002 territory); this note owns only the parts the edge contributes.

### The stimulus block

For any stimulus-originated turn, assembly includes a structured block stating, plainly:

- **Who authored it:** actor id and class — `person zach`, `foreign-agent hermes/reviewer`, `fallback`.
- **How strongly verified:** `cryptographic`, `platform`, or `asserted`, verbatim from the envelope.
- **Where it happened:** room id, charter kind, which window if the room is bound.
- **Addressing facts:** whether the agent appeared in `to`, whether it was mentioned, whether this is backlog replay.
- **For wakes:** the owner's note, unedited.

This block is the entire contract between the edge and the model's picture of the world. The style rules under "Response policy" work only because these facts are present: an agent can be warm with a cryptographically verified person and guarded with an asserted stranger because the difference sits in the prompt, not in hidden adapter behavior.

Three rules govern the block:

1. **Facts, not interpretations.** It says `verification: asserted`. It does not say "be careful." Deciding what a fact means is the soul's job.
2. **No raw transport payloads.** Formatting artifacts, embed data, platform metadata, and message HTML stay behind. If a window thinks the model needs something, it becomes a body fact first.
3. **Auditable by default.** The block renders identically in `context preview`, so before loosening an attention clause a user can read exactly what their agent was last told about the sender it ignored.

### Recent conversations

Two cases that must never blur:

- **This room:** a bounded authorized read of room history from the kernel store — roughly, messages since the agent's last completed turn in that room. Exact, cheap, and grant-checked by construction, because the read goes through the same authorization as everything else.
- **Everywhere else:** pointers only. Counts and room names ("2 addressed to you in `household`"), never content. Reading across rooms requires a comms grant and happens through `rooms read` during the turn. Ambient cross-room leakage — an agent absorbing conversations it was never granted — is a bug class this design refuses to ship.

### Producers

Some context is computed rather than stored. A **producer** is a CLI command the assembler may run per turn:

- **stdin** receives the stimulus-block facts plus a compact request.
- **stdout** returns bounded structured output, included as trail items.
- **Non-zero exit** means omit the items — never fail the turn.

Worked example: a household adds a `finance` mind that should see high-level account states. Nobody wires banking into the prompt path. Instead:

1. A watch refreshes a snapshot file hourly (fetch once, write once).
2. The producer renders that snapshot into compact facts and stamps their age:

   ```text
   Accounts (as of 2h ago · run `finance detail` for live numbers):
     net $41,203 (+$312 today) · checking $4,110 · cards $1,890 (due Aug 25)
   ```

3. Assembly preloads those ~200 bytes each turn because they are small, high-value-every-turn, and cheap to render. Raw transaction logs earn no such status; they are a pointer the agent pulls when a turn actually needs them.

Two properties matter more than the example:

- **Staleness must be honest.** Derived snapshots say how old they are or stay silent. Presenting two-hour-old balances as current is exactly the kind of lie this architecture refuses. Snapshot files are derived caches: rebuildable by rerunning the watch, safe to delete, never kernel truth.
- **Authority flows through permits, not proximity.** The producer may touch account credentials because the finance agent's ceiling permits those roots and that command, enforced by the runner. Another agent runs the same command only under its own grants. Being configured near money grants nothing.

Because producers receive actor facts on stdin, their output may legitimately vary by audience — full numbers for the owner, a polite deferral in someone else's DM. That variance lives in the producer's code, reviewable and visible in `context preview`. Policy stays in inspectable code, not in model vibes.

### Rationing

Always-loaded context is spent deliberately: standing instructions, skill trails, the stimulus block, this-room history, and small preloaded producer output. Everything else earns its place as a pointer the agent pulls mid-turn. The test for preload status: small, high-value nearly every turn, cheap to render. Anything failing the test becomes a trail with an inspect path.

## Inspection and search

Reading home data back is a view concern, governed by three rules:

- **Room history is queried,** from the kernel store (`rooms read`). Search over rooms is a database query, not a log scan — the one surface that gets faster when the JSONL bus dies.
- **Authored files are searched as files.** Souls, skills, notes, and workspace documents stay on disk; search reads them directly.
- **Pi transcripts are readable but never load-bearing.** Shrimpy may read them through a thin, read-only, format-tolerant adapter for human-facing search and rendering (`sessions search`). It never writes them, and no runtime decision may ever consult them. Reads-for-humans yes, reads-for-behavior no, writes never.

Search indexes over any of these — FTS today, embeddings later — are rebuildable caches: recreated by `shrimpy search reindex`, safe to delete at any time, living outside the transactional core. An index is a view with a rebuild rule, nothing more.

## The thinness contract

A window may:

- Map a transport user to a person at ingress, using the shared people records and its declared verification class. Unmapped senders author as fallback ids with no grants.
- Hold its own transport credentials and sign outbound sends with the authoring agent's configured identity.
- Translate body content into its transport's formatting on the way out, within the transport's limits.
- Present remote commands to the owner, routed to the control port of the host that holds the relevant lease.
- Manage transport-specific ephemera locally: typing indicators, read receipts, poll cursors, edit tracking.
- Keep whatever local state its transport requires as rebuildable caches, never as truth.

A window may not:

- Decide who wakes. Attention is kernel policy over the envelope, never adapter behavior.
- Hold tools, run sessions, or touch Pi.
- Mint or widen authority. Command access is a person grant, not a window feature.
- Introduce a per-window account system that drifts from persons.
- Write to rooms except through `kernel.post`.
- Own delivery policy. It sends what the outbox committed, with idempotent receipts.
- Claim a verification class its transport cannot support.
- Persist anything the home would miss if the window were deleted tonight.

### Clients

A client drives a selected agent's mind through the turn engine, with agent selection fixed for the process lifetime. It may keep its own conversation record; the home keeps the transcript of the work done. Client input cannot supply soul text, tool lists, MCP servers, working directories, or model policy that expand the agent's ceiling.

Client authentication follows process ownership: a local stdio client is trusted because the operator launched it, and its identity is recorded in inspection metadata as `client/<launcher>`. A networked client listener requires explicit operator configuration plus a token, and ships disabled. There is no third tier.

The foreign-orchestrator case deserves its own sentence of policy: when a Hermes or Buzz harness spawns a Shrimpy agent via ACP, that agent is a rented mind, not a resident. Its soul, skills, permits, and memory travel with it; its attention policy, watches, rooms, and household do not apply. Watches fire in homes, not in subprocesses.

One classification note: when one *household* agent borrows another's mind through an ephemeral session — an oracle-style tool call — nothing crosses the home's boundary, so it is not a client or a window under this note. That pattern is internal composition through the turn engine and jobs machinery (ARCH-002). The window/client taxonomy governs the edge only.

## Idempotency at both edges

Crashes at the edge must not double-post or double-send.

- **Ingress:** each accepted transport event carries an idempotency key (transport event id, normalized per window). The kernel rejects a duplicate key in the same transaction that would have inserted the message. A retried webhook or republished event is a no-op, not a duplicate conversation entry.
- **Egress:** every outbox row has a deterministic id derived from the message it delivers. A window send records a receipt keyed by that id, including which identity sent it. Restarting the attendant replays only rows without receipts; sending twice is prevented by the receipt, not by hope.

Delivery failures are visible states (`failed`, `retrying`), inspectable by CLI, never silent drops.

## Transport event semantics

Real transports are messier than "post." The home takes a position on each:

- **Posts are the only ingress event that matters.** Edits, deletes, reactions, and typing are transport-local phenomena. The home transcript is append-only truth: what was said, was said. A window may mirror edits and deletions locally for display hygiene; the home record does not rewrite history. Reactions could become tiny posts someday if a household wants them as conversation; until then they are ephemera.
- **Threads map to rooms or flatten — pick one per integration, explicitly.** Where a transport's threading is load-bearing (Discord), a thread may bind to its own room. Otherwise thread structure flattens into the room with pointer metadata preserved as view decoration. What never happens is the kernel learning a second nesting concept.
- **Media crosses as files both ways.** Inbound attachments land in `media/` with size caps and type sniffing, referenced from the message row. Outbound bodies referencing media are rendered by the window into whatever the transport accepts; conversion failures are delivery failures with reasons.
- **Backfill and joins are window problems with kernel answers.** When a person or agent newly appears in a bound room, the room's history is available through authorized reads; windows render whatever amount suits their transport. The home never curates a special "catch-up feed"; `rooms read` already is one.
- **Presence is ephemera.** Online/idle/typing signals stay inside adapters and never become kernel rows. If an agent's watch genuinely needs "did anything happen in the room," it polls reads like any other query.

## Flood control and loops

An open edge plus autonomous agents is a loop waiting to happen. Guards, cheapest first:

- **Attend ignores self-authored messages**, always, as the first clause of every policy including defaults. An agent replying into a room cannot wake itself.
- **Service authors wake only by explicit opt-in** (ARCH-002's loop guard): watch and job messages reach an agent only through `to`, mention, or a named-sender accept clause.
- **Foreign agents default to mentions-only**, so two chatty outside bots cannot farm turns from each other through a shared room unnoticed.
- **Ingress rate caps** sit at the chokepoint per fallback author and per window: bounded events per minute, excess rejected loudly and counted, not silently dropped. Caps protect the store, not policy; they are config, not attention.
- **Delivery budgets** cap outbound sends per room per window per hour as circuit breakers. A misbehaving agent that floods a relay trips the breaker, deliveries park as `held`, and inspection shows why. Breakers are safety equipment, not features; defaults generous, overrides explicit.

No global "message bus governor" subsystem. Four small guards at points that already exist.

## What a window outage looks like

A stopped window is a stopped pair of eyes, not a damaged home.

- Ingress: messages that would have arrived do not exist. Nothing is lost, because nothing was committed.
- Egress: outbound posts accumulate as pending outbox rows. When the window returns, they deliver in order, once. A window down for a day must not cause a day of duplicated greetings.
- Credentials rotting mid-outage (rotated token, expired key) surfaces as failed deliveries with reasons, retrying on fix, never as lost rows.
- No home behavior depends on any window being alive. Terminal chat, direct runs, watches, jobs, and agent-to-agent posts work with zero windows configured.

## Why the home does not move into someone else's house

When a chat product adds agent peers, its rooms are its product. Joining as a peer means accepting its identity model, its history retention, its notification semantics, and its moderation rules as the substrate for Shrimpy agents. Four things die immediately:

1. **Atomicity.** Accepting a stimulus and queuing a turn is one transaction in the kernel store. In someone else's room system it is two systems agreeing over an API, forever.
2. **Attention.** Whether an agent spends a turn on a stimulus is household policy. A foreign room system decides visibility and notification for you.
3. **Memory.** Room history is the home's lived memory, queryable alongside sessions, watches, and job reports. Exported copies are views, not truth (see ARCH-002).
4. **Independence.** The terminal must work with every external service stopped. Rooms that live behind someone else's API make the home unusable exactly when the network is least reliable.

Conversely, hosting foreign agents *inside* home rooms is fine — as actors. An external agent enters through a window like anyone else, gets a real actor identity, and is subject to the same authorize-and-attend pipeline. It brings a mind, not a substrate.

## The protocol preference ladder

When connecting any external chat product, choose the thinnest option that works:

1. **Speak a standard protocol.** If the product can drive agents over an open protocol such as ACP, prefer that: Shrimpy exposes a mind (`surface-010`), the product keeps its own UX, and no adapter code is written at all. This is the answer for every "tool X has multi-agent chat now" headline.
2. **Write a dumb vertical translator.** If only a private transport exists (Telegram, Discord), write the smallest bridge that maps transport events to `kernel.post` and outbox rows to signed sends. One directory per transport, no shared framework.
3. **Never build the third thing:** a transport-neutral bridge layer, plugin system, or surface SDK. Shared code across windows is limited to person mapping and remote-command plumbing. If two translators seem to want a common abstraction, wait until there are three, then extract only what is genuinely identical.

The ladder is ordered by how much Shrimpy-specific code the option requires, ascending. Prefer becoming a server over writing clients; prefer translating over integrating; prefer deleting a window over maintaining it.

On the far side of the ladder sits a standing bet: ACP is winning the client direction (editors, orchestrators, chat harnesses), and nothing equivalent has consolidated for the window direction (rooms rendered onto transports). If a standard emerges for the window side — federated rooms, an open group-chat protocol — it should displace translators wholesale, and this note's shapes are drawn so that displacement deletes adapters instead of rewriting them. Until then, translators stay dumb and few on purpose.

## UX Implications

- Every external chat product connects in one of two shapes, and users can tell which: either their tool launches a Shrimpy mind (client), or Shrimpy mirrors conversations into home rooms (window). Mixed or ambiguous integrations fail review.
- New chat tools cost almost nothing to support when they speak a standard protocol. Support for a new private transport is one small translator directory, and its removal deletes nothing durable.
- Person setup is explicit and inspectable: `shrimpy person list`, `bind`, `unbind`. A user can always answer "who can reach my agents, from where, and how strongly verified."
- Agent transport identities are visible facts: `shrimpy agent show <id>` includes which windows carry which identities, with rotation commands beside them. Nothing signs as the owner unless the owner says so.
- Every agent has an attention policy file, and `shrimpy explain-attend <agent>` quotes the clause that fired or the default that applied, for any recent stimulus. Silence from an agent is always explainable in one command.
- Messages sent to an agent while the gateway (attendant) is down still appear and get answered once it returns, without duplicates after restart.
- A blocked or unknown sender is unmapped, not silently powerful: fallback authors have no grants, rate caps count their attempts, and denials are explainable.
- `/new`, `/clear`, and similar remote commands confirm through the owning host's control port and leave a boundary marker in the room, not a control/ack pair in the transcript.
- External clients see honest capability advertisements: nothing appears supported unless Shrimpy enforces it end to end.
- Deleting a window configuration removes no history. Rooms, agents, bindings, and pending work are untouched; pending deliveries to that window park as held with reasons.
- `rooms read` shows speech, media, and markers — never transport plumbing, receipts, or control frames. Transport-flavored decorations (threads, reactions) are view-level when present at all.
- `shrimpy context preview` shows the stimulus block for any recent turn: who sent it, how verified, where from. Before loosening an attention policy, a user can read exactly what their agent was told about the sender it ignored.
- Producer behavior is inspectable before it is trusted: a producer's output for a given turn appears in `context preview`, including its staleness stamps and any audience-dependent variation.

### Regressions to avoid

- Any code path where a surface adapter decides attention, routing, tools, or authority.
- Per-window user tables diverging from persons, or verification classes claimed beyond what a transport supports.
- Duplicate inbound messages or duplicate outbound sends after process restarts.
- Window or client input replacing soul, tools, workspace roots, or model policy.
- Control/ack pairs or delivery receipts appearing in room transcripts.
- A new "shared surface framework" emerging from refactoring two translators.
- Home behavior that breaks when a given window or external service is unavailable.
- Protocol objects (ACP frames, transport payloads) copied into durable schemas.
- An agent speaking under a person's identity, or two agents sharing one transport identity without honest attribution.
- History rewritten because a transport edited or deleted its copy of a message.
- Attention policies that grow transport-specific branches instead of room/window references.
- Rate caps or breakers that silently discard accepted work instead of parking it with reasons.

## Build

Each slice deletes the path it replaces. Do not land a parallel edge.

1. **Edge contracts.** Host-independent types for actors (with class and verification), envelopes, bodies, delivery intent, receipts, and idempotency keys. No type named after a transport. These should merge cleanly with the kernel contracts from ARCH-002 during reconciliation.
2. **People and bindings.** Person records with transport bindings and verification classes, plus `shrimpy person` commands. Replace `state/users.json` and per-surface identity tables; delete the paths this replaces.
3. **Ingress chokepoint.** Route all surface ingress through `kernel.post` with actor resolution, verification stamps, and idempotency keys. Delete provenance-based behavior inference from adapters.
4. **Agent transport identities.** Identity records per agent per window, CLI generation and rotation, honest attribution rendering where transports force single identities. Buzz's keypair flow is the first cryptographic instance; Telegram attribution the first single-identity one.
5. **Attention policy.** The ordered-clause format, the shipped default, evaluation inside attend, and `shrimpy explain-attend`. Port ARCH-002's mode ladder into default clauses; delete the hard-coded version.
6. **Stimulus block and producers.** Define the stimulus-block schema and the producer CLI contract (actor facts on stdin, bounded stdout on success, omit-on-error), wire both into the shared assembler, and make `context preview` render the block for any recent turn. Delete ad-hoc prompt-prefix and log-stuffing paths this replaces.
7. **Egress chokepoint.** Delivery intent committed by kernel operations only; the delivery loop consumes committed rows; receipts keyed deterministically and recording the sending identity. Delete outbox logic from the bus.
8. **Thin-ify existing surfaces.** Reduce Telegram to translation, person mapping, and command plumbing. Move its remaining judgment calls into the envelope or delete them.
9. **Control port commands.** Remote `/new`, `/clear`, `/stop` ride the lease-holding host's control port. Delete RPC-over-chat-log (`session-control-runtime`) once nothing uses it.
10. **ACP server.** Land `shrimpy acp --agent <id>` per SURFACE-010 as the first class-one connection and the template for future protocol integrations.
11. **Guards.** Ingress rate caps and delivery breakers with parked-state visibility. Watch the live workspace first; add only what observed behavior demands.
12. **Delete the watchdog.** With speech policy living in `completeTurn` (ARCH-002 build step 7), remove reply-recovery guessing entirely.
13. **Reconcile.** Fold this note's contracts into whichever kernel draft won, and prune the surface backlog items that the ladder made unnecessary.

Exact CLI spelling follows the nouns. Every feature remains a `shrimpy <command>` path.

## Boundaries

- The kernel store is the only writable record of rooms and messages. Exports, logs, and dumps are views. The transcript is append-only; transport-side edits and deletes do not propagate backward.
- Windows translate; clients drive minds. Neither runs sessions, chooses attention, holds tools, mints authority, or stores home truth.
- No transport-neutral surface framework, plugin API, or surface SDK.
- No per-window account systems. Persons are configured once and inherited by windows.
- No protocol wire objects in durable schemas.
- No network-exposed surfaces or client listeners without explicit operator configuration; the default edge is local.
- Foreign agents enter home rooms as ordinary actors through ingress. They never embed their runtime into a host process, and their minds stay theirs.
- Household agents keep transport identities separate from every person's identity, with credentials held only by window adapters.
- Shrimpy never joins a foreign room system as a peer substrate for household agents, and never accepts a foreign room system's identity model as authoritative for household actors.
- Attention clauses reference actors, rooms, and windows — never transport brands — and can never widen grants or permits.
- No runtime decision reads Pi transcripts, search indexes, or producer caches. They exist for inspection, retrieval, and rendering only.
- Producers receive turn facts through one declared channel (stdin) and return bounded output. No producer runs with ambient authority; its powers are the invoking agent's permits, enforced by the runner.
- Cross-room context is pointers unless a comms grant says otherwise. No agent absorbs conversations by proximity.
- Foreign stimuli are facts until a household agent acts on them. Acting on outside-delivered content is a permit-and-runner question owned by the containment spec (ARCH-002, SECURITY-006); contained runners land before household agents routinely execute window-delivered content.
- No feature ships whose name implies OS containment while it enforces tool narrowing. Narrowing is narrowing; containment is a process boundary; inspection distinguishes them.
- Derived context that carries a timestamp must show it or omit itself. Stale facts never masquerade as current ones.
- Do not add backward compatibility or migration paths for replaced surface internals; replace, then delete.

## Open decisions

- Whether the owner-local web console is a window (rooms rendered locally) or a client (drives a mind). Leaning window for shared rooms and client for focused chat; decide when SURFACE-007 revives.
- How much of the envelope a window may propose versus the kernel normalizing from the charter.
- Whether transport-scoped fallback ids can be promoted to persons via a CLI flow without becoming a per-window registration system.
- Whether time-based attention clauses (quiet hours) belong in the policy vocabulary at launch or wait for demonstrated need; clocks in decision functions add testing weight.
- Whether reactions ever become first-class body types or stay ephemera forever.
- Thread-to-room binding for Discord-style transports: real feature or permanent flattening?
- Which protocol, if any, becomes the long-term window-side standard (as ACP is for the client side), and whether Shrimpy should help push one rather than keep writing translators.
- Credential custody detail: whether window-held transport keys belong in plain window config, the workspace vault, or OS keychains, and whether rotation should coordinate across hosts running the same window.
- Retention for egress receipts, ingress idempotency keys, and rate-cap counters: how long a row must survive to make restart-deduplication trustworthy.
- Delivery breaker defaults: thresholds, scope (per room per window versus per window), and whether tripped breakers notify the owner through a channel other than the throttled one.
- Foreign agent identity minting: whether `foreign/*` actor ids persist forever for auditability or expire after quiet periods, and whether operators can pre-approve known foreign pubkeys for smoother admission.
- Whether the shipped default attention policy should lean stricter (addressed-only for everyone but the owner) as households grow past a handful of members.
- Whether any producers ship built-in (time, session status) or every producer stays a user-authored CLI command with only the contract built in.
- How large the always-preloaded this-room history slice may be before it becomes a pointer, and whether that bound is per-room config or global default.

## Done

- Every external integration is classifiable in one sentence as a window or a client, and both classes pass through the two chokepoints.
- Killing and restarting the attendant during ingress and egress causes no duplicate messages in either direction.
- All surfaces combined contain no attention logic, no tool access, no session execution, and no account tables disjoint from persons.
- Actor resolution covers all five classes with recorded verification, and `explain-attend` quotes the deciding clause for any stimulus, including ignored ones.
- At least one agent holds a transport identity distinct from every person's, rotates it via CLI, and signs outbound sends with honest attribution under a single-identity transport.
- At least one standard-protocol client drives a Shrimpy mind end to end (ACP), with capabilities advertised only where enforced.
- A window can be removed from config and deleted from disk with zero loss of home data, verified by test.
- `rooms read` output contains no control frames, receipts, or transport metadata, and no test finds transport-side edits mutating home history.
- `context preview` reproduces any recorded turn's context, including the full stimulus block, from its recorded inputs. A user can audit what the model was told about any sender.
- A producer that exits non-zero omits its items without failing the turn; a producer cache that is deleted rebuilds by rerunning its watch; stale snapshots render with their age or not at all.
- Transcript and workspace search work after deleting every search index; no test finds a runtime decision path reading an index or a transcript.
- Rate caps and breakers park work visibly rather than dropping it, verified by fault injection.
- No module named after a transport exists outside its own translator directory.
- Tests inject crashes at both chokepoints and verify idempotency keys and receipts hold.

## Notes

This note deliberately overlaps ARCH-002 on contracts (envelopes, delivery, idempotency) and depends on its kernel for the pipeline it names. It is written as a separate draft because the question it answers — where the home ends, and who may stand at the boundary — is a product decision, not an implementation detail of the kernel design, and it deserves to survive reconciliation even if the kernel's internals shift.

A framing check for every future change to this edge: the home serves unknown consumers, and the strange ones are the honest test. Judge each addition by whether it makes the next unforeseen project free, not by whether it serves a known integration more conveniently. Special-casing a known consumer here is how thin edges become frameworks.

The ladder and the protocol bet are the parts most likely to need revisiting as standards mature. Revisit the ladder when a second real protocol client exists, and the bet when anything resembling a window-side standard actually consolidates. Neither revisit should touch the actor model, the three response layers, or the chokepoints; those are the load-bearing walls.
