# 🦐 SETUP-005: Workspace Runtime Profiles

Status: draft
Priority: P1
Area: Setup
Depends On: none

## Why

Shrimpy has a workspace, but it does not have one explicit runtime profile that binds the active workspace, app checkout, command path, gateway service, and child-process environment. Local/dev installs currently rely on a home-level workspace pointer plus user-global command links, so a running gateway, an agent shell command, and a developer terminal can disagree about which Shrimpy and which workspace are active.

The target shape is boring: inside a Shrimpy runtime, bare `shrimpy` should mean this workspace's Shrimpy, gateway services should be bound to one workspace/app pair, and diagnostics should show exactly how the environment was resolved.

## Current State

- Workspace resolution lives in `src/config/workspace.ts` and checks `~/.shrimpy/.shrimpy-workspace.json`, then `~/.shrimpy-workspace.json`, then defaults to `~/.shrimpy`.
- `shrimpy-gateway` loads config from that same implicit resolver. `shrimpy gateway install` writes a platform service that runs the current install's `dist/gateway.js`, but the service definition does not name the workspace.
- Gateway boot calls `ensureShrimpyBinOnPath()`, which appends `~/.local/bin` to `PATH`. That helps normal installs but cannot make a repo-local/dev `shrimpy` win over the user's installed command.
- Agent sessions expose `workspace_path` and other facts in prompt/runtime metadata, but subprocesses, watches, context command sources, and worker backends mostly inherit ambient process env.
- `scripts/dev-setup.mjs` creates isolated test/dev environments by spoofing `HOME` and writing the same pointer file shape under that fake home. This proves isolation is possible, but the supported product path should not depend on fake home directories.
- Worker supervisors already show the better pattern: parent processes launch them with an explicit `--workspace <path>` instead of rediscovering the workspace from home.

## Build

- Add one environment resolver for Shrimpy runtime identity, with a typed result such as `ShrimpyRuntimeProfile` or `ShrimpyEnvironment`. It should include `workspacePath`, `appRoot`, `cliPath`, `gatewayScriptPath`, `binDir`, `serviceId`, and `resolutionSource`.
- Make workspace resolution explicit-first: global `--workspace <path>`, then `SHRIMPY_WORKSPACE`, then a cwd-local workspace such as `./.shrimpy/config/shrimpy.json`, then named/default profile state, then the home default.
- Add a small global CLI preparse so every registered command and bare `shrimpy` can use `--workspace` before command dispatch.
- Teach `shrimpy-gateway` to accept the same explicit workspace through `--workspace` or `SHRIMPY_WORKSPACE`.
- Generate workspace-local command shims under a path such as `workspace/runtime/bin/`. The shims should call the owning app checkout with the owning workspace, so agent subprocesses can run bare `shrimpy` and get the local runtime.
- Prepend the workspace-local bin dir to `PATH` for gateway boot, session launches, watch command actions, context command sources, worker supervisors, and other Shrimpy-owned child processes.
- Bind gateway service definitions to the runtime profile: service ExecStart or env must name the workspace, and the service label/unit should be derived from a stable profile name or workspace hash so multiple local/dev workspaces can coexist.
- Add status diagnostics that report active workspace, resolution source, app root, CLI path, effective `command -v shrimpy`, gateway service id/path, and any mismatch between the current CLI, gateway service, and workspace-local shim.
- Update setup docs and `context/WORKSPACE.md` breadcrumbs so agents know the local command path, workspace path, app checkout, and service binding.

## Boundaries

- Do not make fake `HOME` setup the supported local-dev model. It may remain a test helper, but normal local/dev runtime isolation should use explicit profile/env data.
- Do not introduce another hidden mandatory pointer file as the primary source of truth.
- Do not destroy or rewrite existing workspaces, service files, or user command links without an explicit command and confirmation path.
- Do not add migration shims for old command names or old service names by default. If an existing service needs replacement, surface the exact uninstall/install commands and let the user approve.
- Keep Pi state isolated under the workspace's `state/pi/`; this item is about selecting and propagating Shrimpy runtime identity, not changing Pi auth/model storage.

## Notes

- The likely first slice is global `--workspace` plus `SHRIMPY_WORKSPACE`, with gateway service generation passing that explicit workspace.
- The second slice is workspace-local shims plus PATH propagation.
- The third slice is profile-aware service naming and mismatch diagnostics.
- [SETUP-004](setup-004-safe-environment-update.md) should reuse this environment resolver when preflighting the installed app checkout, active workspace, command target, and gateway state.

## Touches

- `src/config/workspace.ts`
- `src/config/index.ts`
- `src/cli.ts`
- `src/gateway.ts`
- `src/gateway/path-env.ts`
- `src/gateway/service-ctl.ts`
- `src/commands/catalog.ts`
- `src/commands/status.ts`
- `src/setup/init.ts`
- `src/setup/templates/workspace/context/WORKSPACE.md`
- `scripts/dev-setup.mjs`
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
