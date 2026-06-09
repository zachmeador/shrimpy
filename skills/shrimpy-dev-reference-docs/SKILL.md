---
name: shrimpy-dev-reference-docs
description: Use when updating Shrimpy reference docs after source changes, especially when src/ has changed more recently than docs/reference/.
---

# Shrimpy Dev Reference Docs

Use this Shrimpy developer skill from the Shrimpy repository when `src/` changes may have left `docs/reference/` stale.

## Goal

Keep `docs/reference/` from going stale after source changes. Use git history and diffs to find reference material that no longer matches `src/`, then update it so the docs describe current Shrimpy behavior in a succinct, consistent way.

## Reference Standard

- Each reference doc clinically describes one stable concept.
- Keep the voice and level of detail consistent across `docs/reference/`.
- Reference docs describe current behavior, not implementation history, intention, or backlog.
- Link adjacent concepts when a reader needs them, for example sessions to runtime, channels to surfaces, or skills to context assembly.
- Prefer existing docs over new files. Create a new reference doc only when a stable concept has no clear home, and link it from `docs/reference/README.md`.
- Remove stale claims instead of adding caveats for behavior that no longer exists.

## Diff Workflow

1. Confirm the Shrimpy project root. Read `AGENTS.md` and `AGENTS-PRIVATE.md` if present.
2. Inspect local state before touching docs:
   - `git status --short`
   - `git diff -- docs/reference`
   - `git diff -- src`
3. Find the broad docs baseline:
   - `git log -1 --format=%H -- docs/reference`
   - `git log --oneline -- docs/reference | head -20`
4. Find source changes since that baseline:
   - `git log --oneline <docs-baseline>..HEAD -- src`
   - `git diff --name-status <docs-baseline>..HEAD -- src`
   - `git diff <docs-baseline>..HEAD -- src`
5. Include uncommitted source changes:
   - `git diff --name-status -- src`
   - `git diff -- src`
6. For a specific concept, tighten the baseline to the relevant doc:
   - `git log -1 --format=%H -- docs/reference/<concept>.md`
   - `git log --oneline <concept-doc-baseline>..HEAD -- <related-src-paths>`
   - `git diff <concept-doc-baseline>..HEAD -- <related-src-paths>`
7. Map source changes to docs:
   - Search docs with `rg "<command|config field|type|concept>" docs/reference`.
   - Search source with `rg "<doc term|command|config field|type>" src`.
   - Use `docs/reference/README.md` to choose the concept doc to update.
8. Update only the reference docs needed for changed behavior. If the diff is internal plumbing with no stable external behavior, leave the reference docs unchanged and say why.

## Writing Rules

- State concrete paths, command names, config keys, file shapes, and lifecycle facts.
- Keep prose short and declarative.
- Avoid release-note language such as "added", "now", "new", "previously", or "recently".
- Do not document speculative future work; point to `docs/backlog/` only when a reference doc already names active refinement as related context.
- Keep cross-links local and useful: `[sessions.md](sessions.md)`, not broad prose references to "the docs".

## Verification

After editing, review:

```bash
git diff -- docs/reference
rg "added|now|new|previously|recently" docs/reference
```

Run code checks only when source changed or when the docs describe behavior that can be cheaply probed. For docs-only changes, report that no runtime tests were needed.
