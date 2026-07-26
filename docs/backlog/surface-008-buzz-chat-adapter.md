---
status: todo
priority: P2
area: Surfaces
depends_on: []
---

# 🦐 SURFACE-008: Buzz Chat Adapter

## Why

Buzz is a plausible primary human chat UX for Shrimpy: the user runs or joins a Buzz relay, Shrimpy connects to it as a normal Buzz identity, and Buzz messages become ordinary Shrimpy channel messages. Shrimpy remains the agent runtime and owns context, sessions, memory, tools, watches, and internal channel logs.

The accepted scope is only a chat surface. Buzz canvases, workflows, git hosting, search, memory, ACP harnesses, managed agents, and other workspace features are not integration opportunities for this item. See [buzz-shrimpy-environment.md](../research/buzz-shrimpy-environment.md) for the protocol, deployment, identity, and security research behind this direction.

## Current State

- Telegram is the only registered Shrimpy `ChatSurfaceModule`.
- Buzz exposes signed Nostr events over WebSocket and agent-oriented HTTP/CLI operations, but Shrimpy has no Buzz client, surface config, replay cursor, egress, or gateway lifecycle.
- Buzz identities are Nostr keypairs. A Shrimpy agent identity therefore needs stricter secret handling than a normal public transport id.
- Buzz's packaged desktop client still needs a relay. The user may connect Shrimpy to an existing relay or ask the mechanic to install a pinned local Buzz environment.

## UX Implications

The user asks the mechanic to install or connect Buzz. The mechanic discovers an existing relay or offers an approved pinned local install, provisions a dedicated Buzz identity for the Shrimpy surface, collects the authorized human public keys and channel ids, writes the adapter configuration, restarts the gateway when approved, and verifies a round trip.

There is no dedicated `shrimpy setup buzz` command. The mechanic skill is the setup experience. Once configured, an authorized human message in an allowed Buzz channel wakes the instance's default Shrimpy agent, and the agent's reply appears in that same Buzz conversation.

The first version is text chat. Unsupported Buzz features remain visibly unsupported rather than being partially translated or silently treated as text.

### Agent room membership

Buzz already has a useful seam for making Shrimpy agents visibly land in its chatrooms: an external Nostr identity can be added to a channel with the `bot` role and later removed by public key. The current Buzz CLI exposes this as `buzz channels add-member --channel <uuid> --pubkey <hex> --role bot` and `buzz channels remove-member --channel <uuid> --pubkey <hex>`. This is channel membership, not agent execution; Shrimpy continues to own and run the agent.

The mechanic skill should eventually make that lifecycle feel native. Given a request such as “put Scout in the research room,” it can resolve the Shrimpy agent and Buzz channel, provision a dedicated Buzz identity if Scout does not have one, admit that identity to a closed Buzz community when the acting owner has permission, publish its presentation metadata, add it to the channel as a bot, configure the corresponding Shrimpy surface binding, and verify membership and message delivery. “Remove Scout from research” should remove only that channel membership and binding while retaining Scout's identity and memberships in other rooms. Retiring the identity and destroying its credentials must be a separate deliberate action.

This should not use Buzz's managed-agent or `agents draft-create` workflow. That workflow creates an owner-reviewed Buzz Desktop draft for a Buzz-managed agent; a Shrimpy bot should instead remain an externally operated Nostr identity. Automatic room placement may be offered as part of an explicit mechanic-guided Shrimpy agent creation or connection flow, but it must not silently publish identities or change external channel membership.

## Build

- Add a `buzz` chat surface module under `src/surfaces/buzz/` and register it in `src/surfaces/registry.ts`.
- Add `buzz.instances.<id>` config with relay URL, `defaultAgentId`, required authorized human public keys, required allowed channel ids, stable Shrimpy user mappings, and conservative reconnect/send policy.
- Keep the Nostr private key and optional Buzz API token in an owner-only workspace state file such as `state/buzz/<instance-id>/credentials.json`; keep only non-secret instance configuration in `config/shrimpy.json`. Create credential files atomically with mode `0o600`.
- Use a maintained Nostr implementation for event encoding, Schnorr signing, NIP-42 authentication, and NIP-98 HTTP authentication. Do not hand-roll cryptography.
- Start one persistent authenticated WebSocket connection per configured instance. Subscribe only to the allowed member channels and the text event kinds required by the first contract.
- Accept only configured channel ids and authorized human public keys. Drop self-authored, unauthorized, unsupported, malformed, and duplicate events before publishing to a Shrimpy channel or waking an agent.
- Map accepted Buzz channels to stable Shrimpy channels named `buzz~<instance-id>~<channel-uuid>` with manifest bindings such as `buzz/<instance-id>/<channel-uuid>`.
- Publish accepted text through the shared chat-surface path with `transport: "buzz"`, author public key as `transportUserId`, Buzz channel UUID as `transportChatId`, Buzz event id as `sourceId`, and Nostr kind as `sourceKind`.
- Preserve NIP-10 thread reply provenance when Buzz provides it. Plain channel text must remain useful when a thread reference cannot be represented.
- Persist a replay cursor under `state/buzz/<instance-id>/` using event time plus event id. Reconnect with a bounded overlap window and deduplicate by event id so same-second events and uncertain disconnect boundaries do not lose or repeat messages.
- Implement outbound egress that signs and sends plain text to the bound Buzz channel, preserves a thread target when present, and records normal Shrimpy delivery receipts.
- Expose redacted gateway health through the existing surface health path: connection state, last accepted event, last completed replay, consecutive failures, restart count, and bounded errors without keys, tokens, message text, public keys, or channel ids.
- Add a mechanic-owned included skill for Buzz installation and adapter setup. It may connect an existing relay or perform an explicitly approved pinned local install, provision and securely store the surface identity, add it to the Buzz community, collect allowlists, write config, validate the relay and adapter, and verify a round trip.
- Give the mechanic composable add/remove-room operations for a configured Shrimpy agent identity. Prefer Buzz's NIP-29 membership operations directly through the maintained client boundary; the Buzz CLI may be used during setup when pinned and available. Add with the channel role `bot`, verify the resulting roster, and keep channel removal separate from identity retirement and credential deletion.
- Document the settled adapter behavior in `docs/reference/surfaces.md` when implemented.

