# 🦐 Research Notes

Date: --
Status: Index

This directory holds source notes and comparison research that may inform future Shrimpy work. These files are not the stable user-facing docs; promote settled decisions into reference docs when they become part of the project contract.

## Notes

- [discord-adapter-interface.md](discord-adapter-interface.md) — high-level interface notes for a Discord DM-only chat adapter, including API shape, Shrimpy surface mapping, auth boundaries, and lessons from Hermes/OpenClaw.
- [local-browser-control.md](local-browser-control.md) — survey of agent web-browsing frameworks and local browser-control mechanisms; includes Webwright, Lightpanda, and how Hermes currently layers browser tools.
- [macos-seatbelt-helper.md](macos-seatbelt-helper.md) — high-level Seatbelt/App Sandbox notes and a small Mac helper shape for hosting Shrimpy with native per-agent sandboxing.
- [pi-agent.md](pi-agent.md) — notes from Pi's coding-agent architecture.
- [pi-skill-handling.md](pi-skill-handling.md) — focused notes on Pi skill discovery, loading, slash commands, and the Shrimpy integration gap.
- [qwen35-thinking-control.md](qwen35-thinking-control.md) — thinking-control research for Qwen 3.5 style models.
- [ralph-loops.md](ralph-loops.md) — loop and runtime behavior notes from Ralph-style agents.
- [rl-eval-framework.md](rl-eval-framework.md) — watchlist and eventual architecture notes for a Shrimpy personal RL/eval framework.
- [web-search-providers.md](web-search-providers.md) — survey of web search API providers for SEARCH-001 (Tavily, Brave, Serper, SearXNG, Exa, Linkup, You.com, Kagi, Jina) and why answer engines like xAI/Perplexity are a different shape.

## Promotion Rule

When a research conclusion becomes a project decision, copy the durable part into the relevant reference doc such as [architecture.md](../reference/architecture.md), [runtime.md](../reference/runtime.md), [configuration.md](../reference/configuration.md), [workspace.md](../reference/workspace.md), or [surfaces.md](../reference/surfaces.md), then keep the research note as background.
