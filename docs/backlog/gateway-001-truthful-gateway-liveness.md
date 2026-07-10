# 🦐 GATEWAY-001: Truthful Gateway Liveness

Status: review
Priority: P1
Area: Gateway
Depends On: none

## Why

Shrimpy's always-on runtime needs one authoritative answer to three questions: is a gateway process running for this workspace, is it the only owner, and are its hosted surfaces making progress? Today service registration, PID ownership, runtime activity, and surface polling report separate fragments, so control commands can act from a false gateway-down result.

On macOS, `isGatewayProcess` reads `/proc/<pid>/cmdline`, which does not exist on that supported platform. A live gateway is classified as a non-gateway process, `findRunningGatewayPid` can delete its PID file, and another gateway can pass the singleton guard. The current status commands separately inspect only the expected profile-bound service, so an alive manual or differently registered gateway can be reported as inactive. This blocks safe implementation of SESSION-003 and SETUP-004: neither may directly mutate session files or replace live code while a gateway still owns the workspace.

The Telegram poller detects and restarts stalled requests, but its last successful poll and retry state stay inside the poller. Gateway status cannot distinguish a healthy surface from retrying, stalled, stopped, or stale process state.

## Current State

- `src/gateway/pid-file.ts` stores a plain PID and validates process identity through Linux `/proc` on every platform.
- Gateway startup checks the PID before writing its own file, but the check and write do not form one atomic ownership claim.
- `readGatewayServiceStatus` reports the expected systemd or launchd service. It does not report the workspace PID-backed process.
- `shrimpy status` and `shrimpy gateway status` present service state as gateway state and cannot name a live unmanaged, manual, or differently registered process.
- `GatewayRuntimeState.updatedAt` changes only when handled-message, lane, or loop-guard state changes; it is not a gateway heartbeat.
- `TelegramPoller` records `lastPollTime` internally but exposes no health snapshot. Logs can show recoverable stalls and retries without changing status output.
- The current test suite covers dead and non-gateway PIDs, service-manager output, and poller restart behavior, but not Darwin process discovery, duplicate gateway claims, service/process disagreement, heartbeat freshness, or surface health reporting.

## Build

- Replace the platform-specific PID test with one process-identity helper that works on Linux and macOS. Keep the PID file inspectable and make process-command lookup injectable for tests. Match the expected gateway script rather than any Node process.
- Turn gateway startup into an atomic singleton claim: create the PID file exclusively, refuse an alive matching owner, reclaim only a confirmed stale or unrelated owner, and retry the claim without a check/write race. Shutdown removes the file only when the current process still owns it.
- Add one gateway runtime health record under `runtime/` with a version, PID, workspace, app checkout, gateway start time, heartbeat time, and per-surface health. Write it atomically on a short unref'd interval and once during startup/shutdown transitions.
- Define a small shared surface-health shape. Telegram reports `starting | healthy | retrying | stalled | stopped`, last completed poll time, last received update time when known, consecutive failures, last error without secrets, and stall/restart count. Keep transport-specific detail at the surface edge.
- Add one read-only gateway liveness collector that combines the expected service-manager state, PID ownership, heartbeat freshness, runtime identity, and surface snapshots. It returns explicit process states such as `running`, `stale`, `mismatched`, and `stopped`; service installation remains a separate fact.
- Make `shrimpy status` and `shrimpy gateway status` render that collector. A live process with an inactive or unexpected service must be reported as running with a mismatch warning, not inactive. A live PID with a stale heartbeat must be reported as degraded. Show surface health and the exact log/status commands for failures.
- Make gateway start/stop/restart use the same ownership result rather than their own interpretation. Preserve safe manual operation on platforms without a service manager.
- Update setup and runtime reference docs so "gateway running" means the PID/heartbeat-backed runtime result, while systemd/launchd state describes how it is managed.

## Boundaries

- Do not add an HTTP health server, admin RPC, socket protocol, or network probe. The contract is local files plus existing process and service inspection.
- Do not automatically uninstall, rewrite, or stop unexpected service definitions. Report the mismatch and the explicit lifecycle commands.
- Do not fold SESSION-003 lifecycle confirmation or SETUP-004 update application into this item. Both items consume this liveness contract afterward.
- Do not treat a quiet workspace as unhealthy. Heartbeat freshness is independent of channel, watch, and session activity.
- Do not expose Telegram tokens, message text, user identities, or provider secrets in health state or JSON output.
- Do not make Telegram fields part of the generic gateway core beyond the shared surface-health envelope.

## Touches

- `src/gateway/pid-file.ts`
- `src/gateway.ts`
- `src/gateway/service-ctl.ts`
- New focused gateway liveness/health module under `src/gateway/`
- `src/gateway/runtime-state.ts` only if runtime identity storage is shared cleanly
- `src/surfaces/shared/types.ts`
- `src/surfaces/telegram/poller.ts`
- `src/surfaces/telegram/surface.ts`
- `src/commands/status.ts`
- `src/commands/gateway-status.ts`
- Gateway PID, control, status, and Telegram poller tests
- `docs/reference/setup.md`
- `docs/reference/runtime.md`
- `docs/reference/surfaces.md`

## Done

- On macOS and Linux, a live gateway PID is recognized as the expected gateway process and is never deleted as stale merely because `/proc` is unavailable.
- Two concurrent starts for one workspace cannot both claim ownership; the loser exits nonzero and reports the owning PID.
- Shutdown cannot remove another process's newer PID claim.
- `shrimpy status` and `shrimpy gateway status` separately report process health and service-manager state from one shared collector.
- A live manual or differently registered gateway is shown as running with a management mismatch; an installed service with no healthy process is shown as stopped or stale.
- A fresh heartbeat proves the gateway event loop is alive even when the workspace has no recent messages or watches.
- Telegram health shows successful polling, retrying, stalls, and recovery without exposing secrets.
- Gateway lifecycle commands, SESSION-003, and SETUP-004 have one reusable gateway-running decision and never infer liveness from service registration alone.
- Tests cover Darwin process lookup, atomic duplicate claims, stale PID recovery, owner-safe cleanup, fresh/stale heartbeat classification, service/process disagreement, and Telegram health transitions.
