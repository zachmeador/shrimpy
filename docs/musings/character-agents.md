# 🦐 Character Agents As Architecture Test

Date: 2026-04-17
Status: Draft

## Purpose

Use a weird but revealing art-project shape as a design test for Shrimpy:

- one agent behaves like a character from a story
- other agents act like internal voices or cognitive fragments
- those voices can contribute context to the character without becoming a special runtime species

If this can be built cleanly, Shrimpy likely has the right seams for more practical multi-agent systems too.

## Why This Is A Good Test

A "mostly useless" character agent is a strong pressure test because it demands:

- strong agent identity and tone
- cheap multi-agent coordination
- inspectable context assembly
- scoped memory
- long-lived background behavior
- model and personality differences without framework hacks

The weird use case matters because it exposes whether extensibility is real or just accidental.

## Target Shape

The clean version should look like normal Shrimpy composition:

- **Character agent** — a normal persistent agent with its own instructions, memory, tools, and model choice.
- **Voice agents** — separate agents or other context producers that watch events and emit candidate reactions, biases, fears, instincts, or interpretations.
- **Context assembly step** — an explicit step that decides which voice outputs, if any, get included in the character's next turn.
- **Channels** — the shared routing and log surface where events and voice outputs can be observed.
- **Sessions** — the private working context that actually holds the character instructions and final assembled turn context.

The important constraint is that the voices contribute context. They do not silently rewrite the character's identity or mutate global runtime behavior.

## Architecture Requirements

For this to feel like composition instead of hacking, Shrimpy should support:

- **Distinct agent identity** — persona, tone, tools, memory, and model choice belong to the agent cleanly.
- **Pluggable context sources** — session context can be assembled from more than static docs and raw user input.
- **Inspectable context assembly** — it should be possible to see what the character actually saw on a turn.
- **Scoped memory** — the character and the voices should not be forced into one shared opaque memory blob.
- **Cheap background work** — voices can stay alive cheaply, wake on relevant events, and emit short outputs.
- **Normal comms primitives** — channels and messages should be sufficient for coordination and logging.
- **Attribution and delivery control** — voice chatter, user-visible replies, and internal context should be separable.
- **Model heterogeneity** — different voices can use different models, budgets, and personalities.

## What Shrimpy Should Not Do

This should not require:

- a special built-in "inner voice" runtime concept
- arbitrary agents directly editing another agent's system prompt
- arbitrary agents directly writing into another agent's memory
- hidden context mutation with no visible trace
- channel-specific hacks that only work for this one art project

If the framework needs those shortcuts, the seams are probably in the wrong place.

## Clean Mental Model

One useful mental model is:

- channels are where events and candidate voice outputs live
- sessions are where a specific agent actually thinks
- a context policy decides what crosses from the channel world into the session world

That keeps the weirdness contained in an inspectable composition layer instead of spreading special cases across the runtime.

## Litmus-Test Questions

Shrimpy is on the right track if the answer to most of these is yes:

- Can a character agent be created as an ordinary agent, not a bespoke feature?
- Can multiple voice agents observe the same channel cheaply?
- Can those voice agents emit short candidate thoughts without forcing them into the final reply?
- Can the character's next-turn context include selected voice outputs through a visible assembly path?
- Can the character keep its own memory while each voice keeps separate memory or no memory at all?
- Can the system explain why a given voice snippet was included?
- Can a normal practical setup reuse the same primitives for planners, critics, watchdogs, or style filters?

## Example Composition

One plausible setup:

- a `detective` character agent owns the user-facing reply
- `instinct`, `empathy`, `panic`, and `logic` run as separate lightweight agents
- a shared channel receives user messages and environmental events
- each voice can post a compact candidate reaction to that channel or another inspectable scratch channel
- a context assembly step selects the few voice snippets worth injecting into the `detective` session
- the `detective` session produces the visible reply

Nothing in that flow should be unique to fiction. The same structure should also work for practical helper swarms.

## Morning Letter Pattern

A smaller character-agent pattern is a single resident character that writes the user a letter every morning.

The workspace shape can stay ordinary:

- one character agent with a strong personality, voice, lore, and relationship to the user
- one watch-origin message that asks the agent to write a morning letter
- one user-facing channel where the letter is delivered
- character memory that preserves important user facts, fictional continuity, recurring motifs, and new lore
- normal memory-management watches that maintain and refine that state over time

The interesting part is that the agent is encouraged to build its lore, then the Shrimpy memory system keeps that lore alive as normal workspace state. This makes the pattern playful without needing special runtime machinery.

## What This Protects

Using this as a design test helps protect a few important Shrimpy values:

- channels stay generic instead of collapsing into one-agent inboxes
- sessions stay the place where instructions actually live
- skills stay as session prompts
- weird art projects do not pollute boring reliable agents with special runtime behavior
- multi-agent behavior grows from simple primitives instead of hidden orchestration magic

## Product Interpretation

If Shrimpy can support this cleanly, it is probably becoming the kind of system that encourages:

- persistent personalities
- cheap ambient thought loops
- agent-to-agent chatter
- app-like agents with distinct roles
- experiments that are playful without requiring framework abuse

That feels aligned with the broader goal: OpenClaw without bloat, but with stronger seams for always-on, cheap, multi-agent life.
