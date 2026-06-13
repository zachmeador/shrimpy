# 🦐 CTX-011: Workspace Knowledge Breadcrumbs In Turn Context

Status: todo
Priority: P2
Area: Context
Depends On: [SEARCH-002](search-002-workspace-knowledge-search.md)

## Why

In a large workspace the agent does not know what knowledge exists unless something tells it. Turn context already carries fixed, path-routed slices (people/channel memory, skills trails); nothing connects the content of the incoming message to the rest of the corpus. A few high-confidence pointers — never content — let the agent notice "there is a vault note about this" and decide whether to read it.

## Current State

- Turn context is assembled by item builders in `src/context/turn/service.ts`, each returning `{summary, inspect}` items under the `context.turn.maxChars` budget.
- `src/context/turn/memory.ts` is the deterministic precedent: path-routed per-turn slices keyed by sender and channel.
- [SEARCH-002](search-002-workspace-knowledge-search.md) provides the local workspace search service this producer calls.

## Build

- New turn-context producer (for example `src/context/turn/knowledge.ts`) that queries the SEARCH-002 service with the current message text and emits at most a few items.
- Item shape matches the rest of turn context: summary carries the workspace-relative path (and heading when useful) with a short relevance hook; inspect is the exact command or path to open the source.
- Config under `context.turn.knowledge`: `enabled` (default false), `maxItems` (default 3), `minScore`. Opt-in until it proves itself.
- Threshold-gated with silence as the default outcome: below threshold nothing is emitted, results are deduped by path, and nothing pads toward `maxItems`.
- Turn assembly never downloads models, never blocks on a rebuild, and serves a stale index rather than waiting; if the search service or index is not ready, the producer emits nothing.
- `shrimpy context turn` previews the items like every other producer.

## Boundaries

- Pointers only. Document content never enters the context block; the agent reads the source if it cares.
- An irrelevant breadcrumb is worse than none: conservative threshold, small cap, no filler.
- Corpus is exactly SEARCH-002's. No transcript or channel-log breadcrumbs; MEM-002's no-ambient-injection boundary for transcripts stands.
- No new config surface beyond `context.turn.knowledge`; budget interaction stays inside the existing `maxChars` mechanism.
- Optional semantic ranking from [SEARCH-003](later/search-003-workspace-search-embeddings.md) can improve relevance later, but this producer must work with SEARCH-002's keyword search.

## Done

- With the feature enabled and an index present, a related incoming message yields bounded knowledge items with exact paths in both live turns and the `shrimpy context turn` preview.
- Unrelated messages, a disabled flag, or a missing index/service yield zero items and zero turn-time downloads or rebuilds.
- Tests cover threshold and cap behavior, dedupe, silence on low scores, disabled-by-default config, and the not-ready path.
