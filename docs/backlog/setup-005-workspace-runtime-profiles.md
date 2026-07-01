# 🦐 SETUP-005: Workspace Runtime Profiles

Status: review
Priority: P1
Area: Setup
Depends On: none

## Why

Shrimpy has a workspace, but it does not have one explicit runtime profile that binds the active workspace, app checkout, command path, gateway service, and child-process environment. Local/dev installs currently rely on a home-level workspace pointer plus user-global command links, so a running gateway, an agent shell command, and a developer terminal can disagree about which Shrimpy and which workspace are active.

The target shape is boring: inside a Shrimpy runtime, bare `shrimpy` should mean this workspace's Shrimpy, gateway services should be bound to one workspace/app pair, and diagnostics should show exactly how the environment was resolved.

## Current State

- Runtime identity lives in `src/app/environment.ts` and binds the workspace path, app checkout, CLI path, gateway script path, web server path, workspace-local bin dir, service id, systemd unit name, and launchd label.
- Workspace resolution is explicit-first: leading `--workspace <path>`, then `SHRIMPY_WORKSPACE`, then cwd-local `.shrimpy/config/shrimpy.json`, then `~/.shrimpy-workspace.json`, then `~/.shrimpy`.
- `shrimpy`, `shrimpy-gateway`, and setup all use the same explicit workspace path behavior.
- Each runtime writes command shims under `workspace/runtime/bin/`. Shrimpy-owned child processes put that directory first on `PATH` and set `SHRIMPY_WORKSPACE`.
- Gateway service definitions are bound to one workspace/app pair. Linux units use `shrimpy-gateway-<id>.service`; macOS LaunchAgents use `io.github.zachmeador.shrimpy.gateway.<id>.plist`; service env records `SHRIMPY_WORKSPACE`.
- Gateway sessions, watch command actions, context command sources, and worker supervisors inherit the runtime environment.
- `shrimpy status` and `shrimpy gateway status` print the runtime profile and emit runtime warnings when the resolved workspace, bare `shrimpy`, active CLI path, or service identity disagrees with the profile.
- Setup writes runtime-bin breadcrumbs into `context/WORKSPACE.md`, and reference docs describe the profile-bound resolver, shims, service names, and diagnostics.

## Implemented

- Added one environment resolver for Shrimpy runtime identity with `workspacePath`, `appRoot`, `cliPath`, `gatewayScriptPath`, `webServerPath`, `binDir`, `serviceId`, `serviceName`, and `launchdLabel`.
- Made workspace resolution explicit-first: global `--workspace <path>`, then `SHRIMPY_WORKSPACE`, then a cwd-local workspace such as `./.shrimpy/config/shrimpy.json`, then the optional home pointer, then the home default.
- Added global CLI preparse so every registered command and bare `shrimpy` can use `--workspace` before command dispatch.
- Taught `shrimpy-gateway` to accept the same explicit workspace through `--workspace` or `SHRIMPY_WORKSPACE`.
- Generated workspace-local command shims under `workspace/runtime/bin/`. The shims call the owning app checkout with the owning workspace, so agent subprocesses can run bare `shrimpy` and get the local runtime.
- Prepended the workspace-local bin dir to `PATH` for gateway boot, session launches, watch command actions, context command sources, worker supervisors, and other Shrimpy-owned child processes.
- Bound gateway service definitions to the runtime profile. Service env names the workspace, and the service label/unit is derived from the workspace/app pair so multiple local/dev workspaces can coexist.
- Added status diagnostics that report active workspace, resolution source, app root, runtime bin, effective `command -v shrimpy`, gateway service id/path, and runtime mismatch warnings.
- Updated setup docs and `context/WORKSPACE.md` breadcrumbs so agents know the local command path, workspace path, app checkout, and service binding.

## Boundaries

- Do not make fake `HOME` setup the supported local-dev model. It may remain a test helper, but normal local/dev runtime isolation should use explicit profile/env data.
- Do not introduce another hidden mandatory pointer file as the primary source of truth.
- Do not destroy or rewrite existing workspaces, service files, or user command links without an explicit command and confirmation path.
- Do not add migration shims for old command names or old service names by default. If an existing service needs replacement, surface the exact uninstall/install commands and let the user approve.
- Keep Pi state isolated under the workspace's `state/pi/`; this item is about selecting and propagating Shrimpy runtime identity, not changing Pi auth/model storage.

## Notes

- [SETUP-004](setup-004-safe-environment-update.md) should reuse the runtime environment resolver when preflighting the installed app checkout, active workspace, command target, and gateway state.
- Removing or replacing an old global gateway service remains an explicit user action. Status diagnostics expose mismatches, but this item does not automatically uninstall existing service files.

## Touches

- `src/config/workspace.ts`
- `src/app/environment.ts`
- `src/app/paths.ts`
- `src/app/runtime.ts`
- `src/cli.ts`
- `src/gateway.ts`
- `src/gateway/service-ctl.ts`
- `src/gateway/watch-service.ts`
- `src/commands/catalog.ts`
- `src/commands/gateway-status.ts`
- `src/commands/gateway.ts`
- `src/commands/status.ts`
- `src/commands/update.ts`
- `src/context/turn/command-source.ts`
- `src/setup/init.ts`
- `src/setup/templates/workspace/context/WORKSPACE.md`
- `src/watches/actions.ts`
- `src/watches/inspection.ts`
- `src/watches/runner.ts`
- `src/workers/runner.ts`
- `docs/reference/setup.md`
- `docs/reference/workspace.md`
- `docs/reference/configuration.md`
- `test/workspace-path.test.ts`
- `test/gateway-ctl.test.ts`
- `test/gateway-command.test.ts`
- status/setup tests as needed

## Done

- `shrimpy --workspace /path/to/workspace status` and `SHRIMPY_WORKSPACE=/path/to/workspace shrimpy status` resolve that workspace without reading the home pointer.
- A repo-local workspace with `./.shrimpy/config/shrimpy.json` can be used from the repo without changing the user's global workspace pointer.
- `shrimpy gateway install` records the explicit workspace/app binding in the platform service definition.
- Two different workspaces can have inspectable, non-conflicting gateway service identities.
- Gateway sessions, watches, context command sources, and workers inherit an environment where bare `shrimpy` resolves to the workspace-local shim.
- `shrimpy status` reports the runtime profile and warns when the current CLI, gateway service, workspace shim, or resolved workspace disagree.
- Tests cover resolver precedence, global `--workspace` parsing, gateway service generation with workspace binding, workspace-local PATH precedence, and status mismatch reporting.
