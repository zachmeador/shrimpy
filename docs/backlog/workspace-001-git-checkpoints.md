# 🦐 WORKSPACE-001: Workspace Git Checkpoints

Status: todo
Priority: P2
Area: Workspace

## Why

Shrimpy workspaces contain prompts, agent identity, skills, config, and user
habits that are easy to improve incrementally but uncomfortable to edit without
a recovery path. A lightweight local git checkpoint layer would let users and
agents inspect diffs, recover older prompt/config states, and audit meaningful
workspace edits without turning runtime state into a database or backup system.

The goal is not to version the whole workspace. The goal is to checkpoint the
intentional workspace surface: files that define agents, prompts, skills,
configuration, and durable operating habits, whether those files were written
by a person, an agent, or both.

## Current State

- Workspace files are ordinary files under the configured workspace path.
- `shrimpy setup init` seeds profile files, config files, shared `vault/` and
  `projects/`, the default agent `SOUL.md`, context, and vault directories.
- Runtime state, channel logs, sessions, credentials, model metadata, media,
  and watch state live beside the editable workspace surface.
- There is no workspace-level git initialization, ignore whitelist, checkpoint
  command, or automatic checkpoint behavior.
- [VAULT-001](vault-001-default-workspace-collections.md) separately proposes a
  shared-vault git convention for durable user collections.

## Build

- Add opt-in CLI commands for local workspace tracking:
  - `shrimpy workspace track init`
  - `shrimpy workspace checkpoint --message <text>`
  - `shrimpy workspace checkpoint status --json`
- Initialize a normal git repo at the workspace root only after explicit user
  action. Do not configure remotes or push behavior.
- Write a strict `.gitignore` that ignores everything by default and whitelists
  only the intended editable surface:
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
- Consider whether `agents/*/context/**/*.md` belongs in the default whitelist.
  It is agent memory and prompt material, but it can also contain sensitive user
  details. If included, call that out clearly during setup and inspection.
- Keep `vault/` and `projects/` out of the default workspace checkpoint repo.
  Those directories may use their own explicit git repos or conventions.
- When a Shrimpy CLI command successfully modifies tracked workspace files,
  create a checkpoint for the resulting diff.
- If a Shrimpy command is about to remove or replace tracked
  workspace-definition files and there are uncommitted tracked changes,
  checkpoint the current state first. After the command succeeds, checkpoint
  the resulting tracked state.
- Skip commits when there is no diff. Show the changed tracked paths in command
  output and provide `--json` for agent workflows.
- Use boring, inspectable commit messages such as `checkpoint: update agent
  soul`, `checkpoint: update channels config`, or `manual: prompt experiment`.
- Surface tracking status in `shrimpy status`: disabled, enabled and clean,
  enabled with tracked changes, or enabled with git diagnostics.

## Boundaries

- Do not track `state/`, especially `state/pi/auth.json` and
  `state/pi/models.json`.
- Do not track `runtime/`, `channels/`, `media/`, `agents/*/sessions/`, or
  generated turn context.
- Do not make this a sync, backup, remote publishing, or conflict-resolution
  feature.
- Do not add migration or compatibility code for existing workspaces. The
  command can initialize tracking for the current workspace shape only.
- Do not hide normal git behavior. Users should be able to inspect the repo
  with `git status`, `git diff`, `git log`, and `git restore`.
- Do not auto-commit every file write from agents. Automatic checkpoints should
  be tied to known Shrimpy CLI mutations or explicit checkpoint commands.

## Notes

- Related: [VAULT-001](vault-001-default-workspace-collections.md) covers a
  separate git convention for shared saved collections. Workspace checkpoints
  should not replace that user-data workflow.
- Related: [security.md](../reference/security.md) should mention the tracking
  boundary once this feature ships.
- Likely files: `src/commands/catalog.ts`, a new `src/commands/workspace.ts` or
  equivalent command module, setup/workspace path helpers,
  `src/commands/status.ts`, and tests around generated `.gitignore`, dirty
  detection, and no-op checkpointing.

## Done

- Users can opt into local workspace tracking through a CLI command.
- The generated `.gitignore` tracks only the intended workspace-definition
  surface by default.
- Checkpoint commands commit meaningful tracked changes and skip clean states.
- Shrimpy CLI mutations create checkpoints only when tracking is enabled and a
  tracked file changed.
- Sensitive state, runtime logs, sessions, channels, and media stay untracked by
  default.
- `shrimpy status` shows whether workspace checkpointing is enabled and healthy.
- Tests cover initialization, whitelist behavior, clean no-op checkpointing, and
  checkpoint creation after representative tracked mutations.
