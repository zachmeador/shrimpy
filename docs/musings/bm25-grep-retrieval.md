# BM25 + Grep Retrieval

Date: 2026-06-30
Status: Draft

## Purpose

Think through what it would mean for Shrimpy to treat BM25 plus grep-style exact search as the default retrieval substrate for agents.

## Current Shrimpy Shape

Shrimpy already has three retrieval primitives:

- `shrimpy workspace search` searches workspace markdown knowledge: `context/**/*.md`, workspace skills, agent skills, `agents/<id>/context/`, and `agents/<id>/vault/`. This is the BM25 path today. It uses the `keyword-bm25-v1` scorer over markdown chunks, returns paths, heading trails, line numbers, snippets, and scores, and keeps a local rebuildable cache under `runtime/search/`.
- `shrimpy sessions search` searches active and archived Pi transcript JSONL. This is an exact-text scan over session entries, with `sessions read` as the expansion path.
- `shrimpy channels search` searches channel message records. This is an exact-text scan with filters, with `channels read` as the expansion path.

The included `shrimpy-search` skill already teaches the important human/agent habit: search before inventing, then open the pointed source instead of treating snippets as complete evidence.

In short: Shrimpy currently has one BM25 workspace corpus plus two exact-search history corpora, exposed as separate commands with related result behavior.

## Current Gaps

The current search stack is useful, but it does not yet feel like one coherent retrieval substrate:

- There is no top-level `shrimpy search` command that searches across workspace, sessions, and channels.
- There is no explicit grep mode for "show every exact occurrence" or "audit this identifier" workflows.
- Workspace, session, and channel results do not yet share one normalized result shape.
- Search results do not consistently include ready-to-run inspect commands.
- BM25 is only used for workspace markdown chunks, not sessions or channels.
- Turn-context breadcrumbs are still backlog work, so search is on-demand rather than an ambient source-pointed hint layer.
- The `shrimpy-search` skill describes bounded search, but it does not yet teach a sharp BM25 + grep retrieval loop.

## Ideal Direction

The ideal direction is to make lexical retrieval feel like Shrimpy's default way of knowing where to look:

- BM25 is the ranked recall layer for chunked local corpora.
- Grep-style exact search is the audit/debug layer for identifiers, quoted phrases, paths, commands, config keys, and "find all occurrences" tasks.
- Every hit points at source and tells the agent how to inspect enough surrounding evidence.
- Corpus boundaries stay visible. Workspace knowledge, sessions, and channels remain distinct even if a unified command can query them together.
- Skills teach agents to search, inspect, and then act, instead of pretending retrieval is hidden memory.
- Embeddings remain a later optional ranker for meaning-shaped queries, not the foundation of basic memory, workspace knowledge, debugging, or provenance.

The interesting idea from the BM25 + grep framing is not "never use embeddings." It is that Shrimpy's first-class retrieval loop might stay lexical, inspectable, cheap, and local for much longer than expected.

## Why It Fits Shrimpy

- Local-first search matches the workspace model. The important material is already plain files, markdown context, skills, vault notes, channels, and session transcripts.
- Exact text matters. Agent work is full of identifiers, paths, commands, branch names, config keys, CLI flags, dates, channel names, agent ids, and user phrasing. Vector search is often weakest exactly where agent work needs precision.
- BM25 is good enough for ranked recall over small and medium personal corpora. It gives a sensible first list without requiring a model, network, daemon, vector database, or opaque scoring layer.
- Grep is the audit path. When a result matters, the agent should be able to prove it by opening the file, transcript window, or channel record at a line or entry id.
- Search can be explained. A user can understand "I searched these corpora, found these paths, and opened this source" in a way they cannot easily inspect with hidden embedding retrieval.
- It keeps retrieval as a tool practice, not a magical memory substrate. Agents learn a workflow: search, inspect, cite, act.

## Product Shape

Building from the current pieces, Shrimpy could eventually make lexical retrieval feel like one coherent capability:

