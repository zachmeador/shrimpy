---
name: shrimpy-workspace-migration
description: Use when preparing or carrying a Shrimpy workspace across Shrimpy versions, including upgrade checks, migration inventories, and user-approved workspace changes.
---

# Workspace Migration

Use this mechanic-owned skill when the user wants help moving an existing Shrimpy workspace across Shrimpy versions. The job is to discover what the installed Shrimpy version expects, compare that to the current workspace, inventory the needed changes, ask the user to confirm, and carry the approved move through verification.

When `shrimpy update` opens the session with current and target refs plus an exact `shrimpy update apply --tag ... --commit ...` command, treat that handoff as an end-to-end update task. Do not stop after producing an inventory or ask the user to copy commands into another terminal.

## Inspect The Installed Shrimpy

Start with inspectable commands:

```bash
shrimpy --version
command -v shrimpy
shrimpy status
```

Resolve the active workspace, Shrimpy app checkout, source directory, and docs directory from the `context/WORKSPACE.md` local path breadcrumbs when present. If breadcrumbs are missing, trace `command -v shrimpy` through symlinks until the app checkout is clear. In the app checkout, inspect:

```bash
git status --short
git describe --tags --always
git log -1 --oneline
npm pkg get version
```

If the previous version or target version is known, compare it to the installed source with `git diff --name-status <old>..<new> -- src docs/reference test`. If it is not known, inspect the current source areas most likely to affect workspace shape: `src/setup/`, `src/config/`, `src/commands/`, `src/sessions/`, `src/skills/`, `src/workspace/checkpoints/`, and `docs/reference/`.

## Inventory Workspace Impact

Before proposing changes, inspect the active workspace:

```bash
shrimpy workspace track status
find profile agents skills config state -maxdepth 4 -type f | sort | head -240
```

Build a short inventory with:

- installed Shrimpy version and source commit;
- previous or target version if known;
- source changes that appear relevant to workspace files, config, agents, skills, watches, channels, sessions, state, or runtime;
- current gateway manager, installed/running state, workspace and app-checkout bindings, health, and log path;
- exact workspace files or commands needed;
- risk level for each change;
- whether each item is required, optional, or no-op.

Prefer normal `shrimpy <command>` paths when they exist. Treat `config/`, `agents/`, `state/`, `runtime/`, `channels/`, and `media/` as user data. Do not delete, reset, rewrite, migrate, or disable anything while building the inventory.

## Plan The Gateway Lifecycle

Treat the gateway as part of every version move. During inventory, inspect it without changing its state:

```bash
shrimpy gateway status
shrimpy gateway logs --path
```

Record whether the gateway was installed and whether it was running before the move. Also record its service manager, workspace and app-checkout bindings, PID and heartbeat health, surface health, and any warnings. Preserve that runtime intent: a stopped gateway stays stopped, while a running gateway is restarted only after the new application and workspace checks pass.

Include these steps in the proposed migration plan:

1. Immediately before replacing application code or generated runtime files, stop a running managed gateway with `shrimpy gateway stop`.
2. Run `shrimpy gateway status` and confirm that the old gateway process no longer owns the workspace. Do not continue through a mixed old/new runtime.
3. Run the exact tagged apply command from the update handoff. Do not substitute another tag or a branch ref.
4. Continue through the newly installed CLI and apply the approved workspace changes.
5. If the source diff changes gateway service definitions, runtime paths, or environment setup, refresh the installed service with `shrimpy gateway install` before starting it.
6. If the gateway was running before the move, start it with `shrimpy gateway start`. If it was stopped, leave it stopped.
7. Verify the resulting process, workspace and app bindings, heartbeat, and surfaces with `shrimpy gateway status`.
8. If startup or health validation fails, inspect the path from `shrimpy gateway logs --path`, leave the gateway stopped, and report the exact failure and recovery command. Do not repeatedly restart an unhealthy service.

For a manually managed gateway, identify and present the exact stop and start commands during inventory. Do not replace live application code until the user confirms the old manual process has stopped.

## Skill Migration Is High Risk

Treat `skills/` and `agents/<id>/skills/` as user-authored workspace state. Before changing any skill, inspect package state and modified status:

```bash
shrimpy skills list --agent <id> --json
shrimpy skills validate --agent <id> --json
```

Preserve user-created skills by default. Do not overwrite, rename, delete, or merge custom skills unless the user explicitly approves the exact change.

For managed included package copies, unmodified copies can be refreshed after approval. Modified copies require an explicit keep, replace, or review decision. Default to keep.

Shrimpy-owned `shrimpy-*` skills are product how-to packages. If one has user modifications, stop the migration and ask whether to overwrite it with the Shrimpy package copy or move the modified copy to a backup path before replacing it. Do not continue until the user chooses.

## Confirm Before Moving

Stop after the inventory and present one concise migration plan. Include the exact changes you intend to make, the gateway stop/start sequence, and whether you will create a checkpoint or backup first. Ask for one approval covering that concrete plan. A broad but clear response such as "go ahead", "do it", or "migrate it" authorizes every listed step; do not ask again for routine commands already covered by that approval.

Pause again only when you discover a materially consequential decision that was not in the approved plan, such as a destructive action, an auth or secret choice, a conflict with modified user content, or a broader workspace change. Explain the new choice and its impact before proceeding.

After approval, make the smallest needed edits, preserving existing user content. If workspace checkpoint tracking is enabled, create a checkpoint before changing files. If it is disabled and the change is broad, ask whether to enable checkpoint tracking or create a manual backup before continuing.

If the update was launched from a mechanic TUI, that session may still be running the previously loaded application code after the tagged app swap. It can finish the migration with the new CLI commands. At the end, tell the user to exit and reopen the mechanic so the next session runs entirely on the new release.

## Verify

After changes, run the smallest checks that prove the migrated workspace works:

```bash
shrimpy status
shrimpy skills validate --agent mechanic
shrimpy context --agent shrimpy --sections
shrimpy gateway status
```

Report the version moved to, files changed, commands run, checks passed, the gateway's before/after state, and any remaining manual decisions.
