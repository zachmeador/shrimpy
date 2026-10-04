---
name: shrimpy-hygiene-audit
description: Use when reviewing Shrimpy workspace hygiene, stale watches, dead channels, context bloat, skill validity, or uninspectable automation without changing anything.
---

# Hygiene Audit

Use this mechanic-owned skill for a read-only janitor pass over Shrimpy workspace health. Produce mechanical evidence and recommendations; do not clean, delete, compact, disable, update, migrate, or rewrite anything during the audit.

## Output

Write one dated Markdown report under `agents/mechanic/vault/audits/`, for example `agents/mechanic/vault/audits/2026-06-11-hygiene.md`.

Use this shape:

- scope and sources inspected;
- changes since the prior hygiene audit, if a prior report exists;
- findings with evidence paths, commands, dates, and impact;
- recommended next action for each finding, stating whether it needs explicit user approval;
- checked, found nothing for clean areas;
- unresolved questions and skipped areas.

Reply with the report path and a short TLDR of the highest-priority findings. If running from a user-scheduled watch, send a channel message only when there are findings or an actionable failure. If clean, write the report and leave the quiet no-op in watch history.

## Inspect

Stay inside the Shrimpy workspace and declared Shrimpy-managed systems unless the user grants more scope. Start with normal CLI surfaces and file evidence:

```bash
shrimpy status
shrimpy skills validate --agent mechanic
shrimpy channels
shrimpy agent list
shrimpy watches --agent shrimpy
shrimpy watches --agent mechanic
find profile agents skills config state runtime channels media -maxdepth 4 -type f | sort | head -240
```

Record unknowns when a command, permission, path, or tool is missing. If a needed signal has no CLI path, note a small CLI gap instead of adding audit-only runtime behavior.

## Review Areas

Check for concrete hygiene issues:

- failing, noisy, duplicate, or stale watches from run history and watch definitions;
- dead channels, empty channels with live bindings, orphaned surface threads, or channels whose membership no longer matches their purpose;
- context bloat, oversized prompt-loaded files, duplicated blocks, stale identity material, and raw logs used as durable prompt material;
- `shrimpy skills validate` failures, skill id/name mismatches, unavailable skills, shadowed skills, or excessive effective skill sets;
- mixed ownership, such as one agent's identity, memory, reports, projects, or watch instructions living under another agent or shared profile files;
- uninspectable automation, shell snippets with unclear owner, and generated files with no path back to a command, watch, session, or report;
- reports, research notes, and projects that should move from prompt-loaded `context/` into `vault/` or `projects/`.

Include a short opportunity note only when tied to concrete observed repetition. Open-ended ideas belong in normal mechanic sessions or pattern guidance, not in a hygiene audit.

## Boundaries

- Recommend only. Ask for explicit approval before cleanup, compaction, deletion, watch changes, channel changes, skill edits, or migrations.
- Do not crawl personal directories beyond the workspace and declared managed systems.
- Do not create bundled watches or hidden cleanup daemons.
- Do not treat context size alone as failure. Show why the content is stale, duplicated, misplaced, or costly.
- Do not paste large logs or private messages into the report. Summarize evidence with source pointers.
