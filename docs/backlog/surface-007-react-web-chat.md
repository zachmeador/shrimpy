# 🦐 SURFACE-007: React Web Chat Surface

Status: todo
Priority: P2
Area: Surfaces
Depends On: none

## Why
Shrimpy has a local web app, but it is currently a workspace/session log browser rather than a chat surface. It reads a workspace tree and individual files through `src/web/server.ts`, then renders JSONL/text files in the small Vite/Svelte app under `web/`. That is useful for inspection, but it does not let a user talk to an agent, watch a channel live, switch addressed agents, or use web as a first-class Shrimpy surface.

The current `shrimpy-web` aesthetics are intentional and should carry forward. The dense dark UI, compact rows, restrained mono styling, low visual chrome, and fast scanability are part of the product direction, not temporary scaffolding. A rewrite should preserve that operational feel instead of defaulting to a spacious generic chat app.

The web chat direction should build on Shrimpy's existing channel/session model instead of introducing a second agent runtime. Pi remains the model/session/tool-calling layer. Shrimpy remains the durable channel, agent, session, gateway, and workspace layer. The web app is a human-facing surface that reads and writes Shrimpy channel messages.

The current Svelte app is small enough that rewriting it is less risky than embedding a React chat framework inside Svelte. assistant-ui is React-first and fits the desired agent-chat UX better than a hand-rolled Svelte clone. The rewrite should keep the existing local server and build shape simple: React/Vite frontend, Shrimpy-owned HTTP/SSE APIs, static assets served by `shrimpy-web`.

## Current State
- `web/` is a Vite/Svelte 5 app configured by `web/vite.config.ts`.
- `src/web/server.ts` serves static files from `dist/web/public` and exposes only file-browser APIs: `/api/tree` and `/api/file`.
- `web/src/App.svelte` owns the whole page: workspace tree on the left, selected file/session/channel viewer on the right.
- The current frontend intentionally favors information density: small type, compact metadata, visible file/session structure, low padding, and a dark operator-console feel.
- `src/web/tree.ts` classifies workspace files and intentionally blocks private/media reads.
- Channel messages already have a typed durable protocol in `src/channels/protocol.ts`.
- Chat surface publishing already has shared primitives in `src/surfaces/shared/chat-bridge.ts`.
- Telegram already proves the routed-surface shape: inbound surface messages become channel messages; gateway sessions decide when agents respond; outbound messages deliver through egress.
- There is no browser-facing channel list, channel history endpoint, live event stream, send-message endpoint, web surface identity, or web egress/activity adapter.

## Direction
Replace the Svelte frontend with a React/Vite frontend that uses assistant-ui as the chat component/runtime layer. Keep the backend contract Shrimpy-native and adapt Shrimpy channel messages to assistant-ui messages only at the web UI edge.

The first useful version should feel like a dense local operations chat, not a consumer landing page. The left side can keep the workspace/channel/session inspection affordance, but the primary web surface should let a user choose a channel, read the durable transcript, send a message, and see new channel messages without refreshing.

The React rewrite should preserve the current `shrimpy-web` design language unless a specific interaction needs to change. assistant-ui's default styling should not define the product look. Use its primitives where useful, then skin or wrap them so the result still feels like Shrimpy: compact, inspectable, text-forward, low ornament, and optimized for repeated work.

The web UI should not call model providers directly. Sending a message from the browser publishes a human text message into a Shrimpy channel with `transport: "web"` and addressed-agent metadata. Existing gateway/session machinery should own whether and how an agent wakes, thinks, calls tools, and replies.

assistant-ui should be treated as a frontend library, not as Shrimpy's runtime architecture. Start with a custom transport/runtime that maps Shrimpy APIs into assistant-ui threads. Consider AG-UI later only if Shrimpy needs to expose a reusable external agent UI protocol.

## Build
- Replace Svelte dependencies and Vite plugin usage with React/Vite dependencies.
- Keep `web/` as the frontend root and keep `npm run build:web` producing `dist/web/public`.
- Preserve the existing static `shrimpy-web` deployment shape: `npm run build` still builds TypeScript, builds web assets, and serves them from `dist/web/server.js`.
- Port the current file-browser view or keep it as a secondary inspection panel so existing `shrimpy-web` usefulness is not lost.
- Add a channel-centric web API surface:
  - `GET /api/channels` lists visible channels with basic metadata.
  - `GET /api/channel?name=<channel>` returns recent durable channel messages and a cursor.
  - `GET /api/channel/events?name=<channel>&cursor=<cursor>` streams new channel messages with server-sent events.
  - `POST /api/channel/message` publishes a human text message into a channel.
  - Later endpoints can cover addressed-agent switching, session reset/restore/stop, thinking level, attachments, and synthetic operation-status testing.
