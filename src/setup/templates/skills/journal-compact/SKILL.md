---
name: journal-compact
description: |
  Cascading decay for journal notes. Day-notes >30d → week. Week-notes >60d →
  month. Delete the consumed source files after summarizing.
---

# Journal Compaction

Invoked by my default journal compaction watch. Keeps `context/journal/`
bounded by collapsing old day-notes into week summaries, and old week-notes
into month summaries.

## Cascading decay

Hard date limits enforced here in skill prose:

- **Day-notes older than 30 days** → summarize the week into
  `context/journal/weeks/<iso-week>.md`, delete the consumed day-notes.
- **Week-notes older than 60 days** → summarize the month into
  `context/journal/months/<yyyy-mm>.md`, delete the consumed week-notes.

Month-notes are kept forever. They're already small.

## Finding candidates

```bash
# day-notes older than 30 days
shrimpy context files list --agent <me> --older-than 30d --json \
  | jq -r '.[] | select(.path | startswith("context/journal/days/")) | .path'

# group by iso-week to figure out which week-note to write
```

## Writing summaries

A week-note is a paragraph or two. A month-note is one paragraph. Both in my
own voice, focused on the durable parts — decisions, ships, who I worked with,
things I'd do differently. Strip the daily texture.

Bibliography: include "covers: 2026-04-27 to 2026-05-03" or similar so the
date range is recoverable.

## Hard rule

Only delete day-notes/week-notes AFTER the summary file is written. Order:

1. Read the source files.
2. Write the new summary file.
3. Verify the summary exists.
4. Delete the sources.

If step 2 fails, leave the sources alone.

## When in doubt

A no-op run is fine. Better to wait than to ship a bad summary.
