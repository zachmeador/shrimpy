---
status: draft
priority: P2
area: Watches
depends_on: []
---

# 🦐 WATCH-001: Per-Agent Watch Reload Isolation

## Why

The gateway loads every agent's `watches.json` at once. One malformed file can stop gateway startup or block watch updates for every agent.

Load each agent's watches separately so one bad file affects only that agent.

## Current State

- `loadRuntimeAgentWatches` loads all agents in one call.
- `startGatewayWatchClock` does not start if that call fails.
- Changing any `watches.json` reloads every agent's file.
- Missing watch files are valid and mean that the agent has no watches.

## UX Implications

A malformed watch file affects only its owning agent. Other agents' watches continue running, inspection names the affected agent and file without exposing watch contents, and correcting the file restores normal operation without restarting the gateway.

## Build

- Track the loaded watches for each agent.
- Load agents independently when the gateway starts. A bad file leaves that agent with no watches and does not stop the gateway.
- When a file changes, reload only its agent. If the reload fails, keep that agent's previous watches.
- An empty or missing file removes that agent's watches.
- Keep the existing next-run time for watches that did not change.
- Report the agent ID and file path in gateway logs and watch inspection. Clear the error after a successful reload.

## Boundaries

- Keep one shared watch clock and clock-state file. Resolved watch IDs remain globally unique.
- Do not change watch schema, watch action execution, channel delivery, or backlog replay semantics.
- Do not create missing `watches.json` files during gateway startup or reload.
- Do not replace working watches with data from a failed reload.
- Errors may name the agent and file path, but must not include watch contents, commands, or secrets.

## Touches

- `src/gateway/watch-service.ts`
- `src/watches/agent-runtime.ts`
- A focused watch-loading module if needed
- `src/watches/inspection.ts`
- `test/gateway-watch-service.test.ts`
- `test/watches-command.test.ts`
- `docs/reference/runtime.md`

## Done

- A malformed file does not stop the gateway or affect another agent's watches.
- A failed reload keeps that agent's previous watches running.
- Fixing the file loads the new watches and clears the error without restarting the gateway.
- A valid empty or removed file unregisters only that agent's watches.
- Unchanged watches keep their next-run time.
- Logs and inspection identify the bad file and its agent.
