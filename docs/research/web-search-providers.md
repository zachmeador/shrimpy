# 🦐 Web Search API Providers

Date: 2026-05-31
Status: Research

Survey of web search API providers that could back [SEARCH-001](../backlog/search-001-web-search-provider-wrapper.md): a compact "query in → ranked URLs/titles/snippets out" primitive, wrapped behind one Shrimpy provider seam, with thin HTTP adapters (no vendor SDKs in base dependencies) and API keys supplied via `apiKeyEnv` environment variables.

The bias here matches the backlog note: API-native search (not SERP-page scraping, not browser automation), single-key auth that maps to one env var, results that fit Shrimpy's normalized shape, and a free or near-free onboarding tier so a new install can try search without a billing relationship. Cost, longevity, and terms matter as much as raw quality.

Primary sources checked:

- [Brave Search API pricing](https://api-dashboard.search.brave.com/documentation/pricing) and [Brave: best search APIs 2026](https://brave.com/learn/best-search-api-2026/)
- [Tavily docs](https://docs.tavily.com/welcome) and [Tavily search endpoint](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- [Exa pricing](https://exa.ai/pricing) and [Exa search reference](https://docs.exa.ai/reference/search)
- [xAI web search tool docs](https://docs.x.ai/developers/tools/web-search)
- [Perplexity API pricing](https://docs.perplexity.ai/docs/getting-started/pricing)
- [Linkup pricing](https://docs.linkup.so/pages/documentation/development/pricing)
- [Serper.dev](https://serper.dev/) and [SerpAPI vs Serper comparison](https://scrape.do/blog/google-serp-api/)
- [Kagi Search API docs](https://help.kagi.com/kagi/api/search.html)
- [You.com Search API](https://you.com/docs/search/overview)
- [Jina Reader API](https://jina.ai/reader/)
- [SearXNG Search API docs](https://docs.searxng.org/dev/search_api.html)
- [Microsoft: Bing Search APIs retirement](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)

> Pricing moves fast in this space (see Brave and Bing below). Every figure here is "as of May 2026" and should be re-checked at implementation time. Do not hardcode prices anywhere; the wrapper only needs auth, params, and parsing.

## Short Answer

Two distinct product shapes hide under "web search API," and only one fits SEARCH-001:

1. **Search-result APIs** — return a ranked list of `{title, url, snippet, date?, score?}`. These map directly onto the SEARCH-001 normalized contract.
2. **Answer / grounding APIs** — return an LLM-generated answer plus citations. This is what **xAI Live Search** and **Perplexity Sonar** actually are. They are good, but they are a different shape (and a different cost model: per token, plus a per-call search fee) and belong to a future "research/answer" capability, not the compact search primitive.

Recommended adapter rollout for SEARCH-001:

- **First real adapter: Tavily.** Purpose-built for agents, cleanest contract fit, single bearer key, `time_range` and `include_domains` map 1:1 onto `--recency` / `--site`, and a standing 1,000 free searches/month for onboarding.
- **Second adapter: Brave Search.** An *independent* (non-Google) index, dead-simple REST with one header key, strong general-web quality. Caveat: Brave removed its free tier in February 2026 (now $5/month of metered credit, card required).
- **Budget / Google-coverage adapter (later): Serper.dev.** Cheapest credible option, fast, 2,500 free/month, returns Google SERP with rank + date. Caveat: it is Google-SERP-as-a-service — weigh terms and longevity.
- **Self-host / zero-key adapter (later): SearXNG.** Satisfies the note's "generic custom HTTP provider only if lawful/self-hosted" path; free, private, no API account. Caveat: user must run an instance and enable JSON output.
- **Always: a `mock` provider** for deterministic tests, per the note.

This keeps the base install SDK-free and key-free, gives a generous free onboarding path (Tavily), an independent index (Brave), a cheap high-volume option (Serper), and a fully self-hosted escape hatch (SearXNG).

## Why the classic default is gone

Microsoft **retired the Bing Search APIs on August 11, 2025**; existing instances were decommissioned and there is no new signup. The official migration path is "Grounding with Bing Search" inside Azure AI Agents, which is a platform commitment (Azure project, resource groups, model deployment), not a drop-in `GET /search`. Practically, the old "just call Bing" default no longer exists, which is exactly why an independent or agent-native provider is the right base for Shrimpy. ([Microsoft Lifecycle](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement))

## Evaluation criteria

Tied to SEARCH-001's contract and boundaries:

- **Shape fit** — does it return ranked results with title/url/snippet, ideally date + score, vs. an LLM answer?
- **Auth** — single API key passable as one env var (`apiKeyEnv`), no OAuth dance.
- **Recency control** — a normalized freshness param (`day|week|month|year`).
- **Site scoping** — domain include/exclude.
- **Onboarding** — real free tier or monthly credits, so a new install can try it.
- **Index independence** — own index vs. reselling Google SERP (affects terms, longevity, and the "don't scrape SERP pages" boundary).
- **Maintenance cost** — API stability, plain HTTP, no SDK requirement.

## Providers

### Tavily — recommended first adapter
- **Shape:** result list; each result has `title`, `url`, `content` (snippet), `score`. `topic: news` and `start_date/end_date` exist; a discrete `published_date` is not in the base schema (derive/fill when present).
- **Params:** `max_results` (0–20, default 5), `search_depth` (`basic|advanced|fast|ultra-fast`), `include_domains` (≤300) / `exclude_domains` (≤150), `topic` (`general|news|finance`), `time_range` (`day|week|month|year`), `country`. `include_answer` is optional and off by default — we keep it off; SEARCH-001 is discovery, not answers.
- **Auth:** `Authorization: Bearer tvly-…`.
- **Pricing:** credit-based; basic/fast = 1 credit, advanced = 2. PAYG ≈ $0.008/credit; **1,000 free searches/month**. Watch the Research endpoint — it can burn up to ~250 credits per call; the wrapper should only call `/search`.
- **Verdict:** best contract fit. `time_range`→`--recency` and `include_domains`→`--site` are essentially free. Built for exactly this use case.

### Brave Search — recommended second adapter
- **Shape:** web results with human-readable URLs + text snippets; freshness and age metadata available; also news/images/video and an "LLM context" endpoint.
- **Params:** `q`, `count`/`offset`, `freshness` (`pd|pw|pm|py` ≈ day/week/month/year), `result_filter`, `country`/`search_lang`. Site scoping via the `site:` query operator.
- **Auth:** `X-Subscription-Token: <key>` header.
- **Pricing:** **$5 per 1,000 requests**; **$5/month of free credit auto-applied** (~1,000 calls) but a **card is required and there is no spending cap** — the long-standing free 2,000/month tier was **removed in February 2026**. Existing free-plan subscribers were grandfathered.
- **Verdict:** the best *independent* index (not Google/Bing resale), trivial to wrap. The free-tier removal hurts zero-friction onboarding, so it slots in behind Tavily.

### Serper.dev — budget / Google coverage (later)
- **Shape:** Google SERP as JSON — `organic` results with `title`, `link`, `snippet`, `date`, `position` (rank). Knowledge graph, news, etc. also available.
- **Auth:** `X-API-KEY` header.
- **Pricing:** ~$0.30–$1.00 per 1,000 (cheapest credible option); **2,500 free credits/month**; fastest in third-party benchmarks (~1.7s).
- **Verdict:** unbeatable price/perf and a generous free tier, returns clean rank+date. Caveat: it is Google-SERP-resale; weigh terms-of-service and longevity vs. an owned index. Good as an optional high-volume adapter, not the default.

### SearXNG — self-hosted / zero-key (later)
- **Shape:** metasearch aggregator; `GET /search?q=…&format=json` returns `title`, `url`, `content`, `engine` per result. No reliable score/published date.
- **Auth:** none (your instance); JSON format must be enabled in `settings.yml` (HTML-only by default).
- **Pricing:** free; you host it.
- **Verdict:** the right answer for privacy-first / no-account users and a clean fit for the note's "lawful/self-hosted endpoint" exception. Setup friction (run + configure an instance) keeps it out of the default slot, but it's a great escape hatch and a natural `baseUrl`-driven adapter.

### Exa — semantic/neural (optional)
- **Shape:** neural + keyword (`auto`/`fast`/`deep`) over a proprietary index of tens of billions of pages; returns `title`, `url`, `publishedDate`, `score`, plus optional highlights/contents. Sub-150ms "instant" mode.
- **Auth:** `x-api-key` header.
- **Pricing:** search-with-contents **$7 per 1,000** (≤10 results); Deep $12–15/1k; **1,000 free requests/month**; Core plan $49/mo.
- **Verdict:** excellent for *conceptual/discovery* queries ("find pages like X") and research workflows, weaker for exact-keyword lookups. Strong candidate for a later "research" mode rather than the first general adapter.

### Linkup — agent-native, EU (optional)
- **Shape:** `/search` (standard/deep) returning results + sources; `/fetch` for extraction.
- **Auth:** bearer key; also supports **x402** pay-per-call (USDC on Base) with no account — interesting for fully autonomous agents.
- **Pricing:** Standard ≈ €5/1,000, Deep ≈ €50/1,000; **€5/month credit** auto-topped-up.
- **Verdict:** clean fit and a novel keyless payment path, but younger/smaller than Tavily/Brave — maturity/longevity risk. Watch it.

### You.com — LLM-ready (optional)
- **Shape:** web + news search returning LLM-ready snippets; separate Contents API for extraction.
- **Pricing:** **$5 per 1,000** web calls (effective March 2026); **$100 free credits** for new accounts.
- **Verdict:** solid and explicitly LLM-oriented, but priced like Brave with a less distinctive index. Reasonable alternate, not a first pick.

### Kagi — premium quality (optional)
- **Shape:** programmatic access to Kagi's premium results; also FastGPT / Summarizer endpoints.
- **Pricing:** **$15–$25 per 1,000**, invoiced at $100 accrual; **no free tier**.
- **Verdict:** arguably the best result *quality*, but the price and absence of a free tier make it a power-user opt-in, not a default.

### Jina Reader (`s.jina.ai`) — search+read combined (niche)
- **Shape:** `s.jina.ai/?q=…` returns top ~5 results as JSON with `url`, `title`, `content`, and `timestamp`. It's really search **fused with** page reading (returns content, not just snippets).
- **Auth:** optional — works keyless (rate-limited); a bearer key raises limits.
- **Pricing:** free tier with no key; token-based paid plans (~$20/mo+).
- **Verdict:** uniquely zero-setup (no key path), but the search+read fusion returns heavier payloads than a snippet list and overlaps with SEARCH-001's separation of search vs. fetch. Better fit for a future fetch/read workflow than the compact search tool.

### xAI Live Search — answer/grounding, NOT a SERP endpoint
- **What it is:** a **tool the Grok chat model invokes**, not a standalone search endpoint. The model decides to search and returns a generated answer; sources come back as `response.citations`. Domain filters exist (`allowed_domains` / `excluded_domains`, ≤5 each) but the docs expose **no result-count or recency/date params** for the search tool itself.
- **Auth:** `Authorization: Bearer $XAI_API_KEY`.
- **Pricing:** **$5 per 1,000 search calls _on top of_ Grok token costs** (Grok 4.x ≈ $1.25/$2.50 per 1M in/out); new accounts get promo credits.
- **Verdict:** genuinely good and well-cited, but it answers a different question than SEARCH-001. It returns *an answer with citations*, billed per token, not *a ranked result list*. If we want this, it belongs to a future "ask the web"/ research capability layered on top of an inference call — not the compact search primitive. (This is the one the user flagged; the takeaway is "great, but wrong shape for this slice.")

### Perplexity Sonar — answer/grounding (same category as xAI)
- **What it is:** search-grounded chat completions. Every Online/Sonar request runs live retrieval and returns an answer plus citations (Sonar Pro adds titles/snippets/dates). No separate per-search fee — it's in the token price (Sonar ≈ $1/1M; Sonar Pro $3 in / $15 out per 1M).
- **Verdict:** same story as xAI — an answer engine, not a result API. Note it for the future research/answer capability, not this one.

## Contract-fit matrix

Mapping to the SEARCH-001 normalized result shape (rank, title, url, snippet, source/site, published date, score) and required params:

| Provider | Family | Result list | Snippet | Date | Score | Recency param | Site scope | Auth (env) | Free onboarding | Index |
|---|---|---|---|---|---|---|---|---|---|---|
| **Tavily** | result | ✅ | ✅ `content` | ◐ news-only | ✅ | ✅ `time_range` | ✅ `include_domains` | Bearer | 1k/mo | own/agent |
| **Brave** | result | ✅ | ✅ | ✅ age | ◐ | ✅ `freshness` | ◐ `site:` | header token | $5/mo credit (card) | independent |
| **Serper** | result | ✅ | ✅ | ✅ | ✅ position | ◐ tbs | ◐ `site:` | header key | 2.5k/mo | Google resale |
| **SearXNG** | result | ✅ | ✅ | ✗ | ✗ | ◐ engine-dep | ◐ `site:` | none (self-host) | free (self-host) | metasearch |
| **Exa** | result | ✅ | ◐ highlights | ✅ | ✅ | ✅ date filters | ✅ | header key | 1k/mo | own (neural) |
| **Linkup** | result | ✅ | ✅ | ◐ | ◐ | ◐ | ◐ | Bearer/x402 | €5/mo credit | own |
| **You.com** | result | ✅ | ✅ | ◐ | ◐ | ◐ | ◐ | header key | $100 credits | own |
| **Kagi** | result | ✅ | ✅ | ◐ | ◐ | ◐ | ◐ | Bearer | none | own (premium) |
| **Jina** | search+read | ✅ (~5) | ✅ full content | ✅ ts | ✗ | ✗ | ✗ | optional Bearer | keyless tier | metasearch |
| **xAI** | answer | ✗ (answer) | citations only | ✗ | ✗ | ✗ | ✅ domains | Bearer | promo credits | Grok+web |
| **Perplexity** | answer | ✗ (answer) | citations only | ◐ Pro | ✗ | ✗ | ◐ | Bearer | none | own |

Legend: ✅ supported · ◐ partial / operator-based / plan-dependent · ✗ not really.

## What's actually free

The honest picture, since "free" is the question that decides whether a default install can search out of the box:

- **Truly free — no account, no card:**
  - **SearXNG** — free forever *if you self-host*. No vendor, no key. The cost is operational: you run an instance, it aggregates/scrapes upstream engines, and it can be rate-limited or blocked. The only "no relationship with anyone" option.
  - **Jina `s.jina.ai`** — keyless, rate-limited tier, no signup. Returns search+read (heavier/slower); fine for occasional lookups, not volume.
- **Standing monthly free allowance — signup, no card (confirm at signup):**
  - **Tavily** — ~1,000 searches/month, ongoing. Agent-native quality. The best "real free tier" today.
  - **Serper** — ~2,500 credits/month, ongoing. Google results, fast.
  - **Exa** — ~1,000 requests/month.
- **One-time or card-gated credits — not really "free":**
  - **You.com** ($100 once), **Brave** ($5/month but card required), **Linkup** (€5/month), **xAI / Perplexity** (promo credits, then per-token).

The trend is **erosion**: Brave removed its 2k/month tier in February 2026 and Bing's API was retired outright in August 2025. Do not design around any single vendor's free tier surviving.

**Design takeaway — architecture beats any free tier:**

- Base install requires **nothing** and simply reports search unavailable.
- Make **SearXNG a first-class adapter** — the only durable zero-vendor, zero-cost path, and it satisfies the note's self-hosted-endpoint boundary.
- Point onboarding docs at **Tavily (~1k/mo)** or **Serper (~2.5k/mo)** as the easiest real free tiers, while treating them as "may shrink."

## Recommendation for SEARCH-001

1. Build the provider seam + normalized result shape + a `mock` provider first (tests need no network or keys).
2. Ship **Tavily** as the first real adapter — best contract fit, recency/site map cleanly, standing free tier for onboarding.
3. Add **Brave** second for an independent index (note the card requirement).
4. Leave **Serper** (cheap/Google) and **SearXNG** (self-hosted) as documented, easy follow-on adapters — they exercise the seam from both the commercial-cheap and self-hosted-free ends.
5. Treat **xAI / Perplexity** (answer engines) and **Exa Deep** (research) as a *separate, later* "ask/research the web" capability, not part of this compact search primitive.

## Caveats

- **Pricing volatility is real.** Brave deleted its free tier (Feb 2026) and Bing was retired outright (Aug 2025). Keep cost/limits out of code; surface them via `shrimpy search status`, not constants.
- **SERP-resale vs. owned index.** Serper/SerpAPI resell Google results; that is cheap and familiar but carries terms-of-service and longevity exposure the note's "don't scrape SERP pages" boundary is wary of. Owned indexes (Brave/Tavily/Exa) are safer defaults.
- **Answer engines aren't search.** Wrapping xAI/Perplexity to fake a result list would discard their value and inflate cost. Keep search (discovery) and answers (synthesis) as separate capabilities.
- **Secrets discipline.** Every viable provider authenticates with a single key — perfect for `apiKeyEnv`. Keep keys in env only; never echo them in command output, logs, channel messages, or saved notes (already a SEARCH-001 boundary).
