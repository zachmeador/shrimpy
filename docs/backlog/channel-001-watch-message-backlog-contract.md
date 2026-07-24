---
status: draft
priority: P2
area: Channels
depends_on: []
---

# 🦐 CHANNEL-001: Watch Message Backlog Contract

## Why

Watch messages wake agents when the gateway sees them live. The gateway skips them when replaying channel history after a restart. This avoids running stale instructions, but a restart can lose a watch wake that was written to the channel and not yet handled.

Decide whether that loss is acceptable or whether some watch messages should be replayed.

## Current State

- Live watch messages go through normal channel membership and agent wake policy.
- Backlog replay skips every watch message.
- Messages do not record whether or how long they may be replayed.
- `shrimpy watches show` does not explain this behavior.

## Decision Required

Choose one behavior:

- Keep watch messages live-only and document that a restart can lose a wake.
- Store a replay policy on channel messages: `skip`, `until <expiresAt>`, or `always`.

If replay is configurable, decide the default and which watch actions may change it.

## Build After Decision

- Keep replay handling in channel delivery, before membership and wake policy.
- If watch messages stay live-only, document that and show it in `shrimpy watches show`.
- If messages gain a replay policy, add it to the channel protocol, stamp it on watch messages, apply it during backlog replay, and show it in watch inspection.
- Test the gateway crash window, long downtime, expired messages, eligible replay, cursor advancement, and ordinary non-watch backlog messages.

## Boundaries

- Do not replay stale watch instructions by default.
- Do not put replay rules in agent wake policy.
- Do not add a retry queue, scheduler, or acknowledgement protocol, and do not claim exactly-once delivery.
- Do not change session-control backlog behavior as part of this item.

## Touches

- `src/gateway/channel-delivery-loop.ts`
- `src/channels/protocol.ts` and message builders if messages gain a replay policy
- `src/watches/runner.ts` and watch schema only if watches gain a replay option
- `src/watches/inspection.ts`
- `test/channel-delivery-loop.test.ts`
- `test/watches-command.test.ts`
- `docs/reference/channels.md`
- `docs/reference/runtime.md`

## Done

- Code, inspection, and docs agree on whether watch messages replay after a restart.
- The default clearly states whether a restart may lose a watch wake.
- Any replay option has one stored representation and an expiry when needed.
- Replay rules remain separate from membership and wake policy.
- Tests cover the chosen contract without weakening replay of ordinary channel messages.
