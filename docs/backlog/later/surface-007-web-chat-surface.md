# 🦐 SURFACE-007: Web Chat Surface

Status: draft
Priority: P3
Area: Surfaces
Depends On: none

## Why

Shrimpy has a local web app, but it is currently a workspace/session log browser rather than an interactive channel surface. A future owner-facing web app could let the user choose a channel, read its durable transcript, send a human message, select the addressed agent, and observe new channel messages without refreshing.

The useful product idea is a dense local channel console that reuses Shrimpy's existing channel/session runtime. A frontend framework migration or agent-chat library is not part of the accepted direction yet.

## Current State

- `web/` is a Vite/Svelte 5 app with a dense dark workspace tree and file/session/channel viewer.
- `src/web/server.ts` serves static assets plus read-only `/api/tree` and `/api/file` endpoints.
- Typed channel history, byte cursors, watchers, channel summaries, human-message publishing, addressed-agent state, and gateway runtime inspection already exist below the web layer.
- `shrimpy-web` can bind to a caller-supplied host, so adding mutation endpoints changes the security boundary even if loopback remains the default.
- Channel manifests currently have one optional transport binding. A browser observing channel SSE is not automatically another registered egress binding.

## Open Decisions

- Is this strictly a workspace-owner/operator console, or a user-facing chat surface that may later be exposed beyond loopback?
- Which channel kinds are visible, and which are writable? Internal work logs and agent DMs should not become writable merely because they appear in the inspector.
- Does the browser observe existing channels as another window, create web-owned channels, or support both with visibly different behavior?
- How is the addressed agent chosen when Shrimpy has surface-instance defaults but no workspace-wide default agent?
- What loopback, same-origin, CSRF, authentication, and `--host` rules guard read and write APIs?
- Can the existing Svelte UI deliver the first useful version? Evaluate React or assistant-ui only after a concrete interaction requires them.

## Possible First Slice

- Add a CLI-first `shrimpy web serve` path while retaining the existing `shrimpy-web` executable as an implementation entry point only if still useful.
- Define an explicit owner-local security policy before adding writes. Refuse non-loopback mutation without an accepted authentication design and validate same-origin requests.
- Add Shrimpy-native endpoints for an allowed channel list, recent typed history with a cursor, one selected-channel SSE stream, and text-only human publication.
- Use `ChannelBus`, channel service summaries, and existing byte cursors rather than generic file reads for chat behavior.
- Require an explicit valid addressed agent in the composer or define a real web-surface default; do not invent a workspace default.
- Build the first UI in the existing Svelte app: channel list, typed transcript rows, addressed-agent control, composer, send failure, reconnect state, and follow-latest behavior.
- Preserve the current inspector as a distinct operator view rather than mixing every internal system/control record into an ordinary chat transcript.

## Boundaries

- Do not make the browser a model/provider client or create a web-only session/transcript store.
- Do not claim token streaming or turn interruption from channel SSE alone. Add runtime-correlated turn state only when the backend exposes it explicitly.
- Do not add a web egress binding when observing channel messages over SSE is sufficient.
- Do not expose arbitrary workspace files through new chat APIs.
- Do not discard the current dense, low-chrome, scan-friendly design.
- Do not commit to React, assistant-ui, AG-UI, or another frontend/runtime protocol before a small spike proves a concrete advantage over Svelte.
- Do not add migration or legacy compatibility paths.

## Related Work

- [SURFACE-002](../surface-002-chat-delivery-attribution.md) covers visible attribution when non-default agents speak through a shared surface identity.
- [SURFACE-003](../surface-003-chat-operation-status.md) covers the narrow user-visible compaction failure status.
- [SURFACE-006](../surface-006-remote-chat-commands.md) covers the small remote command/status service.
- [`session-model.md`](../../musings/session-model.md) describes surfaces converging on the same channel/session model.

## Done

- The security, channel visibility/write, identity, and surface-vs-observer decisions are settled before implementation begins.
- A local user can select an allowed channel, read recent durable messages, send addressed text, and receive new messages without refreshing.
- Browser-origin messages use normal Shrimpy channel/session routing.
- Operator inspection remains available without presenting private/internal records as ordinary chat.
- The implementation is reachable through `shrimpy web ...`, has focused backend tests, and preserves the existing visual character.
