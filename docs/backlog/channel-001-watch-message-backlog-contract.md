# 🦐 CHANNEL-001: Watch Message Backlog Contract

Status: draft
Priority: P2
Area: Channels
Depends On: none

## Why

Watch-origin messages are durable channel records but have special delivery semantics: live appends pass through normal membership and agent channel policy, while gateway backlog draining silently skips every message classified as watch-origin. This avoids waking agents for stale periodic instructions after downtime, but it also loses a watch wake when the gateway stops after the message is appended and before it is dispatched.

The current all-or-nothing class check is a real reliability policy. Shrimpy should either document it as intentional or replace it with one explicit replay contract.

## Current State

- `ChannelDeliveryLoop.start` sends live watch-origin messages through ordinary channel fanout and agent policy evaluation.
- `shouldDispatchBacklogMessage` rejects every watch-origin message before membership fanout or agent policy evaluation.
- Channel messages have no persisted backlog eligibility or expiry metadata.
- Watch definitions cannot request bounded replay for an important emitted instruction.
- `shrimpy watches show` explains expected wake policy but not restart or backlog behavior.

## Decision Required

Choose the delivery guarantee before implementation:

- Keep watch messages live-only and document the crash window as intentional at-most-once wake delivery; or
- Add a generic persisted backlog policy to channel messages, preferably one discriminated shape that can express `skip`, `until <expiresAt>`, and `always` without interacting booleans.

If replay is configurable, decide which watch actions may opt in, what the default is, and how inspection displays the effective policy. Do not implement both an independent `dispatchBacklog` flag and an unrelated expiry field without one precedence rule.

## Build After Decision

- Put backlog eligibility in the channel delivery layer because it is evaluated before agent fanout; do not make it part of agent wake policy.
- If the current live-only behavior is retained, name it in channel and watch reference docs and add a diagnostic to `shrimpy watches show`.
- If persisted replay metadata is selected, validate it in the typed channel protocol, stamp it when watch messages are published, evaluate it consistently during backlog draining, and expose it through watch inspection.
- Test the gateway crash window, long downtime, expired messages, eligible replay, cursor advancement, and ordinary non-watch backlog messages.

## Boundaries

- Do not create an `AgentRuntime` abstraction for this work.
- Do not replay stale watch instructions merely to make every channel message behave identically.
- Do not hide backlog eligibility inside agent channel policy; visibility and wake policy apply only after a message is eligible for delivery.
- Do not add a general retry queue, job scheduler, acknowledgement protocol, or exactly-once claim.
- Do not change session-control backlog behavior as part of this item.

## Touches

- `src/gateway/channel-delivery-loop.ts`
- `src/channels/messages.ts` and message builders only if persisted replay metadata is selected
- `src/watches/runner.ts` and watch schema only if watches gain a replay option
- `src/watches/inspection.ts`
- `test/channel-delivery-loop.test.ts`
- `test/watches-command.test.ts`
- `docs/reference/channels.md`
- `docs/reference/runtime.md`

## Done

- Watch-message behavior across gateway restart is explicit in code, inspection, and reference docs.
- The chosen default states whether a watch wake may be lost in the append-to-dispatch crash window.
- Any replay opt-in has one unambiguous persisted representation and bounded stale-message behavior.
- Backlog eligibility remains separate from membership visibility and agent wake policy.
- Tests cover the chosen contract without weakening replay of ordinary channel messages.
