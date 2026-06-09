---
name: shrimpy-dev-docs-update
description: Use when checking Shrimpy documentation parity with implementation, updating docs after code changes, auditing whether docs are stale or redundant, or preparing lightweight docs/backlog updates from source evidence without relying on fixed doc or source filenames.
---

# Shrimpy Dev Docs Update

Use this skill to keep Shrimpy's docs honest against the current implementation while avoiding redundant doc sprawl.

## Goal

Make stable docs describe what Shrimpy actually does now. Keep docs light, owned, and distinct. Put unsettled or future work in the right project-state location. Prefer direct source evidence over assumptions.

## Source Of Truth Order

1. Implementation and tests are the authority for current behavior.
2. Stable reference docs describe settled current behavior.
3. Backlog docs track planned work and known gaps.
4. Musings, tracking notes, and research are context, not current-behavior docs.

Discover the current directories and indexes instead of assuming names are permanent. Shrimpy is still prototyping; filenames, module boundaries, and doc organization can move.

## Workflow

1. Identify the behavior area from the request or recent diff.
2. Discover the current doc map:
   - Start with `rg --files docs`.
   - Read the docs index files if present.
   - Search docs for the behavior terms before deciding where to edit.
3. Discover the implementation surface:
   - Use `rg --files` and targeted `rg` searches for command names, config keys, event names, types, tests, and user-visible strings.
   - Read the smallest useful set of implementation and test files.
4. Choose one primary doc owner for the behavior. If several docs mention the topic, decide which should explain it and which should only link or mention it briefly.
5. Compare docs claims to source evidence. Look for missing commands, stale flags, renamed files, changed config fields, changed lifecycle behavior, stale examples, duplicate explanations, and claims copied from plans that are not implemented.
6. Update only docs whose current-behavior claims are stale, incomplete, or misleading. Delete or replace stale text instead of layering caveats around it.
7. If code has a real gap versus project direction, update backlog or a focused project-state note instead of pretending the feature exists.

## Doc Ownership

Before adding text, answer:

- What question should this doc uniquely answer?
- Is this already explained elsewhere?
- Should this doc own the explanation, or just link to the owner?
- Can a shorter statement plus a link prevent duplication?

Prefer one authoritative explanation per behavior. Other docs may carry a one-line pointer when useful. If adding a new reference doc, also update the relevant docs index and link to it from adjacent docs.

## Editing Rules

- Keep stable docs concise and factual. Do not narrate implementation history.
- Keep examples small and canonical; do not repeat large config blocks across docs.
- Do not add legacy-support or migration language unless explicitly requested.
- Do not promote exploratory notes into reference docs unless source code or an explicit user decision makes them settled.
- Keep Shrimpy's architecture guidance intact: every feature should have a CLI path, channels are for routing/logs, sessions carry instructions, and skills are prompt/resource bundles.
- Prefer replacing stale text directly over adding caveats around old behavior.
- Use absolute paths in markdown links if the surrounding doc already does; otherwise match the local doc style.
- Avoid fixed source-path maps in durable docs unless the path itself is the documented public surface. Mention modules in "Related Code" sections only when useful for maintainers.

## Verification

After edits, run the smallest useful checks:

```bash
npm run build
npm test
```

If docs-only changes do not need both checks, say so. When documenting a command or generated output, run a targeted command that validates the documented surface, such as:

```bash
node dist/cli.js --help
node dist/cli.js skills list
```

Report what implementation evidence informed the update, what docs changed, and any remaining doc/code gaps or intentional non-edits.
