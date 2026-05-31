# 🦐 Honcho

Date: --
Status: Research

`plastic-labs/honcho` — Python service + SDK, Apache-2.0. Hosted at `api.honcho.dev`, also self-hostable. The pitch: an "AI-native memory" backend that doesn't just store messages but runs LLM passes over them to keep an evolving model of who each peer is.

Hermes ships an in-tree plugin (`hermes-agent/plugins/memory/honcho/`) that swaps the default file-based memory for Honcho. OpenClaw ships an out-of-tree plugin you install with `openclaw plugins install @honcho-ai/openclaw-honcho`; only the docs and a Hermes-migration shim live in the openclaw repo.

## Primitives

- **Workspace** — top-level isolation namespace. Everything below scopes to one workspace.
- **Peer** — anyone who participates in conversation. The user is a peer. The agent is a peer. Sub-agents are peers. There is no "user vs assistant" distinction at the storage layer; both sides are observed symmetrically.
- **Session** — a conversation bucket holding messages between peers. Has a server-side rolling summary.
- **Representation** — Honcho's evolving model of a peer, returned by `peer.context()`. Dense prose, server-derived.
- **Peer card** — a curated factual snapshot of a peer (a list of strings). Smaller, more structured than the representation.
- **Conclusion** — a discrete persistent fact attached to a peer. The plugin's `honcho_conclude` writes one; deletion is gated to PII removal because Honcho is supposed to self-heal incorrect ones.
- **Dialectic** — `peer.chat(query)`. A natural-language Q&A endpoint. Honcho runs an internal LLM pass over the peer's accumulated observations and returns a synthesized answer, not raw excerpts.
- **Observation toggles** — per-peer flags `observeMe` (build representation from this peer's own messages) and `observeOthers` (this peer also models the other side). Two peers × two toggles → four flags.

The tagline "AI-native" really means: the storage layer itself burns LLM calls to derive insights, not just store and retrieve text. You ask "what does this user prefer for testing frameworks?" and Honcho synthesizes an answer from its internal observation pool.

## How a turn flows (Hermes plugin)

1. **Session init** (`__init__.py:275`) — resolve session name (`per-directory` / `per-repo` / `per-session` / `global`), create a Honcho session, optionally migrate `MEMORY.md`/`USER.md`/`SOUL.md` once for new sessions, fire a background "prewarm" dialectic call so turn 1 isn't empty.
2. **Before each turn**, in `prefetch()` at `__init__.py:547`:
   - **Layer 1 (base context)** — call `peer.context()`, format into sections (Session Summary, User Representation, User Peer Card, AI Self-Representation, AI Identity Card). Cached, refreshed every `contextCadence` turns.
   - **Layer 2 (dialectic supplement)** — call `peer.chat()` with a cold-start or warm-session prompt. Multi-pass when `dialecticDepth > 1` (audit pass, reconciliation pass), with bail-out heuristic if the prior pass already returned ≥300 chars or structured output. Cached, refreshed every `dialecticCadence` turns.
   - Both layers are concatenated, truncated to `contextTokens × 4` chars at a word boundary.
3. **Inject into the user message**, not the system prompt — wrapped in `<memory-context>...</memory-context>` fences. This is deliberate: keeping the system prompt static preserves prompt caching across turns. The cost: the next turn's user history will contain the injected block, so the plugin sanitizes those fences out before sending.
4. **After the turn**, in `sync_turn()` at `__init__.py:1120` — fire a background thread that chunks and writes both messages to Honcho (`messageMaxChars=25000`, with `[continued]` markers on splits). Honcho then runs its own server-side reasoning to update representations and conclusions.
5. **`on_session_end`** flushes any pending writes.

The dialectic also runs as a tool the model can call directly: `honcho_reasoning(query, reasoning_level)`. In `recallMode: "tools"` the auto-injection is suppressed and the model decides when to query.

## Knobs (about 30 of them)

Three orthogonal cost knobs — `contextCadence` (how often base context refreshes), `dialecticCadence` (how often the LLM dialectic fires), `dialecticDepth` (1–3 passes per fire). A query-length heuristic that scales reasoning level up at 120 / 400 chars. Empty-streak backoff so a silent backend doesn't get hammered. Stale-thread liveness check so a hung Honcho call can't block subsequent fires. Stale-result discard so an in-flight result for a stale conversational pivot doesn't get injected after a gap of trivial-prompt turns. A regex of trivial prompts (`yes|ok|sure|thanks|...`) that skips injection entirely. Lazy session init in tools-only mode. Cron context guard so background flush jobs don't fire dialectic. Multi-profile host blocks. Four observation toggles per peer with `directional` and `unified` presets.

The full reference is in `hermes-agent/plugins/memory/honcho/README.md`.

## How it maps to Shrimpy's shapes

Both systems land on a similar two-layer instinct, then diverge sharply on substrate.

| Concern               | Shrimpy                                       | Honcho                                                   |
| --------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Identity / voice      | `agents/<id>/SOUL.md` (file)                  | AI peer card + AI representation (server-derived)        |
| Operating rules       | `SYSTEM.md` (folds in Pi harness guidance)    | host block config + persona prompt                       |
| Long-lived facts      | `agents/<id>/MEMORY.md` (agent writes it)     | Conclusions + user peer card (Honcho writes them)        |
| World state           | `channels/*.jsonl` (append-only)              | `session.messages` (server-stored)                       |
| Live "what changed"   | per-turn context in `runtime/context/`       | dialectic supplement re-fired every N turns              |
| Multi-agent isolation | per-agent workspace dir, channel membership   | per-peer profile within a workspace                      |
| Inspection            | `cat`, `grep`, `shrimpy context`, JSONL diff  | `hermes honcho status`, dashboard at app.honcho.dev      |
| Cost per turn         | filesystem reads only                         | 1+ LLM calls (dialectic) + 1 service write (sync_turn)   |

So the shapes overlap — both have stable identity, durable breadcrumbs, conversational world, and a live supplement layer — but Honcho replaces the legible file substrate with an LLM-driven service, and replaces explicit agent-authored memory with derived server-side memory.

The closest analog to Shrimpy's per-turn context is Honcho's dialectic supplement: both are short-lived "what's relevant right now" injections. The difference is that turn-context items are deterministic state transitions ("3 new messages on `home` since you last handled it; inspect with…") while the dialectic is a fresh LLM synthesis. Turn-context items cost zero tokens to produce and point at inspect tools. The dialectic costs an LLM call and produces prose meant to be read in-line.

The closest analog to `MEMORY.md` is Honcho's conclusions + user representation. The difference is who writes them. In Shrimpy the agent decides what to commit; in Honcho the service decides via dialectic reasoning over observed turns. Honcho's deletion is gated to PII removal precisely because the service is supposed to self-heal — but that means a wrong derived "fact" lives on until it's reasoned away by future evidence, which directly conflicts with `memory-design.md`'s "explicit, reviewable, reversible" principle.

The "peers symmetric, not user-vs-assistant" abstraction is interesting and partially fits Shrimpy. Channel-based agents already have multiple participants (`human:alice`, `agent:shrimpy`, `agent:other`), and treating each as a peer with its own representation is conceptually clean. But Honcho's peer model assumes peers persist across sessions in a stable workspace; Shrimpy's channel participants are already first-class via `config/channels.json`, and each agent already has its own memory directory, so the multi-agent-isolation problem Honcho solves is one Shrimpy gets for free from the file layout.

## Idea quality

**The dialectic-storage idea is good.** "After each turn, run an LLM pass over the conversation to derive insights about the peer, and let the agent query those insights synchronously" is a real value-add for cross-session continuity in chat-style agents. It's also genuinely hard to replicate cheaply in a file-backed system — running an LLM over your own logs is expensive, the prompts to do it well are non-trivial, and keeping the derived layer fresh as conversation drifts is a problem most file-based memory systems just don't solve.

**Cold-vs-warm prompt selection is good.** Honcho's pass-0 prompt swaps based on whether base context is populated: "Who is this person?" when cold, "What from this session matters now?" when warm. That's a small, principled trick that biases the LLM toward novel signal at session start and toward continuity mid-session. Easy to steal regardless of substrate.

**The trivial-prompt skip is good.** A regex of `ok|yes|thanks|...` that suppresses memory injection entirely on one-word turns. Cheap, prevents stale derived context from derailing acknowledgement turns, and would be useful in any turn context system.

**The "peers symmetric" framing is good** — agent self-modeling is a category most memory systems handwave. Honcho's model where the agent is just another peer being observed is cleaner than the user/assistant split.

**The observation matrix is good** — `observeMe` × `observeOthers` × per-peer is precise enough to model "AI peer should not re-model the user from its own replies" or "agent persona is fixed, don't update it from self-observation". File-based systems usually conflate these.

## Implementation quality

**The Hermes plugin is heavy.** ~3500 lines across `__init__.py` (1329), `session.py` (1251), `client.py` (755), `cli.py` (1451). For comparison, shrimpy's `src/context/` weighs much less, and it covers *all* of context assembly, not just one memory backend.

A lot of that weight is intrinsic to the substrate, not accidental. The cost of "external service that costs money and has latency" is exactly: cadence gating, empty-streak backoff, stale-thread detection, stale-result discard, lazy init, cron guards, multi-pass bailout heuristics, sanitizer for the `<memory-context>` fence to keep it from leaking through the message history. These aren't gold-plating — every one of them exists because the simpler version produced a real bug. File-backed memory has zero of these problems.

The `<memory-context>` injection-into-user-message trick is **clever and concerning at the same time**. Clever because it preserves prompt caching by keeping the system prompt static. Concerning because it requires sanitizing the fence out of the user-message history on subsequent turns, otherwise the model sees its own injected memory as if the user had pasted it. The sanitizer exists. But it's the kind of trick that produces subtle bugs at the edges (gateway message replay, transcript replay, model retry).

The multi-pass dialectic with proportional reasoning levels and conditional bail-out is **probably over-engineered for the value it delivers**. The README itself notes that depth-3 doesn't always make 3 LLM calls because of the bail-out heuristic — which means in practice you're either paying for depth that often gets skipped, or you set depth=1 and just have one knob. The "self-audit + reconciliation" framing reads like an attempt to make the dialectic output structurally better, but it's exactly the kind of agent-bait taxonomy that `feedback_no_fluff.md` warns against. A simpler "fire one .chat() with a good prompt" probably gets 80% of the result.

The 30+ config knobs are **a tell**. The "three orthogonal cadence knobs" framing is real — they genuinely are independent — but most users will not tune `dialecticDepthLevels` or `reasoningLevelCap` or `injectionFrequency` correctly, and the right defaults are doing all the work. The number of knobs reflects the developers not yet knowing which lever matters.

**What's actually well-built:**

- Background prefetch with bounded timeout and graceful degradation when the service is slow.
- Liveness state exposed via `liveness_snapshot()` for diagnostics.
- The cold/warm prompt selection — small, principled, well-placed.
- Trivial prompt skip — small, principled, well-placed.
- Per-session cron guard so background flush turns don't fire dialectic.
- Migration of `MEMORY.md`/`USER.md`/`SOUL.md` is one-shot and skipped under `per-session` strategy (correctly avoids flooding with short-lived duplicates).

## Worth borrowing into Shrimpy

The two-layer instinct (durable + live) is one Shrimpy already has, and it lands on the right side of the trade-offs in `musings/memory-design.md`. Files for the durable layer keep it legible; turn-context items for the live layer keep it cheap and inspect-pointed. Honcho's specific approach — running LLM passes server-side to populate a derived memory — directly conflicts with the principles laid out in that musing ("legible rather than magical", "local-first transparency", "explicit, reviewable, reversible"). So the wholesale "swap MEMORY.md for Honcho" path is a poor fit on principle, not just on cost.

What is worth stealing as small primitives, regardless of substrate:

- **Cold-vs-warm prompt selection** in any future "summarize what I should know about this user" pass. If shrimpy ever runs a periodic memory-consolidation job, a single switch at "is this the first pass on this peer or a refresh" will make the prompts dramatically better.
- **Trivial-prompt skip**. If turn-context items or any future live layer ever invoke an LLM, the same regex (or its TS port) avoids spending tokens on "ok" and "thanks".
- **`observeMe` / `observeOthers` per-peer toggles**. If shrimpy ever derives memory from observed channel traffic — even cheap things like "summarize what each agent did in this channel today" — the observation matrix is a useful model for what feeds what. Today every agent has its own `MEMORY.md` so the question doesn't arise; the moment shared-channel memory gets derived, it will.
- **The per-peer abstraction itself**, as an architectural reframing — channels already have typed senders (`human:*`, `agent:*`), and a future memory-derivation pass that treats each as a peer with its own card would mirror Shrimpy's existing channel membership model cleanly.

What is **not** worth borrowing:

- The external-service substrate, full stop. Files first. The `musings/memory-design.md` principles all push the same direction.
- The 30+ config knobs. If a feature lands, land it with one knob.
- The multi-pass dialectic with bail-out. One `.chat()` (or in Shrimpy's case, one consolidation pass) with a good prompt is plenty.
- The `<memory-context>` fence-into-user-message trick. Shrimpy turn-context items use a compact `<context>...</context>` envelope with inspect pointers, which is cleaner.
- Server-derived conclusions that the user can only delete for "PII reasons". That's the spookiest version of autonomous memory upkeep, and `musings/memory-design.md` explicitly flags spooky as a non-goal.

## Sources

- [Hermes plugin source](https://github.com/sdfgeoff/hermes-agent/tree/main/plugins/memory/honcho)
- [OpenClaw plugin docs](https://docs.openclaw.dev/concepts/memory-honcho)
- [Honcho upstream](https://github.com/plastic-labs/honcho) and [docs.honcho.dev](https://docs.honcho.dev)
- [Hermes feature doc](https://github.com/sdfgeoff/hermes-agent/blob/main/website/docs/user-guide/features/honcho.md)
- Shrimpy comparisons: [memory-design.md](../musings/memory-design.md), [context-assembly.md](../reference/context-assembly.md), [workspace.md](../reference/workspace.md)