- Use the existing `ChannelBus`/`ChannelStore` contract for history and live updates instead of reading channel JSONL through the generic file API.
- Stamp browser-origin messages with a web transport identity:
  - `sender.kind: "human"`
  - stable local actor id, likely derived from configured user identity or a conservative local default
  - `origin.transport: "web"`
  - `origin.transportUserId` for the browser/local user identity
  - `origin.transportChatId` for the selected web thread/channel
  - `origin.addressedAgentId` from surface-local state or the workspace default agent
- Reuse or extend `ChatSurfacePublisher` rather than duplicating human message construction in web server code.
- Add a web surface/thread state store entry so addressed-agent switching can use the same model as Telegram.
- Add a minimal web egress route only if the web surface needs server-pushed messages independent of the selected browser channel. The first version can rely on channel SSE for visible transcript updates.
- Adapt Shrimpy `ChannelMessage` values into assistant-ui message objects in frontend code. Keep the adapter small and explicit.
- Render typed channel content:
  - text messages as normal chat rows
  - image/image_group as inspectable media placeholders first, native thumbnails later
  - status/control/system messages as compact operational rows
  - unsupported_media as compact metadata rows
- Include visible sender attribution for multi-agent/channel cases, consistent with SURFACE-002's direction.
- Include an agent/addressing control that can show the current addressed agent and switch when the backend supports it.
- Include basic send states: idle, sending, failed, waiting/streaming, interrupted/stopped when supported.
- Use assistant-ui for message threading/composition where it helps, but keep Shrimpy-specific controls and operational rows simple React components.
- Keep styling dense and utilitarian: monospace-friendly where appropriate, restrained colors, tight spacing, compact controls, fast scanning, no marketing hero.

## Backend Shape
The backend should expose a small web surface API rather than a generic filesystem API for chat. File browsing can remain for inspection, but chat should not depend on `readJsonl`.

Suggested server modules:

- `src/web/server.ts` keeps request routing and static serving.
- `src/web/channels.ts` lists channel metadata and maps channel history reads to JSON responses.
- `src/web/events.ts` owns SSE connection lifecycle, cursors, keepalive, and watcher cleanup.
- `src/web/messages.ts` validates publish requests and uses `ChatSurfacePublisher` or `ChannelBus.publishHumanText`.
- `src/web/types.ts` holds browser-facing DTOs so frontend code does not import Node-only runtime modules.

SSE should be cursor-based and boring:

- Client opens with the last known byte cursor.
- Server drains backlog from that cursor, then watches new channel appends.
- Events carry typed channel messages plus the next cursor.
- If a cursor points past a rotated/truncated file, fall back to a recent-history response with an explicit reset marker.
- Keep one selected-channel stream per browser tab for the first version.
- Stop file watchers and timers when the response closes.

Publishing should be conservative:

- Accept text only at first.
- Reject empty or whitespace-only text.
- Enforce a reasonable request body limit.
- Validate channel names through the same parsing path as channel storage.
- Do not allow the browser to write arbitrary sender/system/control messages.
- Do not expose private auth, provider state, session prompts, or workspace files through chat endpoints.

## Frontend Shape
Use React/Vite directly under `web/`.

Suggested frontend modules:

- `web/src/main.tsx` boots React.
- `web/src/App.tsx` owns layout and selected channel/thread state.
- `web/src/lib/api.ts` wraps channel list, history, send, and SSE.
- `web/src/lib/channel-adapter.ts` converts Shrimpy channel messages into assistant-ui/thread rows.
- `web/src/lib/types.ts` mirrors the web DTOs.
- `web/src/components/ChannelList.tsx` shows channel names, recent activity, and unread/new markers.
- `web/src/components/ChatSurface.tsx` hosts assistant-ui and Shrimpy-specific operational rows.
- `web/src/components/InspectorPanel.tsx` keeps or ports the current tree/file reader as a secondary tool.
- `web/src/components/AddressedAgentControl.tsx` shows and later changes the current addressed agent.

The first screen should be the usable chat/workspace surface. Avoid a landing page. Keep keyboard behavior practical:

- Enter sends, Shift+Enter inserts newline.
- Up/down navigation stays inside channel list or message composer as expected.
- Refresh/reconnect is explicit and visible.
- Failed sends are retryable.
- The newest messages stay visible when follow-latest is enabled, similar to the current file view.

