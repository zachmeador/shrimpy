# 🦐 Research Notes

Date: --
Status: Index

This directory holds source notes and comparison research that may inform future Shrimpy work. These files are not the stable user-facing docs; promote settled decisions into reference docs when they become part of the project contract.

## Notes

- [discord-adapter-interface.md](discord-adapter-interface.md) — high-level interface notes for a Discord DM-only chat adapter, including API shape, Shrimpy surface mapping, auth boundaries, and lessons from Hermes/OpenClaw.
- [bluebubbles-adapter-interface.md](bluebubbles-adapter-interface.md) — high-level interface notes for a BlueBubbles/iMessage chat adapter, including REST/webhook shape, Shrimpy surface mapping, webhook lifecycle, identity, auth, and lessons from Hermes/OpenClaw.
- [local-browser-control.md](local-browser-control.md) — survey of agent web-browsing frameworks and local browser-control mechanisms; includes Webwright, Lightpanda, and how Hermes currently layers browser tools.
- [in-os-agent-sandboxing-and-git.md](in-os-agent-sandboxing-and-git.md) — research on practical macOS/Linux in-OS sandboxing, Gondolin-style VM-backed execution, current Codex/Claude patterns, and how sandboxed agent work can move through git or patch promotion.
- [macos-seatbelt-helper.md](macos-seatbelt-helper.md) — high-level Seatbelt/App Sandbox notes and a small Mac helper shape for hosting Shrimpy with native per-agent sandboxing.
- [facade-interactive-drama.md](facade-interactive-drama.md) — deep dive on Mateas and Stern's Façade, interactive drama mechanics, and lessons for Shrimpy story-agent architecture.
- [pi-agent.md](pi-agent.md) — notes from Pi's coding-agent architecture.
- [pi-skill-handling.md](pi-skill-handling.md) — focused notes on Pi skill discovery, loading, slash commands, and the Shrimpy integration gap.
- [pufferlib-personal-rl.md](pufferlib-personal-rl.md) — research on how PufferLib/PufferPPO could inform a Shrimpy personal RL framework, especially environment design, trajectory capture, small policy training, and trainer export boundaries.
- [rl-eval-framework.md](rl-eval-framework.md) — watchlist and eventual architecture notes for a Shrimpy personal RL/eval framework.
- [skillfish-skill-crud.md](skillfish-skill-crud.md) — review of knoxgraeme/skillfish's skill manager model, dependency fit, license/dependency concerns, and lessons for Shrimpy's prototyping skill CRUD.
- [web-search-providers.md](web-search-providers.md) — survey of web search API providers that can inform optional setup guidance for web lookup capability; also notes why answer engines like xAI/Perplexity are a different shape.

## Promotion Rule

When a research conclusion becomes a project decision, copy the durable part into the relevant reference doc such as [architecture.md](../reference/architecture.md), [runtime.md](../reference/runtime.md), [configuration.md](../reference/configuration.md), [workspace.md](../reference/workspace.md), or [surfaces.md](../reference/surfaces.md), then keep the research note as background.
