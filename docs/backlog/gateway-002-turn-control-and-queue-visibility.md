# 🦐 GATEWAY-002: Turn Stop Control And Queue Visibility

Status: review
Priority: P2
Area: Gateway
Depends On: none

## Why
There is no way to interrupt a running gateway turn, and the per-channel queue is invisible. When an agent goes long or hangs, the user gets dead air: messages queue silently behind the stuck turn, nothing reports "running for 4m, 2 queued," and the only remedy is restarting the gateway. Pi sessions already support abort signals (`run_child` uses one), so the capability exists one layer down.

## Build
- A stop control: chat `/stop` and CLI `shrimpy sessions stop <channel> [--agent <id>]`, flowing as a typed control message through the channel log like reset/restore/thinking do.
- Stop aborts the in-flight turn via the Pi abort signal and reports a visible confirmation through the normal status path. Decide whether stop also drops queued turns or only the running one; lean: abort running, keep queue, with a `--all` variant later if needed.
- Queue visibility: per-(agent, channel) lane state — current turn started-at, queue depth, last turn outcome — in `shrimpy gateway status` and `shrimpy sessions list`.
- Tie into [SURFACE-001](surface-001-telegram-typing-activity.md): typing/activity is the ephemeral signal while a turn runs; lane state is the inspectable truth.

## Boundaries
- Stop is per agent per channel; no global kill switch in this item.
- Do not let stop bypass turn persistence guarantees — an aborted turn still records what happened in the session transcript.
- Do not build queue reordering or priorities; this is visibility and abort only.

## Shape
The wrinkle: control messages are handled by `SessionControlRuntime` outside the session run chain, but reset/restore currently *enqueue* on the chain — a stop that queues behind the turn it is meant to kill is useless. `SessionRegistry` needs an out-of-band abort handle per managed session (the running turn's `AbortController`), while the stop confirmation and any queue mutation stay ordered on the chain.

## Implementation Notes
- Add a stop content kind beside reset/restore/thinking in `src/channels/messages.ts` (folds into the [CHAN-002](chan-002-message-kind-discriminants.md) union).
- `runSessionTurn` in `src/sessions/turn-output.ts` already accepts a signal; thread one through `SessionRegistry.runTurn` in `src/sessions/registry.ts` and keep the handle on the managed session.
- Telegram command registration in `src/surfaces/telegram/commands.ts` gains `/stop`; confirmation rides the session-control status path.
- Lane state can be derived from `SessionRegistry` internals exposed via a small status accessor rather than new bookkeeping.
- Tests: stop aborts a long-running fake turn promptly; queued messages survive (or drop, per the decision) and are reported; stop with nothing running is a clean no-op message.

## Done
- `/stop` from Telegram aborts a stuck turn within seconds and confirms visibly.
- `shrimpy gateway status` shows, per agent/channel lane: running turn age, queue depth, last outcome.
- Stop appears in the channel log as a typed control message like other session controls.
