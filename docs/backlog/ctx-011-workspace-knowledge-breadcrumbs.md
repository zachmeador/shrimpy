---
status: review
priority: P2
area: Context
depends_on:
  - workspace search
---

# 🦐 CTX-011: Workspace Knowledge Breadcrumbs In Turn Context

## Why

In a large workspace the agent does not know what knowledge exists unless something tells it. Turn context already carries fixed runtime pointers and command-source output; nothing connects the content of the incoming message to the rest of the corpus. A few high-confidence pointers — never content — let the agent notice "there is a vault note about this" and decide whether to read it.

## Current State

- Turn context is assembled by item builders in `src/context/turn/service.ts`, each returning `{summary, inspect}` items under the `context.turn.maxChars` budget.
- `src/context/turn/knowledge.ts` turns incoming channel message text or a direct-session prompt into bounded path-and-line pointers.
- `src/search/workspace.ts` lazily creates or refreshes the local index before ranking, reusing indexed chunks for unchanged files.

## Review Shape

- The item shape matches the rest of turn context: summaries carry a workspace-relative path, line, optional heading trail, and rounded relevance score; inspect carries the exact path-and-line pointer.
- Breadcrumbs are always active. Workspace-wide config under `context.turn.knowledge` can tune `maxItems` (default 3) and `minScore` (default 1.5); there is no agent override.
- Threshold gating, path deduplication, and the item cap happen before rendering, with no below-threshold filler.
- The normal workspace-search refresh path creates missing indexes, replaces incompatible or malformed indexes, and reindexes changed files automatically.
- Direct/TUI turns pass prompt text into turn-context assembly, while channel turns use the routed text message. `shrimpy context turn` follows the same producer path.
- Direct/TUI transcripts keep the submitted user message followed by a collapsed turn-context attachment, while provider requests and `shrimpy context` previews normalize that pair into one context-before-prompt user message.

## Boundaries

- Pointers only. Document content never enters turn context; the agent reads the source if it cares.
- An irrelevant breadcrumb is worse than none: conservative threshold, small cap, no filler.
- Corpus is exactly `shrimpy workspace search`'s. No transcript or channel-log breadcrumbs; `shrimpy sessions search` remains on-demand recall, not ambient context.
- No new config surface beyond `context.turn.knowledge`; budget interaction stays inside the existing `maxChars` mechanism.
- Configuration is workspace-wide. Agent-specific breadcrumb policy is out of scope.
- Optional semantic ranking from [SEARCH-003](proposals/search-003-workspace-search-embeddings.md) can improve relevance later, but this producer must work with keyword workspace search.

## UX Implications

Related live messages and `shrimpy context turn` previews can show up to three workspace-relative path-and-line breadcrumbs with optional heading trails. Model requests and full `shrimpy context` previews consistently place turn context before the submitted prompt, while direct/TUI transcripts keep the prompt clean and reveal the attachment through Ctrl+O. Unrelated messages remain quiet, source text stays out of turn context, and users do not need to enable the feature or maintain its index.

## Done

- A related incoming message yields bounded knowledge items with exact paths in both live turns and `shrimpy context turn` output without prior configuration or index maintenance.
- Unrelated messages and below-threshold results yield zero items, while missing, stale, malformed, or incompatible indexes repair through the local keyword-search path.
- Tests cover automatic creation and refresh, malformed-index repair, threshold and cap behavior, dedupe, silence on low scores, normalized direct/channel/preview ordering, direct transcript persistence, images, and resumed-session history accounting.
