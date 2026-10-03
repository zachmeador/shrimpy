# 🦐 Chat Bridge Scout

Originally researched: 2026-10-03
Status: Research; nothing adopted, installed or run

The question: is there a permissively licensed Pi extension, library or lightweight app that connects agents to chat apps, which Shrimpy could use as its bridge layer instead of writing one? A research agent checked public sources on 2026-10-03. Statements here were read in the primary source linked under [Sources](#sources) unless marked **(I)** for the scout's inference or **(S)** for press or a search snippet. Line counts are estimates from byte sizes.

## Current recommendation

**Keep Shrimpy's own provider interface and its Telegram bridge, and borrow from two projects: Vercel's Chat SDK and NanoClaw's bridge to it.** Nothing permissive can be dropped in as the bridge layer under Shrimpy's constraints: usable as a library, one bot account per agent, outbound connections only, relay bots only.

- **Chat SDK is the closest, and it isn't a drop-in.** It's the only candidate that is library-shaped, permissively licensed, actively maintained, and covers Telegram (polling), Discord (gateway) and Slack (Socket Mode). Its gaps are listed [below](#adopting-chat-sdk).
- **NanoClaw shows the adoption path.** It wraps Chat SDK adapters in a long-running agent host, one `Chat` instance per bot, and added its own SQLite state adapter, its own text splitter, and native adapters for WhatsApp (Baileys) and Signal (signal-cli).
- **Pi's ecosystem has no library to adopt.** Pi ships no chat code. Its README points to `earendil-works/pi-chat`, which covers Discord and Telegram only, is a Pi extension coupled to Gondolin micro-VMs, and has had no code change since 2026-04-30. The Telegram, Discord and Slack Pi packages on npm are extensions bound to a live Pi session.
- **Everything else fails on one of four grounds:** it can't be separated from its host (OpenClaw, Hermes), it relies on a vendor-hosted relay (Spectrum, CopilotKit), it acts as a person's account (Baileys, agent-messenger), or it's stale (Matterbridge, Telegraf).

What the scout would do **(I)**:

1. Keep the Telegram bridge.
2. For Slack and Discord, wrap their Chat SDK adapters behind Shrimpy's provider interface, as NanoClaw does, and treat that wrapper as replaceable.
3. Write Signal (signal-cli) and iMessage (imsg) providers in-house. Every project that supports them uses a local helper process.
4. Treat WhatsApp as a decision. No option found is both a relay bot and outbound-only: the Cloud API is a relay bot but webhook-only, and Baileys is outbound but acts as a person's account.

## Serious candidates

| Candidate | License, language, last activity | Covers | Library? How it connects | Main gap |
|---|---|---|---|---|
| [Vercel Chat SDK](https://github.com/vercel/chat) (`chat`, `@chat-adapter/*`) | MIT, TypeScript. `chat@4.41.1` on 2026-09-28 | Telegram, Discord, Slack, WhatsApp Cloud, Teams, Google Chat and others. iMessage through vendor adapters. No Signal | Yes. Telegram: polling or webhook. Discord: gateway. Slack: Socket Mode or webhook. WhatsApp: webhook only | Truncates long messages instead of splitting; MarkdownV2 only on Telegram; needs a state adapter; no Signal |
| [NanoClaw](https://github.com/nanocoai/nanoclaw) | MIT, TypeScript. v2.4.0, pushed 2026-10-03 | Chat SDK's platforms, plus native WhatsApp (Baileys) and Signal (signal-cli) | Not a library. Reusable files: `chat-sdk-bridge.ts`, `state-sqlite.ts`, `channel-registry.ts` | Tied to its own agent and session model |
| [Claude Code channel plugins](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins) | Apache-2.0, TypeScript on Bun. Telegram plugin last changed 2026-08-13 | Telegram, Discord, iMessage | No. One stdio MCP server per bot, speaking Claude Code's channel notifications. Telegram uses grammY long polling | Claude Code's contract; one bot per process |
| [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat) | Apache-2.0, TypeScript. Last code change 2026-04-30 | Discord, Telegram | No. A Pi extension on the old `@mariozechner/*` scope, one Gondolin VM per channel | Weaker than Shrimpy's bridge; stale; Gondolin-coupled |
| [Spectrum](https://github.com/photon-hq/spectrum-ts) (`spectrum-ts`) | MIT, TypeScript. v12.10.1 on 2026-09-22 | iMessage, WhatsApp Business, Telegram, Slack | Yes. Telegram inbound is webhook-only, and the docs require a Photon project for most providers | Vendor-hosted path; inbound webhooks; no Discord |
| [OpenClaw](https://github.com/openclaw/openclaw) | MIT, TypeScript. v2026.9.8 on 2026-10-03 | 20+ channels | No. Channels are plugins of the host; the Telegram package is private | Inseparable: the npm package is 389 MB in 13,320 files |

Feature notes for Chat SDK: Telegram has reactions, edit, delete, a single typing call, files in and out, and forum topics. Discord has reactions, edit, delete, typing, files and threads. Slack has all of these. The core is 1.2 MB in 94 files with 7 dependencies, and adapters are 47 to 374 KB each. Its Telegram adapter alone is about 179 KB of non-test source, estimated at 4,000 to 5,000 lines against Shrimpy's 3,400 **(I)**.

## Adopting Chat SDK

One `Chat` instance per bot, each with a Telegram adapter in polling mode and a persistent state adapter. Handlers turn incoming messages into posts on the Shrimpy thread mapped from the SDK's thread ID, and outbound messages go through `thread.post` and the adapter's edit, delete and reaction calls **(I)**.

Shrimpy would still write:

- **A state adapter.** The interface has 18 methods; NanoClaw's SQLite version is 9.5 KB. Telegram polling needs a persistent one to recover across restarts.
- **A Markdown-aware splitter.** The Telegram and Discord adapters truncate. Only the WhatsApp adapter splits.
- **A decision on Telegram HTML.** The adapter emits MarkdownV2 or plain text, so Shrimpy's HTML formatter wouldn't carry over.
- **A typing keepalive.** The adapter sends one `sendChatAction`.
- **Per-bot lifecycle,** with namespaced state and health checks.
- **Discord gateway supervision.** The listener is duration-limited and built for serverless. NanoClaw forwards gateway events to a loopback HTTP server with backoff.
- **Retries.** Failures are thrown, nothing retries, and dedupe can skip a redelivery after a handler fails.
- **The other providers:** Signal, iMessage and WhatsApp.

Risks:

- **Churn.** 41 minor releases in about nine months. NanoClaw pins `chat` exactly, at 4.29.0 against the current 4.41.1.
- **Serverless-first design.** Mastra's channels, built on the same adapters, are webhook-only.
- **Duplicated concepts.** Subscriptions, locks, dedupe, concurrency and history all overlap with Shrimpy's chat server.
- **Several instances in one process** aren't documented. The only evidence is NanoClaw's practice.
- **The adapter seam.** `ChatInstance` has 25 members, so driving adapters without `Chat` is impractical.

The cheapest way to settle it is a one-day spike **(I)**: two Telegram bots in two `Chat` instances in one process, the Discord in-process listener for a day or two, and a kill mid-conversation with memory state to see what duplicates or drops.

## What to copy

- **NanoClaw's `chat-sdk-bridge.ts`** (MIT): state and routes namespaced per instance; splitting by paragraph, then line, then hard break; a Discord forwarder whose backoff resets after five stable minutes; an inbound-policy hook.
- **Anthropic's Telegram `server.ts`** (Apache-2.0): pairing codes with a sender allowlist; chunking by length or newline; a guard against two pollers on one token; retry on transient polling errors.
- **pi-chat:** its small connection contract (connect, disconnect, send, start typing, sync preview) and Discord catch-up after sleep.
- **[Crabline](https://github.com/openclaw/crabline)** (MIT): local mock providers for Discord, Slack, Signal, Telegram, WhatsApp and iMessage, for deterministic end-to-end tests. Only its README was read.
- **grammY** (MIT, 4 dependencies) with its runner, auto-retry and parse-mode plugins. If the hand-written Bot API client and poller should shrink, this is the lower-risk cut. OpenClaw and Anthropic's plugin both use it **(I)**.

## Everything else checked

- **Hermes Agent:** Python, MIT. Its gateway is tied to Hermes's own config loader. Not separable.
- **Matterbridge:** a Go binary, Apache-2.0, last released 2023-01-29. A chat-to-chat bridge with a basic REST API, and no Signal or iMessage.
- **Pi community extensions:** all attach to a live Pi session, and none offers a multi-bot library API. `piscord`'s peer range excludes Pi 1.0.0.
- **`@mariozechner/pi-mom`:** Pi's earlier Slack bot, removed from the monorepo and frozen on the old scope.
- **Mastra Channels:** built on Chat SDK adapters and webhook-only.
- **CopilotKit Channels SDK:** MIT, but needs CopilotKit's hosted or enterprise service to hold credentials and deliver events.
- **ElizaOS:** its Telegram plugin depends on Telegraf and the Eliza core.
- **Telegraf:** MIT, last npm release 2024-02-29.
- **Koishi and Satori:** general chatbot frameworks, not examined in depth.
- **agent-messenger:** acts as the person, with tokens extracted from desktop apps.
- **Baileys:** MIT, the WhatsApp Web socket API. It links as a person's device and is unofficial.
- **WhatsApp Cloud API:** the official relay-bot route, webhook-only.
- **signal-cli:** GPL-3.0, Java, unofficial, with JSON-RPC over HTTP, SSE or stdio. It needs a phone number. Running it as a separate process should keep GPL out of Shrimpy's code **(I)**.
- **iMessage:** `imsg` (MIT, Swift, JSON-RPC over stdio) is OpenClaw's only backend, and BlueBubbles server is Apache-2.0. All routes need a Mac signed into an Apple ID or a paid service, and there is no bot-account concept. See also the [BlueBubbles adapter notes](bluebubbles-adapter-interface.md).
- **OpenAI dots:** closed. Reachable from ChatGPT, Slack and Teams **(S)**, with no developer API or bridge code found.
- **Meta Muse:** closed. Its developer surface is connectors into Muse, not a bridge.

## Not verified, and surprises

- Nothing was run. "Works" claims come from docs, source and other projects' use.
- Whether several `Chat` instances in one process are safe beyond NanoClaw's practice, and whether the Discord in-process gateway path will stay.
- Whether Spectrum's Telegram provider works without a Photon project.
- Slack's message-length handling in the Chat SDK.
- OpenClaw no longer builds on Pi: its docs say it owns its runtime, and only `pi-tui` is still third-party.
- Pi's README sends readers to pi-chat for Slack automation, but pi-chat has no Slack.

## Sources

- Chat SDK: [LICENSE](https://raw.githubusercontent.com/vercel/chat/main/LICENSE), [`chat` npm metadata](https://registry.npmjs.org/chat/4.41.1), [Telegram adapter doc](https://chat-sdk.dev/adapters/official/telegram.md), [Discord adapter doc](https://chat-sdk.dev/adapters/official/discord.md), [Slack adapter doc](https://chat-sdk.dev/adapters/official/slack.md), [WhatsApp adapter doc](https://chat-sdk.dev/adapters/official/whatsapp.md), [Telegram adapter source](https://raw.githubusercontent.com/vercel/chat/main/packages/adapter-telegram/src/index.ts)
- NanoClaw: [chat-sdk-bridge.ts](https://raw.githubusercontent.com/nanocoai/nanoclaw/main/src/channels/chat-sdk-bridge.ts), [integrations doc](https://docs.nanoclaw.dev/integrations/overview), [package.json](https://raw.githubusercontent.com/nanocoai/nanoclaw/main/package.json)
- Claude Code plugins: [channels docs](https://code.claude.com/docs/en/channels), [Telegram `server.ts`](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/external_plugins/telegram/server.ts)
- pi-chat: [package.json](https://raw.githubusercontent.com/earendil-works/pi-chat/main/package.json), [commit history](https://api.github.com/repos/earendil-works/pi-chat/commits)
- Spectrum: [Telegram provider doc](https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/providers/telegram.mdx.vel), [getting started](https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/getting-started.mdx.vel)
- OpenClaw: [Telegram package.json](https://raw.githubusercontent.com/openclaw/openclaw/main/extensions/telegram/package.json), [npm metadata](https://registry.npmjs.org/openclaw/latest), [Pi doc](https://docs.openclaw.ai/pi), [Signal doc](https://docs.openclaw.ai/channels/signal), [iMessage doc](https://docs.openclaw.ai/channels/imessage)
- Hermes: [gateway AGENTS.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/gateway/AGENTS.md)
- Mastra: [channels docs](https://mastra.ai/docs/channels)
- OpenAI dots: [TechCrunch](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/)
- Meta Muse: [newsroom post](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [help page](https://www.meta.com/help/artificial-intelligence/1687253048996149/)
