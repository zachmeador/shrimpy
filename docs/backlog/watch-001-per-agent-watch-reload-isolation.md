# 🦐 WATCH-001: Per-Agent Watch Reload Isolation

Status: draft
Priority: P2
Area: Watches
Depends On: none

## Why

The gateway loads every agent's `watches.json` through one aggregate operation. At startup, one malformed agent watch file can stop the gateway. During live reload, one malformed file prevents valid updates from every other agent from reaching the shared clock. The failure is reported as one gateway-wide reload error even though watch definitions and source files are agent-owned.

Watch scheduling should remain shared, but definition failures should be isolated to the owning agent.

## Current State

- `loadRuntimeAgentWatches` reads and resolves all configured agents' watch files in one call.
- `startGatewayWatchClock` requires that aggregate load to succeed before starting the shared clock.
- Any watched file change reruns the aggregate loader inside one `try` block.
- The clock already preserves schedule state for unchanged resolved watch IDs when `setWatches` succeeds.
- Missing watch files are valid and mean that the agent has no watches.

## Build

- Add a gateway watch-definition registry keyed by agent ID. Each entry holds the current valid resolved definitions and the source path.
- Load agents independently at gateway startup. A malformed file records an agent-scoped diagnostic and contributes no watches without preventing the gateway or other agents' watches from starting.
- Reload only the agent whose watch file changed. On parse or validation failure, retain that agent's last-known-good definitions and clock registrations while reporting the agent ID and source path.
- Treat a successfully parsed empty or missing file as an intentional removal of that agent's watches. Do not confuse deletion with invalid content.
- Update the shared clock from the aggregate of current valid per-agent snapshots so unchanged watch IDs retain their existing schedule state.
- Clear the diagnostic after the agent's watch file becomes valid and the new snapshot is installed.
- Make gateway logs and watch inspection identify the failing agent and source file without exposing command output or secrets.

## Boundaries

- Keep one shared watch clock, one persisted clock-state file, and globally unique resolved watch IDs.
- Do not route watch execution through `AgentChannelRuntime` or introduce a broader `AgentRuntime` abstraction.
- Do not change watch schema, watch action execution, channel delivery, or backlog replay semantics.
- Do not create missing `watches.json` files during gateway startup or reload.
- Do not silently replace a last-known-good snapshot with an invalid or partially parsed file.

## Touches

- `src/gateway/watch-service.ts`
- `src/watches/agent-runtime.ts`
- Focused watch-definition registry module if the state does not fit cleanly in the gateway service
- `src/watches/inspection.ts`
- `test/gateway-watch-service.test.ts`
- `test/watches-command.test.ts`
- `docs/reference/runtime.md`

## Done

- A malformed watch file for one agent does not stop gateway startup or suppress valid watches owned by other agents.
- A malformed live edit retains that agent's last-known-good watches and does not block another agent's reload.
- Fixing the file installs the new definitions and clears the diagnostic without restarting the gateway.
- A valid empty or removed file unregisters only that agent's watches.
- Unchanged resolved watch IDs keep their recorded next-run state across successful and failed reloads.
- Logs and inspection name the owning agent and source path for definition failures.