## Boundaries

- Chat surface only. Do not integrate Buzz canvases, workflows, git hosting, search, memory, feeds, repos, media stores, huddles, ACP harnesses, managed agents, or agent personas.
- Do not run Shrimpy behind `buzz-acp` or Buzz's agent runtime. Shrimpy owns agent sessions and lifecycle.
- Do not create or manage Shrimpy agents through Buzz's managed-agent draft flow. Buzz bot membership is presentation and routing for an external Shrimpy-owned identity.
- Do not add `shrimpy setup buzz`. Guided installation and connection belong to the mechanic-owned skill.
- Do not make `buzz-cli` a runtime dependency of the adapter. It may be used by the mechanic for pinned-install diagnostics when available.
- Do not store Nostr private keys or API tokens in skills, prompt-loaded context, channel logs, git-tracked files, command history, diagnostics, or ordinary surface config.
- Do not rely on Buzz relay membership as Shrimpy authorization. Enforce the configured human public-key and channel allowlists before channel publication.
- Do not authorize by profile name, display name, NIP-05 handle, or other mutable presentation metadata.
- Do not claim that signed channel events are end-to-end encrypted. Treat the relay operator as able to read ordinary workspace chat unless the exact supported path proves otherwise.
- Do not ingest edits, deletions, reactions, media, forums, workflow events, git events, presence, typing, or other Buzz kinds in the first version.
- Do not build multi-agent shared-room routing in the first version. Start with one Buzz surface identity and one default Shrimpy agent per configured instance.
- Do not add legacy config aliases, migration paths, or compatibility shims.

## Shape

Use the existing surface vertical:

- `config.ts` validates and resolves non-secret instance configuration.
- `credentials.ts` owns the restricted credential file and redacted inspection.
- `client.ts` owns authenticated Buzz WebSocket and HTTP protocol calls.
- `bridge.ts` authorizes, deduplicates, maps identity and provenance, and publishes typed channel messages.
- `cursor.ts` owns replay overlap and durable event-id deduplication.
- `outbound.ts` signs and sends Shrimpy replies.
- `surface.ts` wires egress-only and gateway lifecycle classes.
- `module.ts` exports the registered `ChatSurfaceModule`.

Keep Buzz protocol details inside this vertical. Reuse existing shared surface publication, membership, addressing, user-presence, outbox, receipt, and health seams without growing `src/surfaces/shared/` around speculative future adapters.

## Done

- The mechanic can connect an existing Buzz relay or complete an explicitly approved pinned local Buzz install without a dedicated product setup command.
- The mechanic provisions a dedicated surface identity, stores credentials in an owner-only state file, configures authorized human public keys and channel ids, and verifies a round trip.
- The mechanic can add a configured Shrimpy agent identity to a Buzz channel with role `bot`, verify its membership, and remove it from that channel without deleting the identity or disturbing its other channel memberships.
- An authorized human text event in an allowed Buzz channel is published once into the corresponding `buzz~<instance>~<channel>` Shrimpy channel and wakes the configured default agent.
- Unauthorized authors, disallowed channels, self-authored events, malformed events, unsupported kinds, and replay duplicates do not create Shrimpy messages or turns.
- An agent reply through normal Shrimpy channel publication is delivered to the same Buzz channel with normal delivery receipts.
- Gateway and relay restarts replay uncertain event boundaries without losing or duplicating accepted messages.
- Health and inspection output are useful and redact credentials, message content, public keys, and channel ids.
- Tests cover config validation, restricted credential storage, NIP-42 authentication boundaries, required allowlists, inbound authorization, identity/provenance mapping, self-echo rejection, cursor overlap, event-id deduplication, outbound delivery, receipt behavior, redacted health, and mechanic skill validation.
