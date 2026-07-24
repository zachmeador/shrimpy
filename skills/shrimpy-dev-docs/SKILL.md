---
name: shrimpy-dev-docs
description: Use when updating Shrimpy docs after source changes, auditing docs/reference parity with the implementation, or pruning stale or redundant doc text, especially when src/ has changed more recently than docs/reference/.
---

# Shrimpy Dev Docs

Keep Shrimpy's docs describing what the code actually does now, in a form a human wants to read.

## Reader Model

Reference docs serve two readers: a human skimming to answer one question, and an agent building a working model of the framework. Write for the human first — prose that a human can skim is also what an agent parses best, and a doc optimized for machine completeness serves neither. Optimize time-to-answer, not completeness; completeness lives in `--help` output and source. Write like you're explaining the concept to a competent colleague, not drafting a contract against misreading. `docs/reference/design.md` is the register to match.

## Source Of Truth Order

1. Implementation and tests are the authority for current behavior.
2. `docs/reference/` describes settled current behavior.
3. `docs/backlog/` tracks planned work and known gaps.
4. Musings, tracking notes, and research are context, not current-behavior docs.

If code has a real gap versus project direction, update the backlog instead of pretending the feature exists. Do not promote exploratory notes into reference docs unless source code or an explicit user decision makes them settled.

## Finding Stale Docs

1. Check local state: `git status --short`, `git diff -- docs src`.
2. Find the docs baseline: `git log -1 --format=%H -- docs/reference`, or the specific doc's baseline for a narrow pass.
3. Diff source since then: `git log --oneline <baseline>..HEAD -- src`, `git diff <baseline>..HEAD -- src`, plus uncommitted `git diff -- src`.
4. Map changes to docs: `rg "<command|config field|type|concept>" docs/reference` and the reverse against `src`. Use `docs/reference/README.md` to pick the owning doc.
5. Update only docs whose current-behavior claims are stale, incomplete, or misleading. If the diff is internal plumbing with no stable external behavior, leave the docs alone and say why.

## Ownership

Every behavior has one owning doc. Before adding text, decide which doc should explain it; other docs link or carry at most a one-line pointer. When the same fact, mode list, or JSON example already appears in two docs, pick the owner and delete the other copy. A new reference doc is a last resort for a stable concept with no home; link it from `docs/reference/README.md` and adjacent docs.

## Structure

- Open each doc with two or three sentences: what the thing is and when a reader cares.
- Common case first. Edge cases, failure semantics, and rare caveats go in a clearly labeled later section the reader can skip, never interleaved with the basics.
- State each system invariant once, in its owning doc. No per-doc "Boundaries" recap sections; cross-cutting invariants live in `architecture.md` and `design.md`.
- One canonical example per config shape, trimmed to the fields under discussion. Other docs link to it.

## Writing Rules

- Concrete paths, command names, config keys, file shapes, and lifecycle facts. Short declarative prose; dense enumerations become bullets or tables.
- Do not hard-wrap prose.
- Define a coined term ("contained system prompt", "lane") at first use in its owning doc; use plain words when a term is not pulling weight.
- Avoid "not X" / "does not" sentences unless they guard a mistake a human reader would plausibly make. Preempting a model's misreading is not a reason to keep one.
- Describe current behavior only: no history, intention, or release-note words such as "added", "now", "new", "previously", or "replaces the old". Delete stale claims instead of contrasting with them. No legacy or migration language unless explicitly requested.
- Keep cross-links local and specific: `[sessions.md](sessions.md)`, not "see the docs".
- Mention source modules only when the path itself is the documented surface, or in a short "Related Code" list for maintainers.

## Deletion Pressure

Docs must not only grow. When an edit adds a paragraph, look for one to remove. Keep concept docs roughly under 150 lines; past that, split by concept or cut detail that belongs in `--help` or code.

## Verification

```bash
git diff -- docs
rg "added|now|new|previously|recently" docs/reference
```

Then read each changed doc top to bottom as prose: cut sentences that restate an invariant owned elsewhere, and check every "does not / is not / never" against the writing rules.

For docs-only changes, report that no build or tests were needed. When documenting a command or generated output, validate the surface directly, for example `node dist/cli.js --help` or `node dist/cli.js skills list`.

Report what source evidence informed the update, what changed, and any remaining doc/code gaps or intentional non-edits.