- `shrimpy search "<query>"` as a unified front door, with flags for `--workspace`, `--sessions`, `--channels`, `--agent`, `--channel`, `--since`, `--json`, and `--grep`.
- Corpus-specific commands can stay as the precise primitives. The unified command would compose them and normalize the result shape.
- Every result should include a source pointer and an inspect command. A search hit should naturally lead to `sessions read`, `channels read`, or opening a markdown range.
- BM25 mode should be the default ranked recall path for chunked corpora.
- Grep mode should be the literal audit path for exact strings, identifiers, quoted phrases, and "show me every occurrence" tasks.
- Turn-context breadcrumbs should be bounded and humble: a few source-pointed hits, never a hidden pile of retrieved text.
- Skills should teach the retrieval loop directly. "Search before inventing" should mean bounded lexical search first, then source inspection, then action.

## Architecture Shape

The ideal core abstraction is not a vector database. It is a small family of corpus readers with a shared result language.

- **Corpus**: workspace knowledge, agent context, agent vault, workspace skills, agent skills, channel messages, session transcripts, and maybe source code later.
- **Chunk**: text with path or record id, heading trail or transcript position, timestamps, and a stable inspect command.
- **Ranked search**: BM25 over chunk tokens with small boosts for exact phrases, headings, paths, and recent content where recency helps.
- **Exact search**: grep-style literal and regex scans over selected corpora, optimized for identifiers, quoted phrases, and debugging.
- **Index**: local, rebuildable, content-hashed cache where it helps. No required daemon.
- **Inspector**: source-specific expansion commands that turn a hit into enough surrounding evidence for the agent to reason.

This is especially attractive because Shrimpy already owns the workspace layout and the CLI. It does not need to invent a separate retrieval service before the product experience is clear.

## Agent Loop

The ideal default agent loop could be:

1. Extract two or three likely lexical queries from the user's request.
2. Run ranked BM25 against the likely corpus.
3. Use exact grep for quoted strings, ids, filenames, command names, and surprising terms from the first hits.
4. Open the specific sources that look relevant.
5. Answer or modify state with source awareness.
6. Say what was searched when the search was material and results were sparse or ambiguous.

This loop is simple enough to live in skills and strong enough to become a habit across agents. It also leaves room for agents to improve queries by reading source terms instead of hoping the first semantic query was right.

## Relationship To Embeddings

`SEARCH-003` still makes sense as a later optional layer, but the ordering matters. Before adding local embeddings, Shrimpy should probably make the lexical layer feel excellent:

- consistent result shapes across workspace, session, and channel search
- good line or entry pointers
- clear corpus boundaries
- inspect commands in every result
- stable JSON for agents
- literal grep mode where ranked search is the wrong tool
- small query-planning guidance in `shrimpy-search`

If embeddings arrive later, they should be a ranker inside the same retrieval shape, not a new product concept. Keyword score should stay load-bearing for exact identifiers, and vector score should help only where lexical matching is genuinely thin.

## Useful First Moves

- Preserve the current split clearly in docs: workspace search is BM25, sessions/channels search are exact scans.
- Add a musing/backlog bridge for a unified lexical retrieval CLI once the current workspace search settles.
- Teach `shrimpy-search` a slightly sharper BM25 + grep loop: ranked search first, exact scan for literals, inspect source before acting.
- Consider whether `shrimpy workspace search --grep` should exist before a top-level unified `shrimpy search`.
- Make search JSON results include a ready-to-run inspect command everywhere.
- Revisit `CTX-011` with the assumption that lexical breadcrumbs are the default and embeddings are optional enhancement.

## Non-Goals

- A hidden vector database as the default memory layer.
- Network retrieval for local workspace recall.
- Treating snippets as authoritative evidence.
- Broad filesystem crawling outside configured Shrimpy corpora.
- A search system that requires every agent to understand index internals.

## Open Questions

- Should the first unification be a new `shrimpy search` command, or should the existing corpus-specific commands become more consistent first?
- Should grep-style search shell out to `rg` when available, or use internal scanners so behavior is stable in every install?
- How much query planning belongs in core code versus the `shrimpy-search` skill?
- Should source code search be part of Shrimpy's user workspace retrieval, or stay a coding-agent behavior outside normal home-agent memory?
- What is the right result shape for channel and session hits so they feel equivalent to markdown file hits without flattening away useful metadata?
- Does strong lexical retrieval reduce the priority of `SEARCH-003`, or does it make the later embedding layer easier to add safely?
