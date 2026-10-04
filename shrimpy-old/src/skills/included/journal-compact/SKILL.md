---
name: journal-compact
description: |
  Compact prompt-loaded journal breadcrumbs. Summarize older vault notes when
  useful, keep vault notes, and keep only tiny breadcrumbs in context.
---

# Journal Compaction

Invoked by my default journal compaction watch. Full journal material lives under `vault/journal/` and should be preserved. `context/journal.md` is the always-loaded memory index, so keep it tiny and path-oriented.

## Compaction

Hard date limits enforced here in skill prose:

- Day-note breadcrumbs older than 30 days -> replace them in `context/journal.md` with a week breadcrumb. If no week summary exists yet, summarize the relevant vault day-notes into `vault/journal/weeks/<iso-week>.md`.
- Week-note breadcrumbs older than 60 days -> replace them in `context/journal.md` with a month breadcrumb. If no month summary exists yet, summarize the relevant vault week-notes into `vault/journal/months/<yyyy-mm>.md`.

Vault day, week, and month notes are durable saved notes. Do not delete them during compaction.

## Finding Candidates

```bash
# day-notes older than 30 days
find vault/journal/days -type f -name '*.md' -mtime +30 2>/dev/null | sort

# week-notes older than 60 days
find vault/journal/weeks -type f -name '*.md' -mtime +60 2>/dev/null | sort
```

Group day-notes by ISO week and week-notes by month before writing a summary. Existing summaries can be reused; do not rewrite them unless they are clearly missing required coverage.

## Writing Summaries

A week-note is a paragraph or two. A month-note is one paragraph. Both are in my own voice, focused on the durable parts: decisions, ships, who I worked with, things I'd do differently. Strip the daily texture.

Bibliography: include `covers: 2026-04-27 to 2026-05-03` or similar so the date range is recoverable.

## Context Breadcrumb

After compaction, update `context/journal.md` so it points at the useful summary and drops stale daily or weekly breadcrumb lines from prompt-loaded context:

```markdown
- Week 2026-W18: one short durable takeaway. Details: vault/journal/weeks/2026-W18.md
- May 2026: one short durable takeaway. Details: vault/journal/months/2026-05.md
- Older journal details exist outside context under `vault/journal/`.
```

Keep `context/journal.md` small enough to be worth loading in every session. It should be an index and summary, not the journal itself. It can lightly indicate that older detailed material exists in `vault/journal/`, but should not list every old vault note.

## Hard Rules

Only prune old daily or weekly lines from `context/journal.md` after the replacement breadcrumb is written. Order:

1. Read the relevant vault notes and current `context/journal.md`.
2. Write the new vault summary if it is needed.
3. Update `context/journal.md` with the compact breadcrumb and a light pointer to older vault material when useful.
4. Verify the summary path and context breadcrumb.
5. Remove only the replaced breadcrumb lines from `context/journal.md`.

Never delete vault journal notes as part of compaction. If step 2 or 3 fails, leave `context/journal.md` and the vault notes alone.

## When In Doubt

A no-op run is fine. Better to wait than to ship a bad summary or bloat prompt-loaded context.
