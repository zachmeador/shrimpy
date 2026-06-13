# 🦐 SEARCH-002: Workspace Knowledge Search

Status: review
Priority: P2
Area: Search
Depends On: none

## Why

Large workspaces accumulate knowledge that nothing path-routes into context: profile docs, skills, vault notes, agent context files. Agents recall this layer by grepping the workspace today, which works but requires remembering paths, scopes, and output bounds. The adoption bar is the grep workflow: ranked, bounded, source-pointed matches have to beat another `rg` incantation on simplicity and context cost, or agents will keep grepping.

This service is also the substrate for [CTX-011](ctx-011-workspace-knowledge-breadcrumbs.md): turn-context breadcrumbs need a callable local search service over the knowledge corpus, with no external API.

## Current State

- `shrimpy workspace search <query> [--limit N] [--json]` exists as a keyword-only local search over `profile/*.md`, workspace skills, agent skills, `agents/<id>/context/`, and `agents/<id>/vault/`.
- The workspace search index is a rebuildable cache under `runtime/search/`, refreshed lazily by content hash during search. `shrimpy workspace index status` reports scorer identity, corpus size, staleness, and embedding availability; `shrimpy workspace index rebuild` recreates the cache.
- The keyword scorer chunks Markdown by heading section, returns workspace-relative paths, heading trails, scores, clipped snippets, line numbers, mtime, and content-change time, and preserves content-change time across mtime-only rewrites.
- Channel logs stay in `shrimpy channels search`, and [MEM-002](mem-002-session-transcript-search.md) now covers deterministic transcript search.
- Optional semantic ranking through local embeddings is deferred to [SEARCH-003](later/search-003-workspace-search-embeddings.md).

## Build

- `shrimpy workspace search <query> [--limit N] [--json]`, noun-first like `channels search` and the planned `sessions search`. Results are bounded: workspace-relative path, heading trail, score, one-line snippet, last-modified time.
- Corpus: `profile/*.md`, workspace and agent `skills/`, `agents/<id>/context/`, `agents/<id>/vault/`. Chunk markdown by heading section.
- The index is a rebuildable cache under `runtime/search/`, refreshed lazily during search by content hash. No manual build step in the normal path. Index metadata records scorer identity and forces a rebuild when it changes.
- Per file, the index stores the time a content change was first observed, seeded from file mtime on first build, so the recency signal survives sync and checkpoint operations that rewrite mtimes without changing content.
- Maintenance lives under the workspace group, mirroring `workspace track`: `shrimpy workspace index status` (corpus size, scorer, staleness, embeddings availability) and `shrimpy workspace index rebuild`.
- Ranking is a pure-TS BM25-style keyword scorer that carries exact identifiers, names, channel ids, model strings, paths, headings, and ordinary prose.
- Recency joins ranking as a bounded, floored decay on time since last observed content change: among comparable relevance it ranks live notes above stale ones, and the floor keeps slow-changing foundational docs (profile, skills) from sinking. Relevance dominates; recency nudges.
- `workspace index status` reports embeddings as disabled or unavailable so the later optional backend has an inspectable slot without changing the command shape.
- Help text and empty results cross-point the neighboring search layers: `channels search` for messages, `sessions search` for transcripts, and available web lookup when the workspace provides it.
- A daemon tool can mirror the CLI after CLI behavior is stable, same posture as MEM-002.

## Boundaries

- Corpus excludes session transcripts (MEM-002) and channel logs (`channels search`). No federated search across layers — one corpus per command.
- The index is a rebuildable cache under `runtime/`, never the product shape of workspace knowledge.
- No turn-context injection in this item; that is CTX-011.
- No legacy command aliases once the vocabulary lands.

## Notes

- Naming: noun-first `workspace search` keeps every local layer scoped to its corpus: workspace = written down, channels = said, sessions = done. Web lookup is not a Shrimpy corpus; it comes from whichever capability the user provides.
- [SEARCH-003](later/search-003-workspace-search-embeddings.md) owns the optional local embedding backend and hybrid semantic ranking.
- Related: [VAULT-001](vault-001-default-workspace-collections.md) shapes vault collection conventions the corpus walk should respect; [VAULT-002](vault-002-main-agent-capture-research.md) produces the research notes this search makes findable.
- Likely files: `src/search/` (corpus walk, chunking, keyword scorer, index cache, service), workspace command additions in `src/commands/`, `src/commands/catalog.ts`, and `test/workspace-search.test.ts`.

## Done

- `shrimpy workspace search <query>` returns bounded, scored, source-pointed matches across profile, skills, agent context, and vault, fully offline.
- Keyword-only search works with no embedding runtime.
- The index refreshes incrementally by content hash during search; `workspace index status` and `workspace index rebuild` behave as described; a scorer change forces a rebuild.
- Help text and empty results point at `channels search`, `sessions search`, and available web lookup when the workspace provides it.
- `--json` output is stable enough for agent/tool use.
- Tests cover chunking, incremental refresh, keyword-only search, recency boost behavior, result bounds and truncation, and empty-state cross-pointers.
