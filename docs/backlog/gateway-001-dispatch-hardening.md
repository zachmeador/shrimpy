# 🦐 GATEWAY-001: Dispatch Hardening — Dedupe, Ordering, Loop Guard

Status: todo
Priority: P2
Area: Gateway
Depends On: none

## Why
Three robustness gaps in the channel delivery loop:

- **Crash duplicates.** Cursors persist only after backlog drain and on clean shutdown (`src/gateway/channel-delivery-loop.ts`); live dispatch advances them in memory. A crash re-dispatches every message since the last save, and nothing dedupes — agents run duplicate turns. The per-agent `markChannelSeen` state is context material, not a delivery ledger.
- **Accidental ordering.** Live dispatch fires `void dispatchMessage(...)` per message; in-channel ordering survives only because the control-message check resolves microtasks in enqueue order before reaching the per-channel run chain. Correct today, one refactor away from flaky.
- **Agent ping-pong.** Default wake mode is `all` and the only loop guard is self-authorship. Two default-policy agents in one channel wake each other forever. The guardrail belongs in the runtime, not in prompts.

## Build
- Per-agent handled-message ledger: ack after the turn is persisted, consult before dispatch. At-least-once delivery plus dedupe = effectively-once turns across crashes.
- Persist cursors periodically during live operation, not only at shutdown.
- An explicit per-channel dispatch queue so ordering is an invariant, not a microtask coincidence.
- A runtime loop guard for agent-to-agent wakes. Candidate shapes: agent-authored messages wake other agents only when their policy opts in explicitly, or a per-channel agent-to-agent turn budget per time window with a logged, visible trip. Pick one conservative default.

## Boundaries
- Keep wake policy agent-owned; the loop guard is a safety net under policy, not a second policy system.
- Do not dedupe by scanning session transcripts; the ledger is gateway state under `runtime/`.
- Do not serialize across channels or agents; concurrency boundaries stay (agent, channel).
- Do not change `shouldDispatchBacklogMessage` semantics for watch messages (stale watch storms stay suppressed).

## Implementation Notes
- Ledger and queue live in or beside `src/gateway/channel-delivery-loop.ts`; the ack hook can ride the existing `markMessageHandled` callback path in `src/sessions/registry.ts`, which already fires after a turn completes.
- Loop-guard evaluation belongs near `shouldAgentWakeForChannelMessage` in `src/agents/channel-policy.ts`, with the budget state in the gateway, and the trip surfaced via gateway status (and a typed status message once [CHAN-001](chan-001-typed-egress-outbox.md)/[CHAN-002](chan-002-message-kind-discriminants.md) land).
- Tests: kill the gateway mid-turn and restart without duplicate turns; interleaved messages on one channel dispatch in append order; two `mode: all` agents in one channel cannot exchange unbounded turns.

## Done
- A hard kill and restart does not replay already-handled turns.
- In-channel dispatch order is enforced by structure and covered by a test.
- An accidental two-agent wake loop trips the guard, stops, and is visible in gateway status.
- Cursor loss on crash costs reprocessing work only, never duplicate agent turns.
