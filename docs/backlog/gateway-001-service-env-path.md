# 🦐 GATEWAY-001: Gateway Service PATH For Child Processes

Status: todo
Priority: P1
Area: Gateway
Depends On: none

## Why

Everything the gateway spawns — Pi tool shells inside gateway sessions and command watch actions — inherits the gateway daemon's environment. On Linux the generated systemd user unit sets no `Environment=`, so the daemon runs with systemd's minimal PATH and child shells cannot resolve `shrimpy` from `~/.local/bin`. Watch-woken agents burn turns diagnosing the missing binary and fall back to invoking `node <checkout>/dist/cli.js` directly, while watch inspect commands, skill snippets, and turn-context hints all reference bare `shrimpy`.

Verified on the reference host 2026-06-12: `systemctl --user show shrimpy-gateway.service -p Environment` prints an empty `Environment=`.

## Current State

- `generateSystemdUnit` in `src/gateway/service-ctl.ts` emits no `Environment=` directive.
- `generateLaunchAgentPlist` in the same file already bakes install-time PATH into `EnvironmentVariables` when `opts.env.PATH` is set, and `installLaunchd` passes the installer's `process.env` through. macOS installs capture PATH; Linux installs do not.
- Command watch actions run via `execAsync` with no `env` option (`src/watches/actions.ts`), and session open passes only `cwd` to Pi's `createAgentSession` (`src/sessions/open.ts`), so both inherit the daemon environment unchanged.
- Nothing resolves the shrimpy bin shim location or augments PATH anywhere in the runtime.

## Build

- Thread the installer's environment into `generateSystemdUnit` the way `generateLaunchAgentPlist` already takes it, and emit `Environment=PATH=...` in the `[Service]` section so `shrimpy gateway install` bakes the calling user's PATH into the unit.
- At gateway boot (`src/gateway.ts`), ensure the shrimpy bin directory is on `process.env.PATH`: append the shim's directory (`~/.local/bin` by install convention) when missing. This keeps bare `shrimpy` working regardless of how the daemon was launched — systemd, launchd, or a manual `node dist/gateway.js`.
- Re-verify on the reference host: `shrimpy gateway install && shrimpy gateway restart`, then confirm a watch-woken session can run bare `shrimpy`.

## Boundaries

- No per-spawn env plumbing in watch actions or session open; the daemon environment is the seam and children inherit it.
- Unit files change only through `shrimpy gateway install`; do not rewrite existing units from other commands.

## Touches

- `src/gateway/service-ctl.ts` (systemd unit generation and install), `src/gateway.ts` (boot PATH guarantee), new tests for unit generation with PATH and the boot augmentation, and the gateway service section of `docs/reference/setup.md`.

## Done

- A Linux `shrimpy gateway install` writes a unit whose `Environment=PATH=` includes the shrimpy bin directory, confirmed via `systemctl --user show shrimpy-gateway.service -p Environment`.
- The gateway guarantees the shrimpy bin directory on its own PATH at boot.
- A watch-woken gateway session runs bare `shrimpy` successfully on the reference host.
- Tests cover unit generation with and without a provided PATH and the boot-time augmentation.