Visual direction:

- Preserve the current dark, compact, operator-console feel.
- Keep information density high by default; do not add oversized message bubbles, large avatars, decorative cards, hero panels, or generous marketing-site spacing.
- Use assistant-ui components only after restyling them to fit Shrimpy's current tone.
- Keep metadata visible where it improves inspection: channel, sender, agent, timestamp, content kind, status/control markers, and cursor/reconnect state.
- Prefer narrow, stable controls and readable tables/lists over large rounded chat furniture.
- Use color sparingly for role/status/tool semantics, similar to the current palette.

## Assistant-UI Integration
Start with the lightest assistant-ui integration that works with Shrimpy-owned state.

- Prefer a custom runtime/transport over adopting Next.js or a hosted assistant backend.
- Treat Shrimpy channel history as the source of thread state.
- Treat `POST /api/channel/message` plus SSE as the transport path.
- Keep assistant-ui message ids tied to durable channel message ids where possible.
- Do not rely on assistant-ui to persist conversations.
- Do not require AI SDK provider routes unless they are only used as a frontend message protocol adapter. Pi already owns provider/model calls.
- Verify package licenses before adding dependencies; the intended choices are permissive React/Vite/assistant-ui packages.

If assistant-ui fights the channel-room model, narrow its use to composer/thread primitives and render Shrimpy rows directly. The backend contract should not contort around a frontend library.

## Boundaries
- Do not make the browser a model client.
- Do not bypass Shrimpy channels, sessions, or gateway routing for agent replies.
- Do not build a separate web-only transcript store.
- Do not remove the existing workspace inspection capability unless it is intentionally replaced by an equivalent or better React view.
- Do not discard the current visual density or operator-console aesthetic during the framework rewrite.
- Do not expose arbitrary workspace file reads through new chat APIs.
- Do not add migration or legacy Svelte compatibility code.
- Do not add broad auth/user-management in this item. Keep the initial web surface local-host oriented and document that assumption in the note or reference docs when implemented.
- Do not clone every TUI command in the first pass. Link to SURFACE-006 for command parity.
- Do not block the first pass on attachments, markdown perfection, tool-call replay, or multi-browser collaboration.

## Related Work
- SURFACE-002 covers visible attribution when non-default agents speak through a shared surface identity.
- SURFACE-003 covers operation status messages such as compaction lifecycle.
- SURFACE-006 covers chat command parity and shared command/status services.
- `docs/musings/session-model.md` describes web as a routed surface converging on the same channel/session model as Telegram.
- `docs/musings/framework-design.md` asks future web UI to be information-dense and high-signal.

This item can land before SURFACE-002, SURFACE-003, and SURFACE-006 as long as it does not solve those concerns in incompatible web-only ways.

## Touches
- `package.json`
- `web/vite.config.ts`
- `web/index.html`
- `web/src/`
- `src/web/server.ts`
- new `src/web/*` helpers for channels, events, publish validation, and DTOs
- possibly `src/surfaces/shared/chat-bridge.ts` if it needs a small web-friendly helper
- tests under `test/` for web API behavior
- docs/reference update after implementation if the web surface becomes user-facing

## Tests
- Build still succeeds with the React frontend: `npm run build`.
- Web API unit tests cover channel listing, history reads, cursor behavior, SSE backlog drain, publish validation, and watcher cleanup.
- Publish tests assert that browser sends become typed human channel messages with `transport: "web"` and addressed-agent metadata.
- Security tests cover invalid channel names, oversized bodies, empty text, and attempts to spoof sender/control/system payloads.
- Frontend smoke test or lightweight component test verifies channel selection, send flow, SSE append, failed-send display, and follow-latest behavior.
- Manual verification starts `shrimpy-web`, opens the local URL, selects a channel, sends a message, observes the channel JSONL append, and sees the reply arrive when gateway/session runtime is active.

## Done
- `shrimpy-web` serves a React/Vite app from the existing static server path.
- The web app lets a local user select a channel, read recent durable messages, send text, and receive new messages live without refreshing.
- Browser-origin messages are normal Shrimpy channel messages and can wake/respond through the same gateway/session machinery as other routed surfaces.
- The existing file/session/channel inspection value is preserved or replaced by an equivalent React inspector.
- The React UI keeps the current dense, dark, scan-friendly Shrimpy-web aesthetic while adding chat.
- assistant-ui is used only at the frontend edge and does not own Shrimpy persistence, agent runtime, or provider calls.
- The implementation has focused backend tests and a documented manual verification path.
