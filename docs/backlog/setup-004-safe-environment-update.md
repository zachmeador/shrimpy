# 🦐 SETUP-004: Safe Environment Update

Status: draft
Priority: P1
Area: Setup
Depends On: none

## Why

`shrimpy update` should update an installed Shrimpy environment without stranding the user in a workspace the mechanic can no longer operate. The key safety property is preserving a valid model path for the mechanic: if `state/pi/auth.json`, `state/pi/models.json`, `config/shrimpy.json` model policies, or the mechanic's selected policy become unusable, the mechanic cannot use `workspace-migration` to inspect the new version and repair version-driven workspace issues.

The updater should therefore protect model config validity first, then let the mechanic's migration skill handle workspace-shape drift with normal inspectable commands and user approval.

## Current State

- `shrimpy update --dry-run` now exists as a safe preflight surface in the command registry and catalog. Apply mode is still intentionally unsupported until the update source, snapshot/restore, and gateway lifecycle semantics are implemented.
- Model policy resolution already has inspectable CLI coverage through `shrimpy models`, `shrimpy models policies show <name>`, and `shrimpy models resolve --policy <name> --json`.
- The mechanic has a source-default `workspace-migration` skill that inventories installed source, workspace files, risks, and checks before applying user-approved workspace changes.
- The gateway can be installed as a per-user service and may be running watches or chat delivery while the CLI source and generated `dist/cli.js` change.
- The local binary points at this checkout's generated `dist/cli.js`, so changing source and rebuilding can immediately alter the live CLI for this machine.

## Build

- Add `shrimpy update` as a workspace/runtime command with `--dry-run` and `--json`.
- Preflight the current environment before touching the install: resolve the active workspace, installed app checkout, current version/commit, current binary target, and the mechanic's effective model policy. Confirm at least one mechanic-usable model resolves through the same model/auth registry the next mechanic session will use.
- Inspect gateway state before update with the same status path used by `shrimpy gateway status`: whether the service is installed, whether it is running, active session or watch activity when available, and the command needed to restart it.
- Snapshot the model-critical files before update: `config/shrimpy.json`, `state/pi/auth.json`, `state/pi/models.json`, and any agent config that selects the mechanic model policy. The snapshot can be a workspace checkpoint when tracking is enabled, plus an explicit update-local backup for files outside tracked scope.
- If the gateway is running, stop or pause it before replacing the live CLI/build output so it cannot run mixed old/new code during the update. Record whether it was running so the command can restore that runtime state after validation.
- Apply the app update through the installation mechanism that owns this checkout, then rebuild or relink the live CLI only after the source update succeeds.
- After update, run the same model-policy checks again. If the mechanic cannot resolve a usable model, restore the model-critical files from the snapshot and report the exact failing policy/candidate/auth reason. Do not continue into workspace migration while the mechanic model path is broken.
- Restart the gateway only after the post-update model check passes. If restart fails, leave the gateway stopped, report the exact command/log path to inspect, and still provide the mechanic migration handoff if the mechanic model path is valid.
- When model checks pass, launch or print an exact next command for the mechanic with `--skill workspace-migration`, including the previous and new version/commit when known, so the mechanic can inventory workspace changes and ask for approval before applying them.

## Boundaries

- `shrimpy update` protects the ability to run the mechanic; it does not automatically migrate workspace files.
- Preserve the user's gateway runtime intent: if it was stopped before update, leave it stopped; if it was running, restart it only after validation succeeds.
- Do not rewrite, normalize, or discard user model configuration just because newer defaults differ. Preserve valid user choices.
- Do not print secrets from auth files in normal or JSON output.
- Do not add legacy compatibility shims for old workspace shapes. Version-driven workspace changes belong in the mechanic migration inventory and explicit follow-up edits.
- Avoid destructive package-manager or git cleanup. If the install checkout is dirty or the update source is ambiguous, stop with a clear command plan rather than forcing the tree clean.

## Touches

- `src/commands/registry.ts`
- `src/commands/catalog.ts`
- New update command module under `src/commands/`
- Gateway status/control helpers from `src/commands/gateway.ts` or the underlying gateway service layer
- Model-policy validation helpers near `src/sessions/models.ts` or a small setup/runtime helper
- `src/setup/templates/mechanic/skills/workspace-migration/SKILL.md` only if it needs a tighter handoff shape
- CLI catalog/help tests and update-command tests

## Notes

- Dual macOS/Linux gateway support should reuse `src/gateway/service-ctl.ts` rather than teaching `shrimpy update` direct `systemctl` or `launchctl` behavior. The service layer already maps Linux to `systemd --user`, macOS to a per-user LaunchAgent, and unsupported hosts to manual gateway management.
- The tricky part is lifecycle semantics, not command syntax: systemd has active/enabled states and daemon reloads; launchd has installed/bootstrapped/kickstarted states and user-domain failures. The update command needs a small platform-neutral result shape such as `{ manager, wasInstalled, wasRunning, stopped, restartAttempted, restartOk }`.
- Treat unsupported/manual platforms as a supported dry-run path and a guarded update path that prints manual `shrimpy-gateway` stop/start instructions, rather than pretending service control exists.

## Done

- `shrimpy update --dry-run` reports the install target, current/available version or commit, model-critical files to protect, and whether the mechanic model policy currently resolves.
- A normal update refuses to proceed when the current mechanic model path is invalid, with output naming the failing model policy and the CLI command to inspect or fix it.
- After a successful source update, the command verifies the mechanic can still resolve a usable model before recommending or opening the migration session.
- A running gateway is stopped or paused before live CLI/build replacement and restarted only after post-update model validation passes; a stopped gateway remains stopped.
- If post-update model validation fails, model-critical files are restored from the pre-update snapshot and the command exits nonzero without running workspace migration.
- If gateway restart fails after an otherwise valid update, the command exits nonzero or warning-coded with the gateway left stopped, the model path verified, and the migration handoff command still printed.
- JSON output includes machine-readable phases, protected paths, version/commit refs, model validation result, gateway pre/post state, migration handoff command, and any restore action taken.
- Tests cover dry-run output, preflight refusal, post-update model validation failure with restore, dirty-checkout refusal, running-gateway stop/restart behavior, gateway restart failure reporting, and successful handoff to `workspace-migration`.
