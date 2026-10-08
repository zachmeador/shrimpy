# 🦐 Research Notes

Source notes and comparisons that may inform future work. They are background, and say nothing of how Shrimpy works now: the code, the skills and what an agent is told do. Several were written for old Shrimpy and name its parts.

Sandboxing starts from the [sandbox runtime scout](sandbox-runtime-scout-2026-08-26.md) and its [networking comparison](sandbox-runtime-scout-2026-08-26.md#networking-comparison), with the [OS and git](in-os-agent-sandboxing-and-git.md) note as background.

Thirteen notes whose subject the redesign settled, or that were written about another project as a competitor, were removed on 2026-10-08. Git has them.

## Notes

- [gooey-pi-desktop.md](gooey-pi-desktop.md) — source, history, security, slop, and architecture audit of GooeyPi as prior art for a Shrimpy desktop app, with a borrow-the-shell recommendation and bounded fork spike.
- [mcp-events-and-triggers-2026-10-04.md](mcp-events-and-triggers-2026-10-04.md) — what OpenAI's MCP Events page specifies, that it is a working group's draft and not in the MCP spec, what Pi's maintainers have said about MCP, and how it compares with the plan's triggers, with a don't-align-yet recommendation and the conditions for looking again.
- [chat-bridge-scout-2026-10-03.md](chat-bridge-scout-2026-10-03.md) — survey of permissive projects that connect agents to chat apps (Vercel's Chat SDK, NanoClaw, Pi's ecosystem, OpenClaw, Hermes and others), with a keep-our-own-interface recommendation and what to borrow.
- [bluebubbles-adapter-interface.md](bluebubbles-adapter-interface.md) — high-level interface notes for a BlueBubbles/iMessage chat adapter, including REST/webhook shape, Shrimpy surface mapping, webhook lifecycle, identity, auth, and lessons from Hermes/OpenClaw.
- [local-browser-control.md](local-browser-control.md) — survey of agent web-browsing frameworks and local browser-control mechanisms; includes Webwright, Lightpanda, and how Hermes currently layers browser tools.
- [in-os-agent-sandboxing-and-git.md](in-os-agent-sandboxing-and-git.md) — research on practical macOS/Linux in-OS sandboxing, current Codex/Claude patterns, and how sandboxed agent work can move through git or patch promotion.
- [sandbox-runtime-scout-2026-08-26.md](sandbox-runtime-scout-2026-08-26.md) — sandbox-runtime survey with a September 16 networking follow-up: SRT, nono, Smol Machines, Microsandbox, other process/VM candidates, advisories, licenses, and experiments.
- [facade-interactive-drama.md](facade-interactive-drama.md) — deep dive on Mateas and Stern's Façade, interactive drama mechanics, and lessons for Shrimpy story-agent architecture.
- [pi-agent.md](pi-agent.md) — Pi 1.0.0 upgrade evidence, native MCP/codemode and context hooks, plus durable source, process-kill recovery, client attachment, storage guarantees, and Shrimpy simplification boundaries.
- [oh-my-pi.md](oh-my-pi.md) — feature and architecture survey of the batteries-included Pi fork, including its coding tools, subagents, memory, protocols, trust boundaries, and the contracts worth studying without replacing Shrimpy's runtime.
- [codex-session-control.md](codex-session-control.md) — current Shrimpy-to-Codex worker mechanics, limitations of the `codex exec` transport, and a comparison of direct App Server, the Codex SDK, ACP adapters, and other control surfaces.
- [agent-loop-workflows.md](agent-loop-workflows.md) — taxonomy of agent loop and workflow shapes, what Pi makes easy or leaves to Shrimpy, and a possible path from goal-evaluated turns to scheduled and multi-agent runs.
- [rl-eval-framework.md](rl-eval-framework.md) — watchlist and eventual architecture notes for a Shrimpy personal RL/eval framework.
- [temporal-awareness-prompting.md](temporal-awareness-prompting.md) — deep dive on prompt/context-side temporal awareness research, with implications for Shrimpy turn context, watches, freshness metadata, and urgency cues.
- [agent-allowances-and-financial-stewardship.md](agent-allowances-and-financial-stewardship.md) — research on giving an agent a recurring budget, with a recommendation to show a shadow allowance before any real spending.
- [hermes-memory-survey-2026-05-21.md](hermes-memory-survey-2026-05-21.md) — survey of Hermes Agent's memory and compaction, including the template its compaction summary follows.
