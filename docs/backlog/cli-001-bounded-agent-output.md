# 🦐 CLI-001: Bounded Agent-Facing CLI Output

Status: review
Priority: P2
Area: CLI
Depends On: none

## Why

Agents read CLI output straight into working context, and current guidance steers them to the most expensive form. Measured on the reference workspace 2026-06-12: `shrimpy watches --json` was 26,164 chars against 734 chars plain, and `shrimpy channels --json` was 56,736 chars against 317 chars plain — 35–180x. Message-count limits do not bound bytes either: a live `shrimpy channels read maintenance --limit 15` over long agent messages came back around 13k chars. Session compaction now bounds what a run starts with; the commands an agent runs mid-turn are the other half, and the repo itself teaches the expensive habit.

## Current State

- `docs/reference/cli.md` frames JSON as the agent mode: "Inspection commands intended for agents should expose `--json`."
- The `journal-daily` template (`src/setup/templates/skills/journal-daily/SKILL.md`) pipes `channels --json` through jq, which is fine, then loops `shrimpy channels read "$channel" --limit 50 --json` with the raw output going to the model.
- Mechanic skill templates (`watches`, `channel-routing`, `add-agent`, `workspace-migration`) suggest bare `--json` inspection commands; `memory-management` pipes through jq.
- Turn-context inspect hints emit `--json` commands (`src/context/turn/workers.ts`, `src/context/turn/session-status.ts`).
- `channels list --json` calls `listChannelSummaries(runtime, { includeActivity: json })` (`src/commands/channels-inspect.ts`), embedding recent requests, source records, full message origins, and inspect commands for every channel — most of the 57k.
- `watches --json` resolves the full `expectedWake` policy graph per watch × target channel × member agent (`src/watches/inspection.ts`).
- `channels read --limit` slices messages (`src/channels/service.ts`); the only flags are `--limit` and `--json`. No command output has byte/char bounding; the only clip helpers live in the turn-context subsystem (`src/context/turn/render.ts`).

## Build

- Rewrite the `cli.md` convention: plain output is the agent-facing default for inspection; `--json` is for piping into jq and scripts. Commands suggested to agents — skills, templates, turn-context `inspect` hints — use plain forms unless the snippet actually pipes.
- Sweep shipped templates to match: drop `--json` from the journal-daily read loop and lower its `--limit`; keep `--json` in mechanic skills only where output is piped or a small single object.
- Make turn-context inspect hints emit plain commands (`workers.ts`, `session-status.ts`).
- Slim `channels list --json` to the same summary content as plain list, with no per-channel activity block. Full activity stays on `shrimpy channels show <channel>`.
- Clip message bodies in plain `channels read` and `channels search` output with a shared helper (a few hundred chars per message, explicit truncation marker) and add `--full` to disable. JSON read output stays complete for pipes.

## Boundaries

- Do not gut the pipe-facing inspection surfaces: `watches --json` and `channels show --json` keep their full detail. The fix for their size is steering, not thinning.
- No global output-budget framework in `src/commands/framework.ts`; a shared clip helper is enough.
- Shipped templates and docs change here. Live workspace skills (for example the mechanic's `workspace-journal`) are workspace data; the mechanic retightens them after this lands.

## Notes

- [CTX-010](ctx-010-agent-watch-turn-context.md) attacks the same bloat from the context side: an agent-owned watch inventory in turn context removes the routine reason to run `watches --json` during journaling.
- `shrimpy sessions search` follows the same rule for session search output: everything returned is truncated and source-pointed.
- Worker inspect hints now exist and may still use `--json`; align those when sweeping turn-context hints.

## Touches

- `docs/reference/cli.md`, `src/setup/templates/skills/journal-daily/SKILL.md`, the mechanic skill templates under `src/setup/templates/mechanic/skills/`, `src/context/turn/workers.ts`, `src/context/turn/session-status.ts`, `src/commands/channels-inspect.ts`, `src/channels/service.ts`, `src/channels/format.ts`, and tests.

## Done

- `cli.md` states the plain-first, JSON-for-pipes convention.
- `rg -n -e '--json' src/setup/templates src/context` shows only usages that pipe or return a small single object.
- `channels list --json` carries no per-channel activity; `channels show` keeps it.
- Plain `channels read` and `channels search` clip long bodies with a marker, and `--full` restores complete bodies.
- Tests cover the list/show activity split and read/search clipping, and updated templates pass `shrimpy skills validate`.
