# 🦐 CHAN-002: Message Kind Discriminants

Status: todo
Priority: P1
Area: Channels
Depends On: none

## Why
Dispatch and inspection discover what a channel message *is* by duck-probing instead of reading a discriminant:

- `isSessionControlMessage` in `src/gateway/session-control-runtime.ts` tries three content parsers in sequence.
- `classifyChannelMessage` in `src/channels/service.ts` re-derives kinds from origin sniffing: `transport === "watch"`, `watchId`, `workerId`, `actorId.startsWith("worker:")`, even `content.data.kind.startsWith("worker")`. The `worker` kind is half-specified — it exists only in these heuristics, with no producer in the codebase.
- System message payloads are `Record<string, unknown>` with a stringly `kind` inside — a second, untyped discrimination level that session control already lives in and operation statuses ([SURFACE-003](surface-003-chat-operation-status.md)) are about to join.
- `origin.transport` carries two concepts in one free-form string: producer class (`cli`, `internal`, `watch`) and surface name (`telegram`). The docs ask consumers not to switch on it; classification switches on it anyway.

## Build
- Split system-flavored content into a typed union the compiler can check: `control` (session reset/restore/thinking, later stop), `status` (operation statuses: compaction, surface addressing, session lifecycle confirmations), and plain `system` for everything else.
- Collapse classification into one module that both gateway dispatch and `channels search`/`show` use. Delivery becomes a switch on the discriminant, not a parser cascade.
- Separate producer class from surface name in `origin`, or document one as authoritative and stop branching on the other.
- Decide `worker`: either specify it in the protocol (CODE-002 will want it) or delete the heuristics.

## Boundaries
- Do not rename the existing content types `text`, `image`, `image_group`, `unsupported_media`.
- Do not add migration or legacy-parse shims. Old log entries that no longer match a typed kind read as plain `system` messages; that is acceptable for historical data.
- Do not grow this into a schema/versioning system; it is one discriminated union and one classifier.

## Shape
The protocol in `src/channels/messages.ts` and `src/channels/protocol.ts` gains explicit content kinds; `readSessionResetContent`-style probes collapse into one discriminated read. `src/channels/service.ts` classification keeps its inspection vocabulary (`user_text`, `agent_text`, `watch`, …) but derives it from typed fields in one place. [CHAN-001](chan-001-typed-egress-outbox.md) consumes these kinds when deciding what to deliver and how adapters render it.

## Implementation Notes
- Touch points: `src/channels/messages.ts`, `src/channels/protocol.ts`, `src/channels/service.ts`, `src/gateway/session-control-runtime.ts`, `src/gateway/channel-delivery-loop.ts` (`shouldDispatchBacklogMessage`).
- Keep the typed-content constructors (`sessionResetContent` etc.) as the only way to mint control/status content so the union stays closed.
- Tests: dispatch switch covers every kind; classifier parity between CLI inspection and gateway dispatch; unknown/legacy system payloads classify as `system` without throwing.

## Done
- `isSessionControlMessage` is a single discriminated read, not a parser cascade.
- `classifyChannelMessage` contains no origin-sniffing for control/status kinds.
- `worker` is either a specified protocol kind or gone from the codebase.
- Gateway dispatch and CLI inspection agree on message kinds via one shared classifier.
