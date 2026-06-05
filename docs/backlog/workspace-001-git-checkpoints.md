# 🦐 WORKSPACE-001: Simple Workspace Git Checkpoints

Status: review
Priority: P2
Area: Workspace

## Why

Shrimpy workspaces contain prompts, agent identity, skills, config, and durable habits that are easy to improve incrementally but uncomfortable to edit without a recovery path. A very small local git checkpoint layer would let users and agents inspect diffs and recover older prompt/config states without turning workspace tracking into a backup system.

The goal is not to version the whole workspace. The goal is to checkpoint the intentional workspace surface: files that define agents, prompts, skills, configuration, and durable operating habits, whether those files were written by a person, an agent, or both.

## Current State

- `shrimpy workspace track init` initializes a local git repo at the workspace root, writes the strict whitelist `.gitignore`, and creates an initial checkpoint commit.
- `shrimpy workspace track status [--json]` reports disabled, clean, dirty, or diagnostic checkpoint state.
- `shrimpy workspace track checkpoint --message <text> [--json]` creates a manual checkpoint commit and skips clean states.
- The gateway starts a periodic checkpoint loop. Every 15 minutes, it checks the workspace repo and creates an automatic checkpoint commit when checkpointable files changed.
- `shrimpy status` includes workspace checkpoint tracking status.
- Reference docs describe the command surface and the whitelist security boundary.
- Tests cover parent-repo isolation, whitelist behavior, CLI init/status/manual checkpoints, clean no-op checkpointing, and the periodic service tick.
- [VAULT-001](vault-001-default-workspace-collections.md) separately proposes a shared-vault git convention for durable user collections.

## Build

- Add minimal opt-in CLI commands for local workspace tracking:
  - `shrimpy workspace track init`
  - `shrimpy workspace track status --json`
  - `shrimpy workspace track checkpoint --message <text>`
- Initialize a local git repo at the workspace root only after explicit user action. Do not configure remotes or push behavior.
- Write a strict `.gitignore` that ignores everything by default and whitelists only the intended editable surface:
  - `.gitignore`
  - `profile/WORKSPACE.md`
  - `profile/SYSTEM.md`
  - `profile/USER.md`
  - `config/shrimpy.json`
  - `config/channels.json`
  - `agents/*/SOUL.md`
  - `agents/*/watches.json`
  - `agents/*/skills/**`
  - `skills/**`
- Consider whether `agents/*/context/**/*.md` belongs in the default whitelist. It is agent memory and prompt material, but it can also contain sensitive user details. If included, call that out clearly during setup and inspection.
- Keep `vault/` and `projects/` out of the default workspace checkpoint repo. Those directories may use their own explicit git repos or conventions.
- Add one periodic checkpoint loop instead of wiring checkpoint behavior into each command that might edit workspace files.
- When tracking is enabled and Shrimpy is running, wake about every 15 minutes and inspect the checkpoint repo.
- If checkpointable files changed since the last checkpoint, run the boring branch-commit flow: `git add -A` for checkpointable paths, then `git commit -m "checkpoint: automatic <timestamp>"`.
- Skip automatic and manual checkpoint commits when there is no diff.
- Keep the manual checkpoint command for users or agents that want an immediate named checkpoint.
- Surface tracking status in `shrimpy status`: disabled, enabled and clean, enabled with checkpointable changes, or enabled with git diagnostics.

## Boundaries

- Do not track `state/`, especially `state/pi/auth.json` and `state/pi/models.json`.
- Do not track `runtime/`, `channels/`, `media/`, `agents/*/sessions/`, or generated turn context.
- Do not make this a sync, backup, remote publishing, pruning, or conflict-resolution feature.
- Do not add migration or compatibility code for existing workspaces. The command can initialize tracking for the current workspace shape only.
- Do not hide normal git behavior. Users should be able to inspect the repo with `git status`, `git diff`, `git log`, and `git restore`.
- Do not wire each Shrimpy mutation command into checkpointing. Automatic checkpoints should come from the periodic repo scan.
- Do not add a file watcher for this slice. A periodic check is enough.
- Do not add automatic checkpoint retention or snapshot refs in this slice. See [WORKSPACE-002](later/workspace-002-tiered-checkpoint-retention.md).

## Notes

- Related: [VAULT-001](vault-001-default-workspace-collections.md) covers a separate git convention for shared saved collections. Workspace checkpoints should not replace that user-data workflow.
- Related: [WORKSPACE-002](later/workspace-002-tiered-checkpoint-retention.md) covers later tiered automatic retention if normal branch history becomes too noisy.
- Related: [security.md](../reference/security.md) should mention the tracking boundary once this feature ships.
- Likely files: `src/commands/catalog.ts`, a new `src/commands/workspace.ts` or equivalent command module, setup/workspace path helpers, `src/commands/status.ts`, gateway startup/shutdown wiring, and tests around generated `.gitignore`, dirty detection, clean no-op checkpointing, and periodic checkpoint creation.

## Done

- Users can opt into local workspace tracking through a CLI command.
- The generated `.gitignore` tracks only the intended workspace-definition surface by default.
- The automatic checkpoint loop checks about every 15 minutes while Shrimpy is running.
- Automatic checkpoints are created only when checkpointable files changed.
- Manual checkpoint commands commit meaningful checkpointable changes and skip clean states.
- Sensitive state, runtime logs, sessions, channels, and media stay untracked by default.
- `shrimpy status` shows whether workspace checkpointing is enabled and healthy.
- Tests cover initialization, whitelist behavior, clean no-op checkpointing, and periodic checkpoint creation.
