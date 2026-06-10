# 🦐 SURFACE-007: User Reachability Over The Last Active Chat Surface

Status: todo
Priority: P2
Area: Surfaces
Depends On: none

## Why
Agents and watches sometimes need to "tell the user" without knowing which surface thread currently reaches them. Today `notify`/`reply` only work inside the session's active publication channel, and `send_message` needs a concrete channel name — so a watch or an internal-channel agent that wants to ping the user has to hardcode a `telegram~main~<chat-id>` name. The clean version: Shrimpy knows the last surface thread each known user spoke in, and posting "to the user" resolves to that channel at send time.

This stays small because the pieces exist: surface bridges already resolve stable `userId`s via the identity store, and `send_message` already allows posting to any intentionally named channel.

## Build
- Per-user presence state: on each inbound human surface message, record `userId → { channel, surface, at }`. One small state file under `state/` or `runtime/`, written at the bridge seam where identity is already resolved.
- A user-alias channel reference, e.g. `user:zach`, accepted where channels are named — `send_message`, `shrimpy channels post` — and resolved at post time to the user's most recent surface-thread channel. The message is logged in that concrete channel (the real conversation record) and delivered through normal egress.
- Clear failure when a user has no presence yet: a tool error naming the user and suggesting concrete channels, not a silent drop. A configurable fallback channel can come later if the error proves annoying.
- CLI inspection: `shrimpy users presence` (or fold into `shrimpy users show`).

## Boundaries
- Presence is a pointer, not a message store: no per-user inbox channel, no notification queue, no scheduling, no broadcast machinery.
- Do not auto-join the posting agent to the resolved channel; posting without membership is already the `send_message` contract.
- Do not change `reply`/`ask` semantics; the active publication channel stays what it is.
- Keep the agent-facing tool surface stable: agents currently use the messaging tools well. Prefer teaching `send_message` the `user:` alias via its existing channel parameter and prompt prose over adding a new tool; if testing shows the alias confuses sessions, a separate explicitly named tool is the fallback — decide with transcript evidence, not upfront.
- Single user focus first; multi-user households just mean multiple presence entries, nothing more.

## Shape
Resolution happens at the post seam (tool execution / CLI), not inside the channel layer: the channel log only ever sees concrete channel names. Cross-agent sends into the user's chat make [SURFACE-002](surface-002-chat-delivery-attribution.md) attribution matter — mechanic posting to the user's Shrimpy chat should be labeled. With [CHAN-004](chan-004-channel-manifests-bindings.md), presence could later become a binding-aware concept (resolve to "user's preferred bound channel"), but last-active-thread is the right v1.

## Implementation Notes
- Write presence from `ChatSurfacePublisher` or the bridge in `src/surfaces/shared/chat-bridge.ts`, since both identity and channel are in hand there.
- Resolve the alias in `src/tools/daemon.ts` (`send_message`) and `src/commands/channels-post.ts`; reject `user:` names at the channel-store boundary so the alias can never become a file name ([CHAN-003](chan-003-channel-name-validation.md) interplay).
- The Discord adapter note in [SURFACE-004](surface-004-discord-dm-chat-adapter.md) already anticipates a proactive `user:<id>` resolver; this item is the transport-neutral half.
- Tests: presence updates on inbound Telegram message; `send_message(channel="user:zach")` posts and delivers to the recorded thread; unknown user errors clearly; alias never reaches the filesystem.

## Done
- A watch or agent session can post to `user:<id>` and the text lands in that user's most recent surface chat, logged in that channel.
- `shrimpy users presence` shows each known user's last-active surface channel and age.
- Posting to an unknown/never-seen user fails with a clear, actionable error.
- No new tool is required unless transcript evidence shows the alias confusing agents.
