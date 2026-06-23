---
name: shrimpy-dev-backlog-worktree-session
description: Use only when the user or another agent explicitly instructs Codex to use this exact skill, create a backlog implementation worktree, or run a backlog worktree session. Do not infer this skill from ordinary Shrimpy backlog implementation requests.
---

# Shrimpy Dev Backlog Worktree Session

Use this source skill only after an explicit user or agent instruction asks for this skill, a backlog implementation worktree, or a backlog worktree session. Do not use it just because the task names a backlog item.

The goal is to let multiple agents work without trampling each other, while making the merge point explicit and user-controlled.

## Preflight

1. Confirm the Shrimpy project root. Read `AGENTS.md`, `AGENTS-PRIVATE.md` if present, `docs/backlog/index.md`, and every backlog note named by the user.
2. Inspect local state before creating anything:
   - `git status --short --branch`
   - `git worktree list`
   - `git branch --list 'codex/*'`
3. Identify the intended landing target and base branch. If the user did not name one, default to the current checkout branch when it is clean and appropriate. Use `main` when the work is ready for direct mainline preparation or the user asks for it. Use another running branch, including `wip`, only when the user names it, the current checkout is already on it, or repo state makes that target clearly relevant. Treat `wip` as an optional running branch for experimental paths, not a required default.
4. Identify likely touched areas from the backlog note's `Touches`, `Build`, `Done`, and dependency sections. Search source when the note is vague.
5. Alert the user before starting if the item looks wide-spanning or likely to collide with other agents. Name the likely conflict paths and recommend either single-threaded work or a coordinator branch.

## Parallelism Triage

Treat a backlog item as parallel-friendly when it has a narrow owner, clear touched files, few dependencies, and no shared setup/build/runtime policy changes.

Warn that work should probably be single-threaded or carefully coordinated when any of these are true:

- several backlog notes touch the same files, commands, templates, docs indexes, or tests;
- the work changes central surfaces such as `src/cli.ts`, `src/commands/catalog.ts`, `src/app/runtime.ts`, `src/sessions/`, `src/context/`, `src/setup/templates/`, `src/skills/`, `package.json`, lockfiles, root docs, generated skill mirrors, or release/build tooling;
- the backlog lacks a concrete `Touches` section and implies architecture, lifecycle, data model, setup, or command-surface changes;
- the implementation is likely to cross more than three top-level areas or more than about ten source/doc files;
- the item depends on unresolved product direction or a preceding backlog item that another agent is actively changing.

If the user assigns several backlog items, split them into one worktree per independent item or tight dependency cluster. Do not bundle unrelated backlog items into one branch merely because they were mentioned in the same session.

## Create The Worktree

Use stable names that include the backlog ID or short slug:

```bash
git worktree add ../shrimpy-wt-<backlog-id-or-slug> -b codex/<backlog-id-or-slug> <base-branch>
cd ../shrimpy-wt-<backlog-id-or-slug>
git status --short --branch
```

If the branch, path, or worktree already exists, inspect it instead of overwriting it. If the main checkout has uncommitted changes, do not copy them into the worktree unless the user explicitly says they belong to the backlog work.

Base branch rule:

- Landing to a named branch: create the worktree branch from that branch after confirming it exists locally or remotely.
- Landing to the current branch: create the worktree branch from `HEAD` or the branch name, whichever makes the base clearer in the handoff.
- Landing to `main`: create the worktree branch from `main`.
- Landing to `wip`: create the worktree branch from `wip` only when `wip` is the intended target and exists.
- Unsure: use the current clean branch as the base and tell the user that a different final target may require a rebase or cherry-pick later.

## Work In Isolation

Make all implementation edits inside the worktree. Keep the original checkout untouched except for commands that inspect branch/worktree state.

Use Shrimpy's normal developer skills as needed for backlog, docs, changelog, release, or live-workspace work. When editing root `skills/`, run `npm run build:skills` so `.agents/skills`, `.claude/skills`, and `CLAUDE.md` mirror the source skills.

Run the smallest useful checks in the worktree. The local `shrimpy` binary may point at another checkout's ignored `dist/`; prefer worktree-local commands such as `npm run build`, `npm test`, and `node dist/cli.js ...` when verifying this branch.

Commit completed work on the worktree branch unless the user asked for an uncommitted handoff. Keep commits coherent enough to cherry-pick if the target changes.

## Merge Handoff

Only the user can approve the final merge out of the worktree. The agent may prepare the branch, summarize it, and recommend a landing target, but must not self-approve the merge into the target branch.

Before requesting approval, report:

- worktree path, branch, base branch, and intended landing target;
- backlog item IDs covered;
- commits and changed-file summary;
- checks run and skipped;
- known merge risks, especially shared files touched by other active worktrees;
- exact recommended landing shape: merge, squash merge, or cherry-pick.

For `main`, do not merge a branch based on another target directly into `main`. Create or use a main-based branch and cherry-pick the relevant commits after the user approves that landing strategy.

## Cleanup

Clean up after the user-approved merge succeeds or after the user explicitly abandons the work:

```bash
git worktree remove ../shrimpy-wt-<backlog-id-or-slug>
git worktree prune
git branch -d codex/<backlog-id-or-slug>
```

Use `git branch -D` only when the user explicitly approves deleting an unmerged branch, or when a squash/cherry-pick landing has already been verified and the user approves removing the leftover branch ref.

Do not remove a worktree that contains the only copy of unmerged work. If approval is pending, leave the worktree in place and give the user the path, branch, pending decision, and cleanup command to run after landing. Do not leave stale worktrees after the decision is made.
