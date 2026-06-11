# 🦐 SESSION-003: Verified Gateway Session Lifecycle Commands

Status: todo
Priority: P2
Area: Sessions
Depends On: none

## Why
`shrimpy sessions new|clear|restore <channel> --agent <id>` against a gateway channel publishes a session control message into the channel and immediately prints success-shaped output like `requested new session for mechanic on maintenance`. The command exits before the gateway has done anything, prints the same text whether the gateway is running or stopped (a stopped gateway leaves the message queued as backlog with no signal), and gives no way to learn whether the reset took effect. In a live maintenance pass this forced dropping to the session storage archive helper to mark bloated sessions archived by hand, because the CLI's own lifecycle command could not show that it had worked.

The gateway already does the hard part: `SessionControlRuntime` performs the reset/restore/stop/thinking change and publishes a typed `operation_status` status message back into the channel with `ok`, `operation`, and `targetAgentId` (`src/gateway/session-control-runtime.ts`). The CLI never reads it, and nothing ties a status to the request that caused it. One gap on the gateway side: an unknown target agent only logs to `console.error` and publishes no status at all.

## Build
- Correlate requests and outcomes. `ChannelBus.publish` already returns the published `ChannelMessage`; echo its id in the `operation_status` data (for example `requestMessageId`) so a status answers exactly one control message.
- Make gateway-channel lifecycle commands wait by default: after publishing, tail the channel for the correlated status up to a timeout (default well above the delivery-loop tick, roughly 30s), then report the gateway's status text. `--no-wait` opts out and prints queued-shaped output (`queued new session ...`), never the current success-shaped text.
- On a confirmed `ok` status, verify from disk and report concretely: name the archived session and state that the next message opens a fresh session under current policy.
- On a failed status, print the gateway's error text and exit nonzero. On timeout, report the request as unconfirmed, point at `shrimpy gateway status` and `shrimpy sessions list`, and exit nonzero.
- Check gateway liveness first via the pid file (`findRunningGatewayPid`, `runtime.paths.gatewayPidPath`). When the gateway is down, `new`/`clear`/`restore` apply the same direct file path local channels use (`archiveSessionDir`/`restoreArchivedSessionDir`) and report `applied directly; gateway not running` — no orphaned control message left in the channel. Runtime-only actions (`stop`, thinking level) fail fast with a clear gateway-not-running error.
- In `SessionControlRuntime`, publish a failed `operation_status` for unknown target agents instead of only logging, so waiters always resolve.
- `--json` carries the resolved outcome (`applied | applied_direct | failed | unconfirmed | queued`), archive name when applicable, and wait duration.
- Update `docs/reference/sessions.md` (lifecycle command behavior) and the compaction doc's reset guidance to describe the verified flow.

## Boundaries
- No CLI for editing compaction policy here; policy changes stay a `config/shrimpy.json` edit and `sessions compaction` stays the read-only inspector. That gap is a candidate separate item.
- The channel bus stays the only CLI↔gateway transport. No new IPC socket, admin RPC, or gateway HTTP surface.
- Chat-originated session commands (`/new` from Telegram and friends) keep their current behavior; the correlation field is optional and chat surfaces may ignore it.
- Do not remove or bypass the control-message design while the gateway is running; direct file mutation is only valid when no gateway process holds the session.
- No legacy shims: the `requested_*` result kinds and their output text are replaced, not kept alongside the new outcomes.

## Shape
One seam in the session service: a helper that publishes a session control message, awaits its correlated `operation_status`, and verifies the on-disk result. All gateway-channel session control actions (`new`, `clear`, `restore`, `stop`, thinking level) go through it, so "requested" output disappears in favor of verified outcomes with one documented escape hatch (`--no-wait`). Local direct channels keep their synchronous path unchanged, and the gateway-down branch reuses it instead of inventing a second file-mutation route. Channels stay routing and logs: the completion signal is the status message the gateway already publishes; this item makes the CLI a reader of it.

## Implementation Notes
- Touch points: `src/sessions/service.ts` (`executeSessionLifecycleAction`, `executeSessionThinkingAction`, `executeSessionStopAction`), `src/gateway/session-control-runtime.ts` (`publishOperationStatus` and the unknown-agent path), `src/channels/messages.ts` (`OperationStatusContentData` + readers), `src/commands/sessions.ts`, `src/commands/sessions-format.ts`.
- `SessionControlRuntime.handleMessage` already receives the triggering `ChannelMessage`, so threading its id into `publishOperationStatus` is mechanical.
- Waiting can use the existing channel read machinery from the CLI process with a short poll interval; no new gateway capability is required for the read side.
- Liveness race: check the pid immediately before a direct apply. If the gateway starts mid-operation the result is still consistent, because the gateway derives the active session from filesystem lifecycle entries at next open.
- Statuses for requests consumed from backlog after a later gateway start still carry the correlation id, so an unconfirmed request remains auditable in the channel log.
- Tests: correlated wait resolves on the matching status and ignores unrelated statuses on the same channel; failed status exits nonzero; timeout path reports unconfirmed; gateway-down direct apply archives and reports; unknown-agent reset yields a failed status instead of silence.

## Done
- `shrimpy sessions new <channel> --agent <id>` with the gateway running exits only after the reset is confirmed, printing the gateway's status text and the archived session name.
- The same command with the gateway stopped applies the archive directly, says so, and leaves no control message queued.
- A failed or unknown-agent reset produces a failed `operation_status` in the channel and a nonzero CLI exit.
- `--no-wait` restores fire-and-forget with output that reads as queued, and `--json` reports outcome kind, archive name, and wait duration.
- Reference docs describe the verified lifecycle flow.
- Unit tests cover correlation, timeout, failure, gateway-down direct apply, and the unknown-agent status path.
