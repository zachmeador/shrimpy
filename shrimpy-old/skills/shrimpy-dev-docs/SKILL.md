---
name: shrimpy-dev-docs
description: Use when updating Shrimpy docs after behavior changes, auditing doc/code parity, or pruning stale and redundant documentation.
---

# 🦐 Shrimpy Dev Docs

Use the writing guide for prose; this skill owns documentation evidence, placement, and maintenance.

## Authority And Placement

- Implementation and tests establish current behavior. Explain it in `docs/reference/`; correct stale claims rather than retaining a history of replaced behavior.
- `docs/reference/design.md` owns design principles and intended constraints, not claims that a feature exists.
- Accepted but unimplemented behavior belongs in `docs/backlog/`. Use the backlog skill for status, placement, and completion.
- `docs/musings/` and `docs/research/` preserve exploration and evidence. An accepted decision becomes behavioral reference only when implemented.

## Find The Affected Docs

1. Inspect `git status --short`, unstaged changes, and staged changes. Preserve unrelated edits.
2. Start from the feature diff or an explicitly chosen source range, including source and docs changed in the same commit. A doc's last edit is a clue, not an audited source baseline.
3. Map changed behavior to its owning page using `docs/reference/README.md`. Search for affected commands, fields, and concepts in entry pages, reference docs, included skills, and setup templates. Include relevant `web/`, `extensions/`, scripts, and configuration sources as well as `src/`.
4. For an audit, check current claims against reachable implementation and tests even when no source commits follow the last doc edit. For internal plumbing with no external behavior change, leave user docs alone.

## Ownership

Give each detailed explanation one owner. Workspace owns storage locations; context assembly owns loading and delivery; memory owns what to keep; configuration owns fields and links to specialized shapes. Design owns doctrine, architecture owns implementation boundaries, and generated CLI help owns exhaustive options.

Keep short reminders and task-specific examples where readers or installed skills need them to act independently. Remove duplicate catalogs, schemas, and explanations. Skills should guide decisions and command sequencing, with links to feature reference.

Add a page only for a stable concept with no suitable home. When adding, moving, renaming, or removing a page or heading, update indexes and inbound links, including entry pages and skill/template breadcrumbs.

## Verification

- Review the diff, including staged changes. Check relative links and affected heading anchors.
- Verify changed commands, defaults, and examples against the owning source and tests. Use read-only CLI help or inspection where useful; use an isolated workspace if validation needs writes.
- Read changed pages as a reader: can someone find and act on the answer without reading another concept first? Cut repetition and move optional maintainer detail after the operational explanation.
- For docs-only edits, skip builds and code tests. Skill changes follow `shrimpy-dev-skills` validation and mirror generation.

Report the evidence checked, changes made, and any remaining gaps.
