# 🦐 SEARCH-002: Workspace Knowledge Search

Status: todo
Priority: P2
Area: Search
Depends On: none

## Why

Large workspaces accumulate knowledge that nothing path-routes into context: profile docs, skills, vault notes, agent context files. Agents recall this layer by grepping the workspace today, which works for exact terms but fails for meaning-shaped queries — the vocabulary of how a thing was written rarely matches how it is asked for, especially when the query is a whole user message. The adoption bar is the grep workflow: ranked, bounded, source-pointed matches have to beat another `rg` incantation on simplicity and context cost, or agents will keep grepping.

This service is also the substrate for [CTX-011](ctx-011-workspace-knowledge-breadcrumbs.md): turn-context breadcrumbs need query-by-meaning over the knowledge corpus as a callable local service, with no external API.

## Current State

- `shrimpy workspace search <query> [--limit N] [--json]` exists as a keyword-only local search over `profile/*.md`, workspace skills, agent skills, `agents/<id>/context/`, and `agents/<id>/vault/`.
- The workspace search index is a rebuildable cache under `runtime/search/`, refreshed lazily by content hash during search. `shrimpy workspace index status` reports scorer identity, corpus size, staleness, and embedding availability; `shrimpy workspace index rebuild` recreates the cache.
- The keyword scorer chunks Markdown by heading section, returns workspace-relative paths, heading trails, scores, clipped snippets, line numbers, mtime, and content-change time, and preserves content-change time across mtime-only rewrites.
- Channel logs stay in `shrimpy channels search`, and [MEM-002](mem-002-session-transcript-search.md) now covers deterministic transcript search.
- No local embedding backend is wired yet. `search.workspace.embeddings.enabled` is recognized only as unavailable status; hybrid ranking, model fetch consent, and gateway warmup remain.

## Build

- `shrimpy workspace search <query> [--limit N] [--json]`, noun-first like `channels search` and the planned `sessions search`. Results are bounded: workspace-relative path, heading trail, score, one-line snippet, last-modified time.
- Corpus: `profile/*.md`, workspace and agent `skills/`, `agents/<id>/context/`, `agents/<id>/vault/`. Chunk markdown by heading section.
- The index is a rebuildable cache under `runtime/search/`, refreshed lazily during search by content hash. No manual build step in the normal path. Index metadata records scorer/model identity and forces a rebuild when it changes.
- Per file, the index stores the time a content change was first observed, seeded from file mtime on first build, so the recency signal survives sync and checkpoint operations that rewrite mtimes without changing content.
- Maintenance lives under the workspace group, mirroring `workspace track`: `shrimpy workspace index status` (corpus size, scorer/model, staleness, embeddings availability) and `shrimpy workspace index rebuild`.
- Ranking is hybrid: a pure-TS BM25-style keyword scorer that always works, plus an opt-in embedding scorer, combined with simple score fusion. Keyword scoring carries exact identifiers; embeddings carry meaning-shaped queries.
- Recency joins the fusion as a bounded, floored decay on time since last observed content change: among comparable relevance it ranks live notes above stale ones, and the floor keeps slow-changing foundational docs (profile, skills) from sinking. Relevance dominates; recency nudges.
- Embeddings run locally on CPU behind a small `Embedder` interface. Default backend: a small quantized ONNX sentence-embedding model (all-MiniLM-L6-v2 / bge-small-en-v1.5 class, 384 dims, ~25MB) via transformers.js (`@huggingface/transformers`). Vector scoring is brute-force cosine over typed arrays.
- Enabling embeddings in config (for example `search.workspace.embeddings.enabled`, set directly or during setup) is the consent for the one-time model download; the first indexing run prints what it fetches, and everything runs offline afterward.
- Degrade cleanly: with embeddings disabled or the runtime absent, search is keyword-only and `workspace index status` says so.
- The gateway process keeps the embedder and index warm; one-shot CLI invocations pay cold start or fall back to keyword-only.
- Help text and empty results cross-point the neighboring search layers: `channels search` for messages, `sessions search` for transcripts, and available web lookup when the workspace provides it.
- A daemon tool can mirror the CLI after CLI behavior is stable, same posture as MEM-002.

## Boundaries

- No external embedding APIs and no network at query time. Local CPU only; offline after the explicit model fetch.
- No vector database, ANN library, or native vector extension. Flat cache plus linear scan is the design at workspace scale; revisit only on measured slowness.
- Corpus excludes session transcripts (MEM-002) and channel logs (`channels search`). No federated search across layers — one corpus per command.
- The index is a rebuildable cache under `runtime/`, never the product shape of workspace knowledge.
- The base install works without the embedding runtime: keyword-only search with embeddings entirely absent. Exact packaging of the optional ML dependency (optionalDependencies vs lazily imported dependency) is an implementation decision, but a silent multi-megabyte model download is not acceptable.
- No turn-context injection in this item; that is CTX-011.
- No legacy command aliases once the vocabulary lands.

## Notes

- Naming: noun-first `workspace search` keeps every local layer scoped to its corpus: workspace = written down, channels = said, sessions = done. Web lookup is not a Shrimpy corpus; it comes from whichever capability the user provides.
- Embeddings are weak on exact identifiers (names, channel ids, model strings), which home workspaces are full of; the keyword side of the fusion is load-bearing, not a fallback nicety.
- Scale math: hundreds of files → low thousands of chunks → a few MB of float32 vectors; linear cosine is sub-millisecond. This is why no vector infrastructure is justified.
- The `Embedder` interface keeps the backend swappable: larger ONNX models, an Ollama backend for users already running it, or static embedding models if a zero-native-dep backend is ever wanted.
- Related: [VAULT-001](vault-001-default-workspace-collections.md) shapes vault collection conventions the corpus walk should respect; [VAULT-002](vault-002-main-agent-capture-research.md) produces the research notes this search makes findable.
- Likely files: new `src/search/` (corpus walk, chunking, keyword scorer, embedder interface, index cache, service), workspace command additions in `src/commands/`, `src/commands/catalog.ts`, config schema/resolution, `test/workspace-search.test.ts`.

## Done

- `shrimpy workspace search <query>` returns bounded, scored, source-pointed matches across profile, skills, agent context, and vault, fully offline.
- Keyword-only search works with the embedding runtime absent or disabled; enabling embeddings in config produces hybrid ranking after one explicit model fetch.
- The index refreshes incrementally by content hash during search; `workspace index status` and `workspace index rebuild` behave as described; a scorer/model change forces a rebuild.
- Help text and empty results point at `channels search`, `sessions search`, and available web lookup when the workspace provides it.
- `--json` output is stable enough for agent/tool use.
- Tests cover chunking, incremental refresh, keyword-only fallback, hybrid ranking sanity, recency boost behavior (ties break toward fresher content; strong matches beat fresh weak ones), result bounds and truncation, model-change rebuild, and empty-state cross-pointers.
