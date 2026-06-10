# 🦐 CHAN-004: Channel Manifests And Transport Bindings

Status: todo
Priority: P2
Area: Channels
Depends On: [CHAN-003](chan-003-channel-name-validation.md)

## Why
A channel's name currently carries its transport, instance, and thread id: `telegram~main~123`. Egress routes by `startsWith(prefix)` in `src/channels/egress.ts`, and the Telegram adapter re-parses the chat id out of the name with `parseInt(channel.slice(prefix.length))`. The name is doing triple duty as identity, routing key, and transport address — which is why the docs have to warn people not to invent adapter-shaped names for semantic channels. The pattern the design actually wants (semantic channels like `home`, with transport attached) is discouraged-by-documentation instead of supported.

## Build
- Give each channel a small manifest: kind (`home`, `surface-thread`, `dm`, `work`), and an optional structured transport binding such as `{ adapter: "telegram", instance: "main", thread: "123" }`.
- Route outbound delivery (the [CHAN-001](chan-001-typed-egress-outbox.md) outbox) by binding lookup, not name parsing. Surface-thread channels keep their generated names, but nothing downstream parses them.
- Add `shrimpy channels bind <channel> <adapter>/<instance>/<thread>` and `unbind`, so a semantic channel like `home` can be bound to a real Telegram chat.
- Derive manifests lazily for existing channels from the current naming conventions on first touch; new surface threads write their manifest at channel creation.
- Show kind and binding in `shrimpy channels show`.

## Boundaries
- Channel names remain stable identifiers; binding changes routing, never identity or history.
- Membership stays where it lives today (`config/channels.json`); folding it into manifests is a separate decision, not part of this item.
- One binding per channel in the first pass; fan-out delivery to multiple transports is out of scope.
- Do not let bindings become a second control plane: they say where deliveries go, nothing about wake policy or sessions.
- No migration shims beyond the lazy derivation from existing names.

## Shape
Manifests can live beside membership in `config/channels.json` or as `channels/<name>.meta.json`; pick whichever keeps single-writer semantics simplest for the gateway and CLI. The Telegram bridge writes the binding when it first creates a thread channel. The outbox asks "does this channel have a binding and which adapter instance owns it" instead of matching prefixes, which also removes the adapter-route config indirection in `src/config/adapter-routing.ts`.

## Implementation Notes
- Replaces prefix routing registered via `buildAdapterRoutes` in `src/surfaces/shared/module.ts`; surface modules instead expose "create/send for binding".
- `resolveDefaultAgentIds` for membership seeding can key off manifest kind/binding instead of name prefixes.
- `shrimpy surface show/set-agent` keeps working off thread state; binding is orthogonal to addressed-agent state.
- Tests: bind `home` to a Telegram chat and a posted agent message delivers there; unbind stops delivery but keeps the log; lazy derivation produces correct manifests for existing `telegram~`/`dm~` channels.

## Done
- No code parses transport facts out of channel names.
- `shrimpy channels bind home telegram/main/<chat-id>` makes `home` posts deliver to that chat, and `channels show home` reports the binding.
- Surface threads still auto-create and route with zero new user steps.
- `src/config/adapter-routing.ts` prefix routes are gone.
