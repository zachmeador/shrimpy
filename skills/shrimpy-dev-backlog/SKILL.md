---
name: shrimpy-dev-backlog
description: Use when creating, updating, triaging, or closing Shrimpy backlog notes in docs/backlog, including IDs, filenames, status, priority, dependencies, proposals placement, and index entries.
---

# 🦐 Shrimpy Dev Backlog

Keep the backlog a planning map of concrete work and open decisions. Use the writing guide for prose.

## Placement And Lifecycle

`docs/backlog/index.md` is the source of truth for listed items. Keep it to a short placement/status legend and tables.

- The small now/soon queue lives directly in `docs/backlog/`. Place an item there only when the maintainer explicitly schedules it for current or near-term work.
- Unscheduled items live in `docs/backlog/proposals/`, including accepted or high-priority work.
- Use `draft` for an unsettled direction, `todo` for one accepted enough to implement, and `review` for implementation awaiting maintainer review. Status and priority do not schedule work. Preserve explicit maintainer markers and retention requests.
- When work is complete, carry its durable information into implementation, reference docs, or the changelog, then delete the note and index row in its final implementation commit unless the maintainer asks to retain them.

## Write Or Update An Item

1. Read root instructions, private context if present, the backlog index, and nearby notes. Inspect Git status and preserve unrelated edits.
2. For a new item, inspect existing queue and proposal IDs, choose the next number in its area, and use `area-000-short-kebab-title.md`. Use the uppercase ID in its title and index row, for example `CTX-014`. Start in proposals as `draft` unless the user has accepted the direction.
3. Keep planning metadata in YAML frontmatter:

   ```yaml
   ---
   status: draft
   priority: P2
   area: Context
   depends_on: []
   ---
   ```

   `depends_on` is a list of backlog IDs or short named prerequisites, without Markdown links. Keep metadata out of body labels.
4. Explain the problem, proposed work, and completion criteria at the level the decision needs. Include or refresh `## UX Implications` with affected behavior, commands, defaults, and regressions to avoid; one sentence is enough when there is no user-facing effect. Use other sections only when they add information.
5. Update the matching index row. When moving notes, repair relative links in the note and inbound links. Keep dependencies linked in the index when practical.

Preserve meaning when editing. Name unresolved decisions, and state boundaries that prevent scope creep or unsafe data changes. Do not introduce migration or compatibility requirements unless the user requests them.

## Verify

Review `git diff -- docs/backlog skills/shrimpy-dev-backlog`, including staged changes. Check metadata, index parity, dependency links, and moved-file links. Code tests are unnecessary for backlog-only edits; follow skills maintenance when editing this skill.
