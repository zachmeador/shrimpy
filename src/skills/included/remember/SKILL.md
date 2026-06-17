---
name: remember
description: Save links, files, notes, collections, research requests, and "look into this" work into agent vault files with source metadata and predictable paths.
---

# Remember

Use this skill when the user asks to save, capture, catalog, archive, remember as a file, collect, research, compare, or "look into this" in a way that should become durable workspace material.

## Choose The Owner

- Use the owning agent's `agents/<id>/vault/` for durable user-owned collections, saved artifacts, source notes, reports, and research packets.
- Use `agents/<id>/projects/` for code, apps, experiments, and tightly scoped work folders.
- Use `agents/<id>/context/` only for memory intended to load into prompts.
- For unclear ownership, use the active agent. For career artifacts, prefer the career agent's vault when that agent exists.

Keep vault categories loose and user-led. Create an obvious collection folder when the request is clear, and ask before inventing a large taxonomy.

## Simple Collections

For user collections such as household notes, travel ideas, craft patterns, recipes, research links, and purchase comparisons, write plain Markdown with source metadata near the top.

Collection default:

- Keep the source URL or origin.
- Write the saved item in the most useful Markdown shape for that material.
- Save to an obvious `agents/<id>/vault/<collection>/<slug>.md` path when the collection is clear, such as `patterns/`, `recipes/`, or `travel/`.
- Use `agents/<id>/vault/inbox/<slug>.md` when the collection is unclear.

## Capture Metadata

When practical, preserve metadata before analysis:

- source URL or origin;
- capture timestamp;
- user's request;
- saved files or copied artifacts;
- obvious tags or categories.

After writing vault files, report the saved path and any useful diff or remaining question.

Useful inspection before creating a new collection:

```bash
shrimpy agent show <id>
shrimpy workspace search "<topic>" --limit 10
shrimpy sessions search "<topic>" --agent <id>
shrimpy channels search <channel> "<topic>"
```

## Research Packets

For bounded research, keep the brief, sources, notes, and artifacts together under the owning agent's `vault/`. A dated `research/<YYYY-MM-DD>-<slug>/` folder is a reasonable default when no existing collection fits. Do not create a packet when a single saved note is enough.

Useful packet files:

- `brief.md` for the user request, current state, assumptions, and done criteria;
- `sources.md` for links, citations, access notes, and retrieval dates;
- `notes.md` for findings, uncertainties, and follow-up questions;
- optional artifacts under a clearly named subfolder.

Handle normal capture and research in the current session. Start a worker only when the user asks for delegated work; if a worker is used, give it the packet path and report saved paths, the worker id, and unresolved questions.

## Versioning

Do not auto-commit every vault write. Commit kept vault changes only when the user asks to preserve a version. Use an explicit user-chosen repo or checkpoint setup for selected keeper files.
