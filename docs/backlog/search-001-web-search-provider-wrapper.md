# 🦐 SEARCH-001: Web Search Tool Provider Wrapper

Status: todo
Priority: P2
Area: Search
Depends On: none

## Why

Agents need a fast web search primitive that does not require opening and
driving a browser. Browser automation is still the right tool for interactive
sites, authenticated flows, and page inspection, but quick discovery queries
should be a compact tool call with stable, source-linked results.

Most search API providers expose the same broad shape: query in, ranked URLs,
titles, snippets, dates, and provider metadata out. Shrimpy should use that
similarity as a provider seam instead of binding the base package to one vendor
or pulling several provider SDKs into the default install.

## Build

- Add CLI coverage before daemon tools, for example:
  - `shrimpy search web <query>`
  - `shrimpy search providers`
  - `shrimpy search doctor`
- Keep the first search command compact and agent-friendly:
  - `--provider <name>` to override the configured default;
  - `--count <n>` with a conservative default and maximum;
  - `--site <domain>` for scoped searches where the provider supports it;
  - `--recency <day|week|month|year>` or equivalent normalized freshness input;
  - `--json` for structured scripting output.
- Define a shared provider request/response contract that hides provider quirks
  behind one Shrimpy result shape:
  - original query;
  - resolved provider;
  - search timestamp;
  - result rank;
  - title;
  - URL;
  - snippet or summary;
  - source/site when available;
  - published or indexed date when available;
  - provider score or confidence when available.
- Implement provider adapters as thin HTTP wrappers using the platform fetch/HTTP
  stack where possible. Do not add vendor SDK packages to Shrimpy's base
  dependencies.
- Start with a small adapter registry and at least one real opt-in provider plus
  a test/mock provider. Candidate provider families include Brave Search,
  Tavily, Exa, Kagi, SerpAPI/Serper-style APIs, and SearXNG-compatible
  endpoints, but the first implementation should choose by API stability,
  result quality, setup friction, terms, pricing, and maintenance cost.
- Support a generic custom HTTP provider only if it can be configured without
  becoming a second scripting language. Prefer explicit adapters until a real
  workspace needs generic mapping.
- Add config in the normal workspace config path, for example:
  - `search.defaultProvider`;
  - `search.providers.<name>.type`;
  - `search.providers.<name>.baseUrl` where needed;
  - `search.providers.<name>.apiKeyEnv` rather than raw API keys in config.
- Support `SHRIMPY_SEARCH_PROVIDER` as a local override for experiments.
- Keep secrets out of prompts, logs, channel messages, command output, and saved
  search result notes. API keys should come from environment variables or the
  existing secret/auth storage path once that is available for tool providers.
- Add a doctor/diagnostic path that reports configured providers, missing API key
  env vars, unsupported provider types, and whether the default provider is
  usable.
- Add daemon tools only after the CLI is inspectable and tested. The agent-facing
  tool should mirror the CLI behavior and return bounded structured results with
  URLs suitable for citation and follow-up fetch/browser commands.
- Include search capability status in the effective tool capability view.
- Treat search as discovery, not source verification. The tool should return
  source links and snippets; follow-up page fetch/browser work should read the
  actual source before making claims that need precise attribution.

## Boundaries

- Do not implement web search by driving a search engine results page in a
  browser.
- Do not require any search provider, SDK package, API account, browser tool, or
  cloud dependency for the base Shrimpy install.
- Do not add multiple provider SDKs to `dependencies`; prefer plain HTTP
  adapters or optional external provider plugins later.
- Do not scrape HTML search result pages unless a user has explicitly configured
  a lawful/self-hosted endpoint intended for API-style access.
- Do not build a crawler, ranker, news monitor, or local web index in this item.
- Do not hide provider costs. Paid providers should require explicit
  configuration and clear diagnostics.
- Do not emit provider raw responses by default; keep command and tool outputs
  stable even when upstream providers change fields.
- Do not store API keys or bearer tokens in workspace Markdown, search result
  captures, prompts, logs, or channel messages.
- Do not make search automatically fall back to browser automation when no search
  provider is configured. Report the missing capability clearly instead.
- Do not add legacy aliases once the command vocabulary is chosen.

## Notes

- Research: [web-search-providers.md](../research/web-search-providers.md)
  surveys candidate providers and recommends Tavily first, Brave second, with
  Serper/SearXNG as follow-on adapters; xAI/Perplexity are answer engines, not
  result APIs.
- Related: [BROWSER-001](browser-001-default-browser-tool.md) remains the path
  for actual browser interaction and page inspection.
- Related: [SKILL-001](skill-001-web-fetch-action-patterns.md) can use search as
  the first discovery step before fetch/API/browser follow-up.
- Related: [VAULT-002](vault-002-main-agent-capture-research.md) should define
  how source metadata and search-backed research notes are captured.
- The useful layer split is:
  - provider API: Brave/Tavily/Exa/Kagi/Serp-style/SearXNG/etc.;
  - Shrimpy adapter: provider-specific auth, params, pagination, normalization;
  - CLI surface: `shrimpy search ...`;
  - agent-facing tool: bounded structured search results;
  - skills/workflows: decide when to search, fetch, browse, or save findings.
- This should stay lightweight enough that a user can ignore web search entirely
  and still have a normal Shrimpy install.

## Done

- `shrimpy search web <query>` returns stable, bounded, source-linked results.
- `shrimpy search providers` and `shrimpy search doctor` make provider
  availability inspectable.
- The base Shrimpy install does not require provider SDKs, API keys, browser
  automation, or cloud search accounts.
- Search provider config supports a default provider, provider-specific adapter
  type, base URL where needed, and API-key environment variable references.
- Missing or misconfigured providers produce clear diagnostics without breaking
  unrelated commands.
- At least one real opt-in HTTP provider and one mock/test provider are covered
  end to end.
- Agent-facing search tools mirror the CLI once the CLI behavior is stable.
- Effective agent tool inspection reports search capability availability.
- Secrets are never emitted in command output, prompts, logs, channel messages,
  daemon tool responses, or saved research notes.
- Tests cover CLI parsing, config/env resolution, provider normalization, missing
  provider diagnostics, result bounds, and stable output shapes.
