---
name: shrimpy-workspace-migration
description: Use when preparing or carrying a Shrimpy workspace across Shrimpy versions, including upgrade checks, migration inventories, and user-approved workspace changes.
---

# Workspace Migration

Use this mechanic-owned skill when the user wants help moving an existing Shrimpy workspace across Shrimpy versions. The job is to discover what the installed Shrimpy version expects, compare that to the current workspace, inventory the needed changes, and ask the user to confirm before changing workspace state.

## Inspect The Installed Shrimpy

Start with inspectable commands:

```bash
shrimpy --version
command -v shrimpy
shrimpy status
```

Resolve the active workspace, Shrimpy app checkout, source directory, and docs directory from the `profile/WORKSPACE.md` local path breadcrumbs when present. If breadcrumbs are missing, trace `command -v shrimpy` through symlinks until the app checkout is clear. In the app checkout, inspect:

```bash
git status --short
git describe --tags --always
git log -1 --oneline
npm pkg get version
```

If the previous version or target version is known, compare it to the installed source with `git diff --name-status <old>..<new> -- src docs/reference test`. If it is not known, inspect the current source areas most likely to affect workspace shape: `src/setup/`, `src/config/`, `src/commands/`, `src/sessions/`, `src/skills/`, `src/workspace-checkpoints/`, and `docs/reference/`.

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
- exact workspace files or commands needed;
- risk level for each change;
- whether each item is required, optional, or no-op.

Prefer normal `shrimpy <command>` paths when they exist. Treat `config/`, `agents/`, `state/`, `runtime/`, `channels/`, and `media/` as user data. Do not delete, reset, rewrite, migrate, or disable anything while building the inventory.

## Confirm Before Moving

Stop after the inventory and ask the user to confirm the move. Include the exact changes you intend to make and whether you will create a checkpoint or backup first. Do not execute until the user clearly approves.

After approval, make the smallest needed edits, preserving existing user content. If workspace checkpoint tracking is enabled, create a checkpoint before changing files. If it is disabled and the change is broad, ask whether to enable checkpoint tracking or create a manual backup before continuing.

## Verify

After changes, run the smallest checks that prove the migrated workspace works:

```bash
shrimpy status
shrimpy skills validate --agent mechanic
shrimpy context --agent shrimpy --sections
```

Report the version moved to, files changed, commands run, checks passed, and any remaining manual decisions.
