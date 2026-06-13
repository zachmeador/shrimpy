# 🦐 SEARCH-001: Web Lookup Capability

Status: todo
Priority: P2
Area: Search
Depends On: none

## Why

Agents sometimes need a fast web lookup that does not require opening and driving a browser. Shrimpy should make that capability easy to provide and reason about, but it does not need to own a web-search provider wrapper, a `shrimpy search web` command, or even a specific tool shape.

The shrimple path is: a user or workspace provides web lookup when they want it. That might be a Pi/custom tool, a model/provider-native web option, a browser/fetch workflow, a hosted search API, a self-hosted endpoint, or something else the runtime can expose honestly. Shrimpy can have an opinion during setup about a simple default path, then otherwise treats web lookup as optional external capability.

## Build

- Treat web lookup as optional capability, not as a Shrimpy CLI search corpus.
- Keep Shrimpy-owned CLI search commands for Shrimpy-owned local data: `channels search`, planned `sessions search`, and planned `workspace search`.
- During guided setup, optionally offer a small web-lookup recommendation when the current runtime has a straightforward path. A hosted default can be recommended when the user opts in and provides the needed auth; a self-hosted endpoint such as SearXNG can stay the no-vendor escape hatch.
- Store only non-secret configuration in workspace files if configuration is needed. Secrets stay in environment variables or the existing auth/secret path appropriate to the chosen mechanism.
- Make availability honest through existing inspection and prompt surfaces. Tool-shaped mechanisms should appear in the effective tool view; provider-native or workflow-shaped mechanisms should be documented in setup guidance and agent instructions rather than hidden behind a search-specific status command.
- Add setup/mechanic guidance that tells agents to use available web lookup when present, and to report the missing capability when none is present.
- Keep any default recommendation small and replaceable. Provider facts such as free tiers and pricing belong in docs or setup copy that can be refreshed, not hard-coded runtime policy.

## Boundaries

- Do not add `shrimpy search web`, `shrimpy search providers`, or `shrimpy search status`.
- Do not require web lookup to be represented as a tool.
- Do not build a Shrimpy-owned web-search provider registry, adapter layer, generic HTTP mapper, result normalizer, or mock provider just for web lookup.
- Do not add search provider SDKs or web-search dependencies to the base package.
- Do not require a web-search account, API key, self-hosted endpoint, browser tool, or cloud dependency for a normal Shrimpy install.
- Do not make browser automation the fallback when no web lookup is configured. Report the missing capability clearly.
- Do not hide provider costs or external-content risk. Setup guidance should be clear that web/search/browser-like capabilities can inject external content into a session.
- Do not store API keys, bearer tokens, or raw provider credentials in workspace Markdown, prompts, logs, channel messages, or saved research notes.

## Notes

- Research: [web-search-providers.md](../research/web-search-providers.md) surveys candidate providers that may inform optional setup guidance. It is not a plan for a Shrimpy provider wrapper.
- Related: [SEARCH-002](search-002-workspace-knowledge-search.md) covers local workspace knowledge search as `shrimpy workspace search`. Local search commands are noun-scoped because they query Shrimpy-owned corpora; web lookup is external capability.
- Related: [VAULT-002](vault-002-main-agent-capture-research.md) should define how source metadata and search-backed research notes are captured when web lookup is available.
- Related: search/fetch/browser skills should stay scoped and gated by available capability if those skills are later installed.

## Done

- Backlog and docs no longer describe a `shrimpy search web` command, Shrimpy-owned web-search provider wrapper, or mandatory web-search tool.
- Setup/mechanic guidance gives users a clear optional path for providing web lookup without making web lookup required.
- Existing inspection and prompt surfaces make web lookup availability honest for the chosen mechanism.
- Agents are guided to use available web lookup and to report missing capability when none is present.
- Secrets are never emitted in command output, prompts, logs, channel messages, daemon tool responses, or saved research notes.
- Tests cover any setup, inspection, or prompt changes made to surface web lookup availability.
