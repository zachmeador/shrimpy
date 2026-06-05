# 🦐 WORKSPACE-002: Tiered Workspace Checkpoint Retention

Status: todo
Priority: P3
Area: Workspace
Depends On: workspace checkpoint tracking

## Why

Workspace checkpoint tracking intentionally keeps the first implementation simple: periodic branch commits and no pruning. That is enough to get recovery value without building a miniature backup system.

Long-running Shrimpy environments may eventually accumulate too many automatic checkpoint commits. If that becomes a real problem, automatic checkpoints can move to a separate git ref layout with recent, hourly, daily, and monthly tiers so old automatic history can be pruned without rewriting normal branch history or deleting manual checkpoints.

## Current State

- The active checkpointing plan uses normal branch commits for both manual and automatic checkpoints.
- There is no automatic checkpoint pruning or tiered retention plan in the active slice.
- Pruning old automatic commits from a normal branch history would require history rewriting, especially when manual commits are mixed with automatic commits.

## Build

- Store automatic checkpoints as snapshot refs outside normal branch history so they can be pruned without rewriting manual checkpoint commits.
- Keep manual checkpoints as durable normal branch commits unless the user explicitly chooses a different model later.
- Use tiered automatic snapshot refs for long-running workspaces:
  - `refs/shrimpy/checkpoints/auto/recent/<timestamp>` for raw 15-minute snapshots.
  - `refs/shrimpy/checkpoints/auto/hourly/<yyyy-mm-ddThh>` for one checkpoint per hour.
  - `refs/shrimpy/checkpoints/auto/daily/<yyyy-mm-dd>` for one checkpoint per day.
  - `refs/shrimpy/checkpoints/auto/monthly/<yyyy-mm>` for one checkpoint per month.
- Run a daily cleanup that promotes representative recent snapshots into hourly/daily/monthly refs and deletes automatic refs outside the configured retention caps.
- Use reasonable first retention defaults: raw 15-minute automatic snapshots for 24 hours, hourly snapshots for 14 days, daily snapshots for 90 days, and monthly snapshots for 36 months.
- Expose retention status and snapshot refs through inspectable CLI output.

## Boundaries

- Do not implement this until the simple branch-commit checkpoint flow exists and proves useful.
- Do not prune automatic checkpoints by rewriting normal branch history.
- Do not remove manual checkpoints by default.
- Do not add remote sync, backup publishing, or cross-machine conflict resolution.

## Done

- Automatic checkpoints can be retained and pruned through recent/hourly/daily/monthly tiers.
- Pruning old automatic checkpoints does not rewrite normal workspace branch history.
- Manual checkpoints remain durable by default.
- CLI/status output explains the active retention tiers and current automatic snapshot counts.
