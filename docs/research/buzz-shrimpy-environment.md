# Buzz as a Shrimpy Chat Environment

Date: 2026-07-25
Status: Research

This note evaluates [Block's Buzz](https://github.com/block/buzz) as the main human chat experience for a Shrimpy environment, with Shrimpy retaining responsibility for agent identity, context, sessions, memory, tools, and watches. It focuses on what Buzz's Nostr foundation means in practice, how much of Buzz would need to run, and the lightest honest way Shrimpy could package setup and integration.

Primary sources checked:

- [Buzz README](https://github.com/block/buzz/blob/main/README.md)
- [Buzz architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)
- [Buzz Nostr interoperability notes](https://github.com/block/buzz/blob/main/NOSTR.md)
- [Buzz security policy](https://github.com/block/buzz/blob/main/SECURITY.md)
- [Buzz agent harness README](https://github.com/block/buzz/blob/main/crates/buzz-acp/README.md)
- [Buzz CLI README](https://github.com/block/buzz/blob/main/crates/buzz-cli/README.md)
- [Buzz production Compose guide](https://github.com/block/buzz/blob/main/deploy/compose/README.md)
- [Buzz v0.4.26 release](https://github.com/block/buzz/releases/tag/v0.4.26)
- [Nostr NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-29](https://github.com/nostr-protocol/nips/blob/master/29.md), [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md), [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md), and [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md)
- local Shrimpy surface interface: `src/surfaces/shared/module.ts`, `src/surfaces/shared/types.ts`, and `docs/reference/surfaces.md`
- local Shrimpy skill model: `src/skills/included/shrimpy-skills/SKILL.md` and `docs/reference/skills.md`

## Recommendation

Buzz is unusually aligned with Shrimpy's direction. It treats humans and agents as named members of shared channels, exposes an agent-oriented JSON CLI, supports threads, search, media, canvases, workflows, and git events, and makes the conversation workspace self-hostable. It is much closer to a purpose-built Shrimpy front door than Telegram or Discord.

It is not ready to become Shrimpy's recommended default environment on description alone. Buzz is a substantial pre-1.0 system with a fast-moving server, desktop app, its own agent harness and agent runtime, Postgres, Redis, object storage, git hosting, workflows, and a cryptographic identity model. Its security policy supports only `main` actively and recommends upgrading previous releases. A local pilot is warranted; default status should wait for operational experience.

### Scope decision

The project owner considers it stupid to plan for anything beyond a Buzz chat surface at this stage. Canvases, workflows, git hosting, memory, ACP harnesses, managed agents, and other Buzz workspace features are out of scope. They matter here only when they affect installation weight, security, or the risk of conflicting with Shrimpy. The proposal is simply: run Buzz, connect a native Shrimpy chat adapter, and use Buzz for chat.

The clean division of responsibility would be:

- Buzz owns the human chat UI, relay, channel membership, and external transcript.
- Shrimpy owns the agent loop, system and user context, durable memory, sessions, tools, watches, child work, and its internal typed channel log.
- A Shrimpy Buzz surface translates between the two.
- Buzz's managed-agent runtime and `buzz-acp` remain disabled for Shrimpy-backed identities so two independent runtimes do not answer the same mention.

Start with a lightweight mechanic-owned setup skill and a manual pilot. The skill is the user-facing setup flow: it can install Buzz, configure the external environment, write the Shrimpy adapter config, validate both sides, and teach CLI use. It cannot itself listen continuously for Buzz events. If the pilot is good, add a native `buzz` `ChatSurfaceModule`; the same mechanic skill should configure and verify it without adding a dedicated setup subcommand.

## What Buzz Actually Is

Buzz is more than a chat client. The shipped shape is a self-hostable workspace whose relay is the source of truth. The desktop app is a Tauri/React client; the relay is a Rust service; Postgres stores events and search state; Redis handles pub/sub, presence, and typing; S3 or MinIO stores media; and the project also includes workflows, git hosting, agent harnesses, and CLIs.

The packaged desktop app does not by itself provide the workspace backend. It defaults to `ws://localhost:3000` and needs either a local relay or a relay URL supplied by an operator. Buzz documents three materially different installation paths:

1. Install the packaged desktop client and connect it to an existing relay.
2. Clone the source and use Docker plus Hermit, or Rust 1.88+, Node 24+, pnpm 10+, and `just`, for a developer relay and desktop build.
3. Run the production Compose bundle on a single node or VPS, with Postgres, Redis, MinIO, optional Caddy/TLS, migrations, stable secrets, and persistent volumes.

The current release page provides desktop artifacts for macOS, Linux, and Windows with SHA-256 hashes. It does not provide a separate packaged `buzz-cli` binary. The CLI README installs from the Rust workspace with `cargo install --path crates/buzz-cli`, so even a CLI-only Shrimpy experiment currently carries a source checkout or Rust build unless the desktop's managed runtime exposes a stable external CLI path.

Buzz also overlaps with Shrimpy. Its repository contains `buzz-acp`, `buzz-agent`, `buzz-dev-mcp`, personas, memory commands, scheduled workflows, and managed-agent UI. That overlap is useful evidence that Buzz takes agents seriously, but adopting both runtimes would create competing session state, memory, scheduling, timeouts, recovery, and tool policy. The integration should deliberately choose one agent runtime. For this proposal, that runtime is Shrimpy.

## What Relying on Nostr Means

### Events are the common record

Nostr's base protocol defines one signed object: an event containing an id, author public key, timestamp, numeric kind, tags, content, and Schnorr signature. Clients publish events and subscribe to filtered event streams over WebSocket. Buzz uses standard kinds where they fit and custom kinds for product features.

This gives Buzz a uniform attribution and event model. A message, reaction, membership change, workflow action, or git event can be identified, signed, filtered, stored, and audited using the same envelope. For a Shrimpy adapter, the Buzz event id is a natural deduplication and provenance key, and the event's public key is a stable transport identity.

The signature proves that whoever held a private key signed those event bytes. It does not prove that the human-readable profile name is true, that the event was safe, or that the relay stored and returned every event.

### A keypair is the account

Humans, agents, and the relay have Nostr keypairs. The public key is the durable identity; possession of the private `nsec` key authorizes signatures. Buzz uses NIP-42 signed challenges for WebSocket authentication and NIP-98 signed request events for HTTP authentication.

Operationally, an agent private key is a high-value credential:

- leaking it enables impersonation until the identity is abandoned or the relay applies an external block;
- losing the only copy can make the identity unrecoverable;
- cloning one key across several Shrimpy agents destroys per-agent attribution;
- putting it in a skill, context file, channel message, git-tracked config, command history, or diagnostic output is unsafe;
- rotating it is closer to replacing an account identity than rotating a normal API token unless Buzz adds an identity-recovery layer around it.

Buzz stores desktop keys in the operating-system keyring, with an owner-only file fallback when no keyring is available. Headless harnesses use `BUZZ_PRIVATE_KEY`. A Shrimpy integration should use one separate Buzz keypair for every Shrimpy agent that appears as a distinct Buzz member, and it should add an explicit secret-storage or secret-resolution path instead of copying `nsec` values into an included skill or package record.

The relay signing key, relay owner key, human key, and each Shrimpy agent key have different roles and should never be reused.

### The relay is still the server

Nostr does not make this Buzz deployment peer-to-peer, blockchain-backed, or automatically federated. Buzz's architecture explicitly uses one relay as the source of truth, with no gossip, replication, or peer-to-peer event exchange. In the normal self-hosted shape, one relay URL selects one community. In a hosted multi-community shape, the request host selects the tenant boundary.

This is good for a private Shrimpy workspace: the mental model is closer to a self-hosted Slack server than to a public social network. It also means:

- availability depends on the chosen relay and its database, cache, object store, DNS, and TLS;
- backups and restore procedures remain the operator's responsibility;
- signed events make authorship verifiable but do not make the relay highly available;
- protocol compatibility offers alternate clients for standard Nostr features, but Buzz-specific kinds, workflows, canvases, git features, and UI behavior still create practical Buzz dependency;
- moving an identity key to another relay is possible, while moving the full community history and product behavior requires an explicit export, backup, or migration path.

### Membership is authorization

Buzz uses relay and channel membership as its main authorization model. Private channels are hidden from non-members, and the relay rejects reads and writes when the authenticated public key lacks membership. Production Compose defaults also support a closed relay with required relay membership.

For a personal Shrimpy deployment, setup should default to:

- TLS for every non-loopback relay;
- closed relay membership;
- one known human owner;
- one distinct key per visible Shrimpy agent;
- dedicated DMs or channels for the first pilot;
- a Shrimpy-side author allowlist even when the relay also enforces membership.

The second allowlist matters because membership answers “may this identity use the Buzz workspace,” while Shrimpy must separately answer “may this identity wake this local agent and exercise its tools.”

### Signed does not mean encrypted

Normal Nostr and NIP-29 channel events are signed, not inherently end-to-end encrypted. Buzz's product vision describes TLS in transit and storage-layer encryption at rest, with server-managed access so search and eDiscovery can read workspace content. Its Nostr interoperability note also reports support for NIP-17 gift-wrapped DMs, while the product vision calls NIP-44 end-to-end encryption a future consideration for DMs.

Those statements describe different protocol and product paths. Until the exact client, relay version, and DM path are verified, a Shrimpy recommendation should assume the relay operator can read workspace messages and should not market Buzz DMs as end-to-end encrypted. This is acceptable for a self-hosted personal relay if it is an explicit trust decision.

Buzz's audit log is hash-chained and tamper-evident, not tamper-resistant. Buzz correctly notes that an attacker with database write access can rewrite data and recompute the chain. Signed client events still provide stronger per-event authorship evidence, but the overall audit system is not an immutable ledger.

## Integration Options

| Option | What it provides | Main limitation | Recommendation |
| --- | --- | --- | --- |
| Included setup/use skill only | Installs or connects Buzz, provisions identities, validates `buzz-cli`, and teaches agents to read or post on demand | No continuous inbound listener, so Buzz cannot wake Shrimpy as the main chat UX | Build first as pilot scaffolding |
| Shrimpy watch polling `buzz-cli` | Periodically finds new messages and invokes an agent | Chat latency, cursor races, duplicate delivery, wasted runs, and awkward thread semantics | Do not make this the product path |
| Run Shrimpy behind `buzz-acp` | Reuses Buzz's mention listener and recovery harness | Shrimpy does not expose an ACP agent server; adding one would put Buzz's session harness around Shrimpy's own session runtime | Revisit only if Shrimpy independently adopts ACP |
| Native Shrimpy Buzz surface | Real-time ingress, normal typed channels, Shrimpy session ownership, normal outbox delivery and health | Requires a small authenticated Nostr/REST client and careful identity, cursor, and loop handling | Best route to a real main chat UX |

Buzz's ACP harness is not a generic webhook that invokes an arbitrary command. It owns ACP sessions, spawns an ACP-compatible agent subprocess, listens for mentions, batches events per channel, recovers subprocesses, and expects the agent to reply through Buzz tools. Wrapping Shrimpy in that layer would duplicate lifecycle policy even if an ACP shim were written.

## Lightweight Bundle: Phase One

Add an included mechanic-owned Buzz setup skill. This skill is the setup experience, not a wrapper around a product setup command. It should orchestrate the external Buzz installation and Shrimpy adapter configuration without vendoring Buzz binaries, source, Compose files, or secrets into the Shrimpy package.

The skill's workflow should:

1. Inspect before changing anything: platform, architecture, Docker/Compose, Rust toolchain, existing Buzz desktop app, existing relay URL, open ports, current Shrimpy gateway state, and available secret storage.
2. Ask the user to choose one of three modes: connect to an existing relay, local evaluation relay, or durable self-hosted relay.
3. Pin an exact Buzz release or image digest. Do not install moving `main` as a “recommended environment.”
4. For the desktop client, download the matching release artifact and verify its published SHA-256 before asking the user to install it.
5. For a relay, keep deployment state outside the Shrimpy workspace, preserve the Compose `.env` and volumes, replace every `CHANGE_ME` value, enable TLS when non-local, enable relay membership, and record a backup/restore checklist.
6. Create or import the human owner identity, then mint a separate identity for the Shrimpy pilot agent. Never print the private key again after secure capture.
7. Add the agent public key to the relay/community, set a recognizable profile, and create one dedicated test DM or stream channel.
8. Install `buzz-cli` from the same pinned Buzz source revision if no verified packaged CLI is available.
9. Validate relay liveness, authenticated identity, channel listing, one outbound test message, one inbound test message, and restart persistence.
10. Report exactly what was installed, where state and backups live, which version is pinned, which services are running, and what remains missing for live Shrimpy ingress.

Any download, package installation, service installation, public listener, TLS/domain change, or secret-store mutation should remain an explicit user-approved step. Read-only detection and validation can run automatically.

The skill can also teach existing Shrimpy sessions to use the JSON CLI for deliberate operations such as:

```bash
buzz channels list
buzz messages get --channel <uuid> --limit 20
buzz messages send --channel <uuid> --content -
```

That is valuable before a surface exists for validating Buzz chat and the agent identity. It is still not chat ingress.

## Native Surface: Phase Two

If the pilot succeeds, add `src/surfaces/buzz/` as a normal `ChatSurfaceModule` registered beside Telegram. Extend the mechanic-owned Buzz setup skill to discover the user's chosen relay, provision the agent identity, write the adapter configuration, restart the gateway when approved, and verify a round trip.

A first useful contract should be deliberately narrow:

- one Buzz relay and one Buzz identity per configured Shrimpy surface instance;
- NIP-42-authenticated WebSocket connection owned by the Shrimpy gateway;
- discover only channels where that identity is a member;
- receive stream text messages and thread replies;
- accept only configured human public keys;
- ignore self-authored events and events already recorded by source id;
- wake the configured default Shrimpy agent only for a DM, an explicit mention, or a deliberately configured always-on channel;
- send plain text replies and thread references back to Buzz;
- keep edits, deletions, reactions, media, canvases, workflows, git events, forums, huddles, and multi-agent shared-room behavior out of the first pass.

Suggested channel and provenance mapping:

- Shrimpy channel: `buzz~<instance-id>~<channel-uuid>`
- manifest binding: `buzz/<instance-id>/<channel-uuid>`
- `origin.transport`: `buzz`
- `origin.transportUserId`: author public key
- `origin.transportChatId`: Buzz channel UUID
- `origin.sourceId`: Buzz event id
- `origin.sourceKind`: Buzz/Nostr event kind
- `origin.addressedAgentId`: configured instance owner, unless an explicit surface-addressing rule overrides it

Persist a replay cursor under `state/buzz/<instance-id>/`, using both event time and event id so reconnects can safely overlap the query window and deduplicate. A timestamp alone is not sufficient because several events can share one second. On reconnect, query a bounded overlap before opening the live subscription. Gateway health should report connection state, last accepted event time, last completed replay, consecutive failures, and bounded redacted errors.

For a prototype, the surface could use `buzz-cli` for outbound REST calls. The durable implementation should use a maintained Nostr signing library and Buzz's documented protocol or REST endpoints directly rather than spawning a CLI process for every message. The adapter should stay a transport edge.

The first release should use one dedicated Buzz channel or DM per visible Shrimpy agent. A shared Buzz room containing several Shrimpy-backed identities is a later feature because Shrimpy must then map external agent public keys to internal agent senders, ingest other agents' replies without treating them as humans, preserve one coherent shared transcript, and prevent echo loops across several surface instances.

## Pilot Plan

Run Buzz as an optional, non-sensitive local environment before making it a recommendation:

1. Pin one release and run a local relay plus desktop client.
2. Use one human owner key and one Shrimpy pilot-agent key.
3. Exercise Buzz manually for ordinary chat, threads, reconnects, and desktop upgrades.
4. Use the mechanic-owned setup skill to assemble and validate the environment, then exercise `buzz-cli` from a normal Shrimpy session.
5. Build a narrow experimental surface only after the manual UX remains appealing.
6. Test relay restart, Shrimpy gateway restart, overlapping replay, same-second messages, duplicate events, unauthorized authors, self echoes, membership removal, channel deletion, thread replies, slow connections, and key loss/rotation.
7. Confirm backup and restore for Postgres, media, git data, Compose configuration, relay keys, human keys, and agent keys.
8. Reassess after at least a week of daily use.

Promotion criteria:

- the desktop UX is good enough to displace the current primary chat in normal use;
- no messages are lost or duplicated across relay and gateway restarts;
- owner-only or allowlisted wake policy is mechanically enforced before a Shrimpy turn;
- secret storage and service restart behavior are boring and inspectable;
- the operator can restore the relay and all required identities from backups;
- Buzz upgrades do not routinely break the adapter contract;
- running Buzz's own agent harness is unnecessary for Shrimpy-backed identities;
- the total local resource and maintenance cost feels justified by the UX.

## Bottom Line

Buzz is a strong candidate for Shrimpy's best full-featured chat environment, but the attractive part is not “Nostr decentralization.” The attractive part is a self-hosted, agent-native workspace built on signed event identities and a protocol-shaped relay.

Nostr gives Shrimpy excellent transport identifiers, authorship, subscriptions, and potential client interoperability. It also introduces private-key custody and does not remove normal server operations, backups, access control, privacy decisions, or product lock-in around custom Buzz features.

The lightest credible bundle is an included setup/use skill that pins and validates an external Buzz installation, followed by a narrow native Shrimpy surface if the pilot succeeds. A skill alone is useful scaffolding; it is not the live bridge required for Buzz to become Shrimpy's main chat UX.
