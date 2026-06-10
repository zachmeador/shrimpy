# 🦐 CHAN-001: Typed Egress Outbox With Delivery Receipts

Status: review
Priority: P1
Area: Channels
Depends On: CHAN-002

## Why
Outbound delivery is currently a side effect of publishing, split across three verbs whose load-bearing differences are encoded only in method names: `publish*` logs without delivering, `deliverText` delivers without logging, and `sendAgentText` does both as a non-atomic dual write. This creates real holes:

- Session reset/restore/thinking confirmations go out through `deliverText` in `src/gateway/session-control-runtime.ts`, so the user sees text on Telegram that does not exist in the channel log. That breaks "channels are the shared communication record."
- `sendAgentText` publishes, then delivers. A crash or Telegram API failure between the two steps leaves a logged message that was never sent, with no record that delivery failed and no retry.
- `delivered: boolean` means "an egress route prefix matched," not "the user got it." Delivery is unobservable.
- Egress only carries text. Inbound media is typed, but agents have no path to send an image out.

This item makes delivery a consumer of the channel log instead of a side effect of publishing. It supersedes the SURFACE-005 draft: the plumbing lands here, while the presentation policies live in [SURFACE-002](surface-002-chat-delivery-attribution.md) (attribution), [SURFACE-003](surface-003-chat-operation-status.md) (operation statuses), and [SURFACE-006](surface-006-chat-command-parity.md) (command output stays surface-local).

## Build
- Posting user-visible content means appending it to the channel log. Remove the deliver-without-logging path entirely.
- Add a gateway outbox worker that tails channels with manifest bindings from [CHAN-004](chan-004-channel-manifests-bindings.md), transmits agent-visible messages through the surface adapter, and records a delivery receipt per message: delivered, failed with error summary, skipped, or retrying.
- Deliveries carry the typed `ChannelMessage`, not raw text. Adapters render the content types they support: text, image, image_group, and status/control kinds from [CHAN-002](chan-002-message-kind-discriminants.md). Outbound media to Telegram becomes possible.
- Replace session-control confirmations with typed status messages that are logged and then delivered through the outbox.
- Retry transient delivery failures with bounded backoff; expose undelivered counts in `shrimpy channels show` and gateway status.
- CLI posts append to the channel log only; the gateway outbox owns delivery and receipt writes so short-lived CLI processes never race a running gateway.

## Boundaries
- Do not change the agent-facing tool surface. `reply`, `ask`, `notify`, `report`, `send_message`, and `read_channel` keep their names, parameters, and prompt prose. Agents currently use these tools well; this work is runtime plumbing underneath them, and prompt-visible behavior changes are regressions.
- Do not block publishing on delivery; append stays synchronous and fast.
- Do not introduce a queue store other than the channel log plus the receipt ledger.
- Do not deliver receipts to chat surfaces; receipts are inspection data.
- Do not mutate stored channel text for display concerns.
- No legacy shims: `deliverText` and prefix-string egress are removed, not deprecated.

## Shape
`ChannelBus` dissolves into named parts with honest verbs: a channel log (append/read/watch, the current store) and an outbox (gateway worker plus receipts). `post` = append; the worker notices and transmits. The worker reuses the cursor/watch machinery the inbound delivery loop already has — the same tailing pattern pointed outward.

Receipts live under `runtime/`, keyed by channel and message id, so `channels show` can report last-delivered position and failures without scanning surface logs. The invariant after this lands: if the user saw it, it is in the channel log; if it is in the log on an outbound-routed channel, it was delivered or its failure is recorded.

## Implementation Notes
- Replace `src/channels/egress.ts` and the egress half of `src/channels/bus.ts`; `EgressRegistry` prefix matching goes away in favor of the worker consulting manifest bindings.
- `registerTelegramEgress` in `src/surfaces/telegram/surface.ts` becomes a typed render-and-send implementation; chat ids come from channel bindings instead of channel-name parsing.
- Replace `deliverText` calls in `src/gateway/session-control-runtime.ts` with typed status posts.
- `reply`/`notify`/`send_message` in `src/tools/daemon.ts` switch from `sendAgentText` to post; tool result text reports logged-for-outbound-delivery without changing parameters.
- Tests: crash between append and transmit recovers on restart; failed Telegram send records a receipt and retries; control confirmations appear in both the channel log and Telegram; no duplicate sends when the worker replays.

## Done
- Session-control confirmations appear in the channel log as typed status messages and still reach Telegram.
- No code path sends user-visible text without a corresponding logged channel message.
- A failed outbound send is visible in receipts and `channels show`, and is retried; a crash between log and send does not lose the message or double-send it.
- An agent can send an image to a Telegram-backed channel.
- Agent tool names, parameters, and prompt prose are unchanged.
