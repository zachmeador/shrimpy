---
name: shrimpy-dev-backlog
description: Use when creating, updating, triaging, or closing Shrimpy backlog notes in docs/backlog, including choosing IDs, filenames, status, priority, dependencies, proposals/ placement, and index entries.
---

# Shrimpy Dev Backlog

Use this Shrimpy developer skill when working with `docs/backlog/` project-state notes.

## Goal

Keep the backlog useful as a small planning map: concrete enough for an agent to build from, clear about priority and uncertainty, and separate from stable docs and release notes.

## Files

- `docs/backlog/index.md` is the source of truth for listed backlog items.
- Keep `docs/backlog/index.md` to the status legend and backlog tables.
- Active backlog notes live directly in `docs/backlog/`.
- Candidate problem definitions and solution sketches that are not yet accepted as backlog work live in `docs/backlog/proposals/`.
- Completed work belongs in git history, stable docs, and the changelog when user-visible; do not keep completed planning notes active unless the maintainer asks.

## Naming

Use the common backlog filename shape for new notes:

```text
area-000-short-kebab-title.md
```

Examples: `setup-003-opt-in-watch-seeding.md`, `surface-006-chat-command-parity.md`, `ctx-010-agent-watch-turn-context.md`.

Choose the next number in that area by inspecting existing active and `proposals/` notes. Keep the ID uppercase in the title and index, for example `SETUP-004`, while keeping the filename lowercase. Older short filenames such as `app-001.md` and `code-001.md` are existing exceptions, not the preferred pattern for new notes.

## Status And Priority

- New backlog notes start as `draft` in `docs/backlog/proposals/` unless the user explicitly says the item is accepted, planned, or ready for build.
- Use `todo` only when the direction is accepted enough that an agent can implement it without re-deciding the product shape, and keep accepted items directly in `docs/backlog/`.
- Use `review` when implementation is ready for maintainer review but the backlog item has not been closed out.
- Use `proposals/` for uncertainty about whether or how to pursue an item, not merely low priority or delayed timing.
- Priority does not determine placement: an accepted `P3` item may live in the active backlog, while an unresolved `P1` or `P2` proposal remains in `proposals/`.

## Workflow

1. Read `AGENTS.md`, `AGENTS-PRIVATE.md` if present, `docs/backlog/index.md`, and the nearest existing backlog notes for the same area.
2. Preserve uncommitted user edits. Inspect `git status --short` before editing and avoid rewriting unrelated backlog rows or notes.
3. For a new item, choose the area, next ID, filename, status, priority, and dependencies before writing the note.
4. Write the note with the existing backlog shape:
   - Begin with YAML frontmatter for planning metadata:

     ```yaml
     ---
     status: draft
     priority: P2
     area: Context
     depends_on:
       - CTX-013
     ---
     ```

   - Keep `status`, `priority`, `area`, and `depends_on` in frontmatter rather than body labels such as `Status:`. Always make `depends_on` a YAML list; use `depends_on: []` when there are no dependencies, and use backlog IDs or short named prerequisites without Markdown links as list values.
   - H1 with the shrimp emoji for every backlog note, including notes in `proposals/`.
   - A required `## UX Implications` section that states the expected user-visible behavior, interaction changes, affected commands or keyboard flows, defaults, and regressions to avoid. If no user-facing effect is expected, say so explicitly and explain why.
   - Other sections that fit the work, usually `Why`, `Current State`, `Build`, `Boundaries`, `Notes`, `Touches`, and `Done`.
5. Update `docs/backlog/index.md` in the matching active or `Proposals` table with a concise row. Link dependencies to their notes when practical.
6. If moving a note between active and `proposals/`, update relative links in that note and in any notes that point to it.
7. When completing an item, make sure the implementation, stable docs, or changelog carry its durable information, then delete its planning note and index row before making the item's final commit so both removals are included in that commit. Do not leave completed notes for later cleanup unless the maintainer explicitly asks.

## Writing Rules

- When editing wording, preserve the note's meaning.
- Describe current behavior and desired build shape with concrete commands, files, modules, surfaces, and tests when known.
- Add or refresh `## UX Implications` whenever creating or materially updating a backlog note. Do not bury UX decisions only in `Build`, `Tradeoffs`, or acceptance criteria.
- Keep uncertain work in `draft` and name the open decision plainly.
- Make boundaries explicit when they prevent scope creep, legacy support, unsafe data changes, or runtime policy from leaking into the item.
- Do not hard-wrap prose.
- Do not copy release-note language into backlog notes.
- Do not add migration or backward-compatibility requirements unless the user explicitly asks for them.

## Verification

For backlog-only edits, review:

```bash
git diff -- docs/backlog skills/shrimpy-dev-backlog
rg "^(status|priority|area|depends_on):" docs/backlog
rg "^(Status|Priority|Area|Depends On):" docs/backlog
```

The second `rg` command should return no body-style metadata fields.

Run code tests only when source code changed or when the backlog edit is part of a source change that needs verification.
