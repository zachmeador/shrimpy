# 🦐 SURFACE-004: Discord DM Chat Adapter

Status: todo
Priority: P2
Area: Surfaces

## Why
Shrimpy should support Discord as another chat surface, but the first version should stay narrow: one bot account receiving and sending direct messages with explicitly authorized human users. That gives the user a familiar low-friction control path without taking on Discord guild-channel, thread, role, slash-command, or multi-user room semantics.

Discord DMs fit Shrimpy's existing surface model well. The adapter translates an external one-on-one chat into a durable Shrimpy channel, stamps stable human identity, and lets agents reply through `send_message` instead of treating Discord as a separate conversation runtime.

See [discord-adapter-interface.md](../research/discord-adapter-interface.md) for the current high-level interface notes.

## Build
- Add a `discord` chat surface module under `src/surfaces/discord/`, following the current Telegram module shape.
- Build the shared chat engine by extraction while porting: move inbound gating, identity mapping, burst buffering, and the chat command registry into `src/surfaces/shared/` as Discord needs them, instead of copying Telegram's `bridge.ts`/`commands.ts`. Discord is the forcing function that earns the abstraction; do not abstract ahead of it. See [SURFACE-006](surface-006-chat-command-parity.md) for the command registry shape.
- Add `discord.instances.<id>` config with bot token, `defaultAgentId`, required authorized Discord user ids, stable Shrimpy user mappings, and conservative text-burst/message formatting policy.
- Register Discord surface egress for `discord/<instance>` bindings, and have inbound DMs write channel manifests with bindings such as `discord/<instance>/<thread>` while keeping stable generated channel names like `discord~<instance>~<thread>`.
- Start a gateway listener for configured instances and accept only `MESSAGE_CREATE` events from one-on-one DM channels.
- Drop guild messages, group DMs, bot-authored messages, self messages, missing/empty allowlists, and unauthorized users before publishing anything to Shrimpy channels.
- Publish inbound DM text through `ChatSurfacePublisher` with `transport: "discord"`, Discord author id as `transportUserId`, the DM channel/conversation id as `transportChatId`, and mapped stable human identity.
- Implement outbound egress for Discord-backed channels with Discord's create-message API, 2000-character chunking, and mention suppression by default.
- Add `shrimpy setup discord` and status/diagnostic inspection enough to verify token, gateway connection, configured authorized users, and recent channel delivery from the CLI.

## Boundaries
- No Discord guild/server channel support in this item.
- No group DMs, Discord threads, voice, reactions, slash commands, buttons, modals, or native interactions.
- No pairing workflow in the first pass. Use explicit configured authorized users.
- Do not silently accept DMs from unconfigured Discord users.
- Do not add name-based authorization. Discord user ids are the authorization key.
- Do not create a second chat/session system. Discord DMs become normal Shrimpy channels and gateway sessions.
- Do not add Discord-specific session semantics. Once a DM is normalized into a Shrimpy channel message, the normal gateway session and turn-value context path should carry origin/delivery facts.
- Do not add legacy shims, deprecated config aliases, or migration paths.

## Shape
Use the existing chat-surface vertical:

- `config.ts` validates and resolves instances, builds surface ids, and validates `defaultAgentId`.
- `client.ts` owns Discord REST/gateway calls or wraps the chosen Discord library.
- `bridge.ts` normalizes inbound Discord messages, checks DM-only authorization, maps identity, and publishes typed channel messages.
- `outbound.ts` chunks and formats Shrimpy text into Discord-safe messages.
- `surface.ts` wires egress-only and gateway lifecycle classes.
- `index.ts` exports the `ChatSurfaceModule` and gets registered in `src/surfaces/index.ts`.

Prefer a proven Discord gateway library for the first implementation unless bundle/runtime cost is a concrete problem. Discord gateway lifecycle has heartbeat, resume, close-code, identify, and rate-limit behavior that is not worth hand-rolling just to ship text DMs.

## Implementation Notes
- Use Discord user ids for authorization and stable user mapping. Keep display names cosmetic.
- Treat the authorized Discord user id list as required config. Setup and gateway startup must fail closed when it is missing or empty.
- Keep outbound `allowed_mentions` closed by default so model output cannot ping roles, `@everyone`, or arbitrary users.
- For the first pass, text DMs are enough. Attachments can publish `unsupported_media` with filename/type metadata, then images/documents can be promoted in a later item.
- Discord message content is available in DMs with the app even without broad guild message-content access, but this adapter should avoid guild paths entirely.
- If the channel suffix uses Discord's DM channel id, support only conversations that have been initiated or observed. A later proactive Discord-side resolver can use Discord's Create DM endpoint when there is a user action and a clear product need; Shrimpy's transport-neutral `user:<id>` alias already resolves through last active chat-surface presence.
- Hermes is useful for practical filters: ignore self/bots, enforce allowlists before processing, suppress risky mentions, batch split text, and cache attachment media at the edge.
- OpenClaw is useful for policy shape: direct-message policy before channel publication, group-DM disabled by default, user-id based conversation identity, and high coverage around unauthorized senders.

## Done
- A configured Discord bot can receive a direct message from an authorized Discord user and publish it into a `discord~<instance>~...` Shrimpy channel.
- Unauthorized users, group DMs, guild messages, bot messages, and self messages are ignored or logged without creating Shrimpy channel turns.
- An agent can reply through `send_message` and the message is delivered back to the same Discord DM.
- `shrimpy setup discord` creates or updates the Discord instance config without disturbing other config.
- CLI/status output can show configured Discord instances and enough gateway state to debug setup.
- Tests cover config resolution, missing/empty authorization config, inbound DM authorization, dropped non-DM cases, identity mapping, manifest binding, outbound chunking, mention suppression, and egress registration.
