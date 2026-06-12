---
name: shrimpy-dev-backlog
description: Use when creating, updating, triaging, or closing Shrimpy backlog notes in docs/backlog, including choosing IDs, filenames, status, priority, dependencies, later/ placement, and index entries.
---

# Shrimpy Dev Backlog

Use this Shrimpy developer skill when working with `docs/backlog/` project-state notes.

## Goal

Keep the backlog useful as a small planning map: concrete enough for an agent to build from, clear about priority and uncertainty, and separate from stable docs and release notes.

## Files

- `docs/backlog/index.md` is the source of truth for listed backlog items.
- Active backlog notes live directly in `docs/backlog/`.
- Deferred notes live in `docs/backlog/later/`.
- Completed work belongs in git history, stable docs, and the changelog when user-visible; do not keep completed planning notes active unless the maintainer asks.

## Naming

Use the common backlog filename shape for new notes:

```text
area-000-short-kebab-title.md
```

Examples: `setup-003-opt-in-watch-seeding.md`, `surface-006-chat-command-parity.md`, `ctx-010-agent-watch-turn-context.md`.

Choose the next number in that area by inspecting existing active and `later/` notes. Keep the ID uppercase in the title and index, for example `SETUP-004`, while keeping the filename lowercase. Older short filenames such as `app-001.md` and `code-001.md` are existing exceptions, not the preferred pattern for new notes.

## Status And Priority

- New backlog notes start as `draft` unless the user explicitly says the item is accepted, planned, or ready for build.
- Use `todo` only when the direction is accepted enough that an agent can implement it without re-deciding the product shape.
- Use `review` when implementation is ready for maintainer review but the backlog item has not been closed out.
- Put every `P3` item in `docs/backlog/later/` and list it under the `Later` section of `docs/backlog/index.md`.
- Keep `P1` and `P2` items in the active backlog unless the user explicitly defers them.

## Workflow

1. Read `AGENTS.md`, `AGENTS-PRIVATE.md` if present, `docs/backlog/index.md`, and the nearest existing backlog notes for the same area.
2. Preserve uncommitted user edits. Inspect `git status --short` before editing and avoid rewriting unrelated backlog rows or notes.
3. For a new item, choose the area, next ID, filename, status, priority, and dependencies before writing the note.
4. Write the note with the existing backlog shape:
   - H1 with the shrimp emoji for every backlog note, including notes in `later/`.
   - Header fields: `Status`, `Priority`, `Area`, and `Depends On` when known.
   - Sections that fit the work, usually `Why`, `Current State`, `Build`, `Boundaries`, `Notes`, `Touches`, and `Done`.
5. Update `docs/backlog/index.md` in the matching active or `Later` table with a concise row. Link dependencies to their notes when practical.
6. If moving a note between active and `later/`, update relative links in that note and in any notes that point to it.
7. If closing or removing a note, make sure the implementation, stable docs, or changelog now carry the durable information before deleting the planning note or row.

## Writing Rules

- Write briefly and directly. Backlog notes are for agent execution, not long essays.
- Describe current behavior and desired build shape with concrete commands, files, modules, surfaces, and tests when known.
- Keep uncertain work in `draft` and name the open decision plainly.
- Make boundaries explicit when they prevent scope creep, legacy support, unsafe data changes, or runtime policy from leaking into the item.
- Do not hard-wrap prose.
- Do not copy release-note language into backlog notes.
- Do not add migration or backward-compatibility requirements unless the user explicitly asks for them.

## Verification

For backlog-only edits, review:

```bash
git diff -- docs/backlog skills/shrimpy-dev-backlog
rg "Status:|Priority:|Depends On:" docs/backlog docs/backlog/later
```

Run code tests only when source code changed or when the backlog edit is part of a source change that needs verification.
