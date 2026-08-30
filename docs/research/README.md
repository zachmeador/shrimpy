# 🦐 Research Notes

Date: --
Status: Index

This directory holds source notes and comparison research that may inform future Shrimpy work. These files are not the stable user-facing docs; promote settled decisions into reference docs when they become part of the project contract.

## Notes

- [acp-explainer.md](acp-explainer.md) — canonical overview of ACP's stable v1 shape, negotiated capabilities, multimodal content, trust and product limits, and the direction and draft status of v2.
- [bb-shrimpy-resident-agents.md](bb-shrimpy-resident-agents.md) — comparison of bb's thread-centered coding workspace with Shrimpy's resident-agent home, including ACP and CLI/SDK seams, overlap risks, authority questions, and research probes that avoid a dedicated integration.
- [gooey-pi-desktop.md](gooey-pi-desktop.md) — source, history, security, slop, and architecture audit of GooeyPi as prior art for a Shrimpy desktop app, with a borrow-the-shell recommendation and bounded fork spike.
- [buzz-shrimpy-environment.md](buzz-shrimpy-environment.md) — evaluation of Buzz as Shrimpy's main chat UX, including practical Nostr consequences, runtime overlap, deployment weight, a lightweight setup-skill proposal, and the native surface needed for live chat.
- [discord-adapter-interface.md](discord-adapter-interface.md) — high-level interface notes for a Discord DM-only chat adapter, including API shape, Shrimpy surface mapping, auth boundaries, and lessons from Hermes/OpenClaw.
- [bluebubbles-adapter-interface.md](bluebubbles-adapter-interface.md) — high-level interface notes for a BlueBubbles/iMessage chat adapter, including REST/webhook shape, Shrimpy surface mapping, webhook lifecycle, identity, auth, and lessons from Hermes/OpenClaw.
- [local-browser-control.md](local-browser-control.md) — survey of agent web-browsing frameworks and local browser-control mechanisms; includes Webwright, Lightpanda, and how Hermes currently layers browser tools.
- [in-os-agent-sandboxing-and-git.md](in-os-agent-sandboxing-and-git.md) — research on practical macOS/Linux in-OS sandboxing, current Codex/Claude patterns, and how sandboxed agent work can move through git or patch promotion.
- [macos-seatbelt-helper.md](macos-seatbelt-helper.md) — high-level Seatbelt/App Sandbox notes and a small Mac helper shape for hosting Shrimpy with native per-agent sandboxing.
- [pi-sandboxing-implementations.md](pi-sandboxing-implementations.md) — factual comparison of nono, pi-sandbox, and pi-permission-modes, including their enforcement boundaries, configuration behavior, and uncovered capabilities.
- [sandbox-runtime-scout-2026-08-26.md](sandbox-runtime-scout-2026-08-26.md) — current sandbox-runtime scout covering Anthropic SRT, Microsandbox, Shuru, MXC, OpenShell, and newer local process and microVM options, with a recommended SECURITY-006 bake-off.
- [shrimpy-constrained-tool-profile.md](shrimpy-constrained-tool-profile.md) — analysis of resolving the existing session `profileId` into a security policy with path-bounded file operations, no Bash, and narrowly typed wrappers for selected Shrimpy actions.
- [facade-interactive-drama.md](facade-interactive-drama.md) — deep dive on Mateas and Stern's Façade, interactive drama mechanics, and lessons for Shrimpy story-agent architecture.
- [pi-agent.md](pi-agent.md) — Pi architecture, Shrimpy's integration boundary, the latest stable upgrade assessment, and package-ecosystem opportunities.
- [oh-my-pi.md](oh-my-pi.md) — feature and architecture survey of the batteries-included Pi fork, including its coding tools, subagents, memory, protocols, trust boundaries, and the contracts worth studying without replacing Shrimpy's runtime.
- [hermes-agent-harness.md](hermes-agent-harness.md) — source and history survey of Hermes Agent's custom Python model/tool harness, the narrower `execute_code` Python environment, former Mini-SWE integration, and implications for Shrimpy's Pi boundary.
- [codex-session-control.md](codex-session-control.md) — current Shrimpy-to-Codex worker mechanics, limitations of the `codex exec` transport, and a comparison of direct App Server, the Codex SDK, ACP adapters, and other control surfaces.
- [pi-skill-handling.md](pi-skill-handling.md) — focused notes on Pi skill discovery, loading, slash commands, intelligent context-selection proposals, community routing extensions, and the Shrimpy integration gap.
- [agent-loop-workflows.md](agent-loop-workflows.md) — taxonomy of agent loop and workflow shapes, what Pi makes easy or leaves to Shrimpy, and a possible path from goal-evaluated turns to scheduled and multi-agent runs.
- [pufferlib-personal-rl.md](pufferlib-personal-rl.md) — research on how PufferLib/PufferPPO could inform a Shrimpy personal RL framework, especially environment design, trajectory capture, small policy training, and trainer export boundaries.
- [rl-eval-framework.md](rl-eval-framework.md) — watchlist and eventual architecture notes for a Shrimpy personal RL/eval framework.
- [skillfish-skill-crud.md](skillfish-skill-crud.md) — review of knoxgraeme/skillfish's skill manager model, dependency fit, license/dependency concerns, and lessons for Shrimpy's prototyping skill CRUD.
- [temporal-awareness-prompting.md](temporal-awareness-prompting.md) — deep dive on prompt/context-side temporal awareness research, with implications for Shrimpy turn context, watches, freshness metadata, and urgency cues.
- [web-search-providers.md](web-search-providers.md) — survey of web search API providers that can inform optional setup guidance for web lookup capability; also notes why answer engines like xAI/Perplexity are a different shape.

## Promotion Rule

When a research conclusion becomes a project decision, copy the durable part into the relevant reference doc such as [architecture.md](../reference/architecture.md), [runtime.md](../reference/runtime.md), [configuration.md](../reference/configuration.md), [workspace.md](../reference/workspace.md), or [surfaces.md](../reference/surfaces.md), then keep the research note as background.
