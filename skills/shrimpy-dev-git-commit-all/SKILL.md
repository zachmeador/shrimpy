---
name: shrimpy-dev-git-commit-all
description: Use when a Shrimpy checkout has many mixed local changes and the user wants Codex to spend light effort grouping, staging, and committing everything that reasonably belongs together. Prefer this for "commit all", "sort these changes into commits", "checkpoint this worktree", or similar requests where large related commits are acceptable.
---

# Shrimpy Dev Git Commit All

Use this source skill when the user wants the current Shrimpy worktree turned into reasonable git commits without a deep archaeology pass.

## Goal

Leave the worktree clean or nearly clean by grouping local changes into coherent commits. Spend light effort: enough to avoid mixing obviously unrelated work, secrets, generated junk, or broken staging state; not enough to perfectly split every hunk.

## Workflow

1. Confirm the Shrimpy project root. Read `AGENTS.md` and `AGENTS-PRIVATE.md` if present.
2. Inspect the full local state:
   - `git status --short --branch`
   - `git diff --stat`
   - `git diff --name-status`
   - `git diff --cached --stat`
   - `git diff --cached --name-status`
   - `git ls-files --others --exclude-standard`
3. Skim diffs by area until the grouping is clear. Prefer targeted reads such as `git diff -- src/commands docs/reference` over exhaustive full-diff reading when the change set is large.
4. Choose simple commit groups. One to three commits is usually enough. Large commits are fine when the files tell one story.
5. Stage and commit each group. Use whole-file staging by default. Use patch staging only when unrelated hunks are obvious and cheap to separate.
6. Re-check `git status --short --branch` after each commit, then continue until no commit-worthy changes remain or only intentionally uncommitted files remain.

## Grouping Heuristics

- Keep implementation, focused tests, docs, changelog, backlog, and generated mirrors together when they describe the same shipped behavior.
- Split changes when they touch different product areas, have different risk profiles, or would produce a confusing commit message.
- Keep source skill edits with generated skill mirrors from `npm run build:skills`.
- Keep formatting-only or mechanical churn separate only when it is broad enough to obscure behavior.
- Do not split a file into many hunks merely to make small commits. If the hunks are related enough, commit the file once.

## Safety

- Do not reset, checkout, clean, remove, or overwrite user changes unless the user explicitly asked for that exact destructive action.
- Do not commit private credentials, live workspace state, bulky generated output, editor temp files, or accidental files from `.shrimpy/`, `runtime/`, `state/`, `channels/`, or `media/`.
- Stop and ask if a file looks secret-bearing, legally sensitive, unexpectedly huge, or unrelated to the repository.
- If pre-existing staged changes exist, treat them as user state: inspect them and either include them in the appropriate group or leave them staged with a clear note if they do not fit.

## Checks

Run the smallest useful verification before or after committing when it is practical. For source changes, prefer `npm run build` or targeted tests. For docs or skill-only commits, validation can be as light as reviewing `git diff --check` and any relevant generated sync command. If checks are skipped, say why.

## Final Report

Report the commits made, the grouping rationale, checks run, and any remaining uncommitted files. Keep it brief.
