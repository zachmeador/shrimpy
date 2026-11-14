# 🦐 Research Notes

Source notes and comparisons that may inform future work. They are background, and say nothing of how Shrimpy works now: the code, the skills and what an agent is told do. Several were written for old Shrimpy and name its parts.

Sandboxing starts from the [sandbox runtime scout](sandbox-runtime-scout-2026-08-26.md) and its [networking comparison](sandbox-runtime-scout-2026-08-26.md#networking-comparison), with the [OS and git](in-os-agent-sandboxing-and-git.md) note as background. The web client, a companion app and reaching Shrimpy from a phone start from the [clients scout](clients-scout-2026-11-11.md), and Claude Code and Codex from the [coding-agents scout](coding-agents-scout-2026-11-11.md). What changed in Pi after the 1.0.0 that Shrimpy pins is in [the Pi note](pi-agent.md#upstream-after-100).

Thirteen notes whose subject the redesign settled, or that were written about another project as a competitor, were removed on 2026-10-08. On 2026-11-11 the GooeyPi audit and the note on controlling Codex sessions were removed, since the two scouts of that day carry what they found, and seven notes were trimmed. Git has every note whole.

## Notes

- [clients-scout-2026-11-11.md](clients-scout-2026-11-11.md) — what Shrimpy's web client and a later companion app can borrow from open-source agent apps, chat apps and UI kits, how the owner reaches Shrimpy from a phone, and sign-in rules to copy.
- [mcp-events-and-triggers-2026-10-04.md](mcp-events-and-triggers-2026-10-04.md) — MCP events, a draft outside the MCP spec that ChatGPT uses, compared with Shrimpy's triggers: why not to align yet, what outside events would need, and when to look again.
- [chat-bridge-scout-2026-10-03.md](chat-bridge-scout-2026-10-03.md) — projects that connect agents to chat apps (Vercel's Chat SDK, NanoClaw and others): none replaces the provider interface, and what a chat adapter could borrow.
- [bluebubbles-adapter-interface.md](bluebubbles-adapter-interface.md) — BlueBubbles, a server on a Mac that bridges iMessage: its setup, its REST and webhook API, and lessons for a chat provider built on it.
- [local-browser-control.md](local-browser-control.md) — tools that let an agent drive a web browser, as of May 2026, with agent-browser and Chrome as its pick.
- [in-os-agent-sandboxing-and-git.md](in-os-agent-sandboxing-and-git.md) — what macOS and Linux offer for confining an agent's process, and the ways a sandboxed agent's code changes can reach a git repository, with the risks of each.
- [sandbox-runtime-scout-2026-08-26.md](sandbox-runtime-scout-2026-08-26.md) — candidate sandboxes for a whole agent process (SRT, nono, Smol Machines, Microsandbox and others), how their network rules differ, and the tests to pass before trusting one; as of 2026-09-16.
- [facade-interactive-drama.md](facade-interactive-drama.md) — Mateas and Stern's Façade: how a player's words become story state and beats, and what a story agent could take from it.
- [pi-agent.md](pi-agent.md) — what changed in Pi after the 1.0.0 that Shrimpy pins (the removed client and server packages, Chord v2, options for Shrimpy's wire, Earendil's apps and pi-ai's Anthropic sign-in), Pi features left for later, and a source and crash-recovery investigation of the durable runtime.
- [oh-my-pi.md](oh-my-pi.md) — Oh My Pi, a fork of Pi, as of August 2026, with ideas for helpers, memory, tool rules and compaction.
- [coding-agents-scout-2026-11-11.md](coding-agents-scout-2026-11-11.md) — how Shrimpy's agents could drive Claude Code and Codex, and the owner open their sessions from Shrimpy's clients: control surfaces, the vendors' terms on a person's subscription, bridges, ACP, and what an agent restart does to a running turn.
- [claude-managed-agents-2026-11-12.md](claude-managed-agents-2026-11-12.md) — self-hosted Claude Managed Agents, Anthropic's agent service run on a customer's own servers: what a deployment runs, its split of the agent loop from the sandbox, why Shrimpy shouldn't build on it, and what it says about where Shrimpy's trust line sits.
- [agent-loop-workflows.md](agent-loop-workflows.md) — the shapes an agent loop can take, and an idea kept for later: work that goes on until a check says the goal is met, within an attempt cap and a budget.
- [rl-eval-framework.md](rl-eval-framework.md) — personal evals before any model training, and the RL projects to watch, as of May 2026.
- [temporal-awareness-prompting.md](temporal-awareness-prompting.md) — three papers on how models act on time: a plain urgency cue beat a countdown, a general reminder about time did little, and examples of how fast things change helped the strongest models.
- [agent-allowances-and-financial-stewardship.md](agent-allowances-and-financial-stewardship.md) — a recurring allowance for an agent's models, tools and purchases, starting with a shadow balance before any real money.
- [hermes-memory-survey-2026-05-21.md](hermes-memory-survey-2026-05-21.md) — Hermes Agent's memory files, past-session search and compaction summaries, as background for Shrimpy's compaction guidance.
