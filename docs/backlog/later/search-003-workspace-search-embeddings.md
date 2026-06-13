# 🦐 SEARCH-003: Workspace Search Embeddings

Status: todo
Priority: P3
Area: Search
Depends On: workspace search

## Why

`shrimpy workspace search` now gives agents bounded, source-pointed keyword recall over profile docs, skills, context files, and vault notes. Keyword search carries exact identifiers well, but it does not handle meaning-shaped queries where the user asks in different words than the note used. Optional local embeddings can improve that later without changing the command family or making the base install heavier.

## Current State

- `shrimpy workspace search` provides keyword-only workspace search, lazy cache refresh under `runtime/search/`, index status, and rebuild commands.
- The current service exposes embedding availability in status, but no local embedding backend is wired.
- The base install has no ML dependency and does not download models.

## Build

- Add an `Embedder` interface behind workspace search so query embeddings and chunk embeddings can be generated without coupling ranking to one backend.
- Default backend: a small quantized ONNX sentence-embedding model in the all-MiniLM-L6-v2 / bge-small-en-v1.5 class, around 384 dimensions and small enough for local CPU use.
- Package the backend so base keyword search still works when the optional runtime is absent. Use an optional dependency, dynamic import, or equivalent lazy loading; do not make normal install or normal search download a model silently.
- Treat `search.workspace.embeddings.enabled` as explicit consent for the one-time model fetch. The first indexing run should print what it fetches, and later search should run offline.
- Store embedding metadata in the rebuildable workspace index and force a rebuild when model identity, dimensions, scorer identity, or embedding backend changes.
- Rank with simple hybrid fusion: keyword score remains load-bearing for exact identifiers, while vector cosine helps meaning-shaped queries. Keep recency as a bounded nudge after relevance.
- Vector scoring is flat linear cosine over cached typed arrays. No vector database, ANN library, or native vector extension until measured workspace scale proves it necessary.
- Keep one-shot CLI behavior acceptable with cold starts. Gateway warmup can keep the embedder and index ready after CLI behavior is stable.

## Boundaries

- No external embedding APIs and no network at query time.
- No silent multi-megabyte downloads. Config enablement is consent, and status must explain disabled, unavailable, downloading, or ready states.
- No transcript or channel-log embeddings in this item; corpus remains the `shrimpy workspace search` workspace knowledge corpus.
- No turn-context injection here. [CTX-011](../ctx-011-workspace-knowledge-breadcrumbs.md) decides how search results become breadcrumbs.

## Done

- With embeddings disabled or unavailable, `shrimpy workspace search` keeps its keyword behavior and status says why.
- With embeddings enabled and the local runtime ready, workspace search uses hybrid keyword/vector ranking and remains offline after the explicit model fetch.
- Index status reports backend, model, dimensions, staleness, and readiness clearly.
- Tests cover disabled fallback, unavailable runtime fallback, model-change rebuild, hybrid ranking sanity, exact-identifier preservation, and no network at query time.
