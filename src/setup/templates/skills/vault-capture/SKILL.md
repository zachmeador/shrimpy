---
name: vault-capture
description: Save links, files, notes, recipes, research requests, and "look into this" work into agent vault files with source metadata and predictable paths.
---

# Vault Capture

Use this skill when the user asks to save, capture, catalog, archive, remember as a file, collect, research, compare, or "look into this" in a way that should become durable workspace material.

## Choose The Owner

- Use the owning agent's `agents/<id>/vault/` for durable user-owned collections, saved artifacts, source notes, reports, and research packets.
- Use `agents/<id>/projects/` for code, apps, experiments, and tightly scoped work folders.
- Use `agents/<id>/context/` only for memory intended to load into prompts.
- For unclear ownership, use the active agent. For career artifacts, prefer the career agent's vault when that agent exists.

Keep vault categories loose and user-led. Create an obvious collection folder when the request is clear, and ask before inventing a large taxonomy.

## Simple Collections

For recipes, household notes, travel ideas, research links, purchase comparisons, and similar collections, write plain Markdown with source metadata near the top.

Recipe default:

- Keep the source URL or origin.
- Write the adapted recipe as Markdown.
- Save to `agents/<id>/vault/recipes/<slug>.md` unless the user named another place.

## Capture Metadata

When practical, preserve metadata before analysis:

- source URL or origin;
- capture timestamp;
- user's request;
- saved files or copied artifacts;
- obvious tags or categories.

After writing vault files, report the saved path and any useful diff or remaining question.

## Main Shrimpy Intake

The default `shrimpy` agent uses predictable intake paths:

- `agents/shrimpy/vault/inbox/` for quick captures that need later sorting.
- `agents/shrimpy/vault/research/<YYYY-MM-DD>-<slug>/` for bounded research packets.
- `agents/shrimpy/vault/catalog.md` or per-collection indexes only when an index helps later retrieval.

## Research Packets

For bounded research, create a folder under `agents/shrimpy/vault/research/<YYYY-MM-DD>-<slug>/` unless another owner is clearer. Include:

- `brief.md` for the user request, current state, assumptions, and done criteria;
- `sources.md` for links, citations, access notes, and retrieval dates;
- `notes.md` for findings, uncertainties, and follow-up questions;
- optional artifacts under a clearly named subfolder.

Use worker sessions only when the task has a clear bounded goal. Give the worker the vault packet path as handoff material, then report saved paths, worker ids, and unresolved questions back to the user.

## Versioning

Do not auto-commit every vault write. Commit kept vault changes only when the user asks to preserve a version. Use an explicit user-chosen repo or checkpoint setup for selected keeper files.
