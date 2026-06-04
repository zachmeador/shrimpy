# 🦐 Framework Design - Author's Ideas

Date: --
Status: Source notes — superseded as nexus by [`../reference/design.md`](../reference/design.md). This file is kept for raw quotes and unsettled sketches; promote anything settled into the reference nexus instead of duplicating it here.

_Personal framework/hermes hybrid. MIT licensed, potentially hard-forking OpenClaw or Hermes._

## Design Philosophy

- Cleaner, less fuzzy than OpenClaw
- More opinionated where it helps the product feel clearer
- MIT license gives flexibility to fork and remix

## Product Shape

- Shrimpy should feel like one home system with many persistent agents inside it.
- Channels should feel like durable conversation rooms, not technical pipes.
- Sessions should feel private and resettable without making the visible chat history disappear.
- Surfaces should feel like different windows onto the same home, not separate products with unrelated behavior.
- Background work should feel ambient and intentional, not like random cron noise.
- Memory should feel like compact continuity and breadcrumbs, not a giant opaque blob.

## Taste

- Prefer legible systems over clever hidden automation.
- Prefer explicit user-visible actions over magic.
- Prefer high-signal, info-dense interfaces over padded consumer-app softness.
- Prefer shaping behavior through docs, tone, and conventions before adding more knobs.
- Multi-agent behavior should feel collaborative and natural, not like a hidden router picking one owner behind the scenes.

## Key Gaps In Existing Frameworks

### Cron / Scheduling

- Current tools often make periodic work feel fragmented and over-specialized.
- Better direction: one place to understand recurring work, what it did, and what matters next.

### Context Construction

**The real problem:** context construction should feel inspectable instead of black-boxed.

- You should be able to see what an agent is actually seeing.
- You should be able to compose context deliberately instead of trusting hidden defaults.
- You should be able to reason about what is expensive and what is worth including.

This is partly about developer ergonomics, but more importantly it affects how legible the whole system feels.

## Anti-MCP Stance

> "a core part of the new shrimpy/previously clank framework is rejection of mcp as much as possible, and having all of the agents work in py or ts sandboxes, with dynamic context construction providing api examples. main reason is mcp is token inefficient, and filling a session with tool info metadata is wasteful most of the time" — Author, 2026-03-24

## Home Agent Runtime Direction

> "this is a key thing:
>
> in my future llm framework, also known as shrimpy, i've been thinking a lot about the desired behavior i want and the ideal architecture. a home agent (my term for openclaw/shrimpy genre) should be seen as \"always running and working\" to the user. openclaw has heartbeats, which feels primitve and don't really work. i end up just making crons for everything.
>
> hermes-agent... idk it doesn't seem to do anything like this, or it doesn't work.
>
> 1: this system should be based entirely on real-world model budgets. this determines a quota of tokens per day, whatever.
> 2: there is something called a heartbeat but it isn't like openclaw's. heartbeat rates vary based off of if a user has been talking to shrimpy much.
> 3. the view of the heartbeat agent is focused on timestamps and changes of the context (but only at the summary level)
> 4. heartbeat agent can see and watch shrimpy sessions in real time. example: i'm sending stuff to shrimpy and a heartbeat fires at some semi-fixed time. in heartbeat's context it sees 1 line indicating a recent/current chat session
> 5. the context construction size of heartbeat and other agents in shrimpy-framework is dependent on budget. could depend on other things too, later scope
>
> another thing: other frameworks have done something similar... basically all memory items need to have 3 levels of state, two that get built by an agent. 1: raw 2: summarized to <= 3 paragraphs 3: summarized to 300 chars or less. (this is just an idea, probably not the best 3 sizes to do) this is done at the memory layer, and context is constructed by template. items in template are then rendered
>
> another thing: we clearly need a messaging system, something dead simple and not blackboxed. any sort of chat cli, chat web ui, needs this anyways. but i think it actually needs to be a primitive in the way context is constructed." — Author, 2026-03-27

Interpretation:

- The system should feel alive in a budget-aware way, not just wake up on a dumb fixed timer.
- Summaries and timestamps matter because they shape the feeling of recency and awareness.
- Messaging should feel first-class and legible.
- It is better to keep the whole thing understandable than to disappear behind framework magic.

## Pi Agent Direction

> "another thing. i'm getting more and more sure that this framework gets built around the pi agent. it's extremely modular/extensible and solves a lot of the bs i don't care about (tui, provider wrapping). hopefully its tool calling api and context construction isn't blackbox. please note this all down." — Author, 2026-03-27

Interpretation:

- Build on boring, proven foundations when they remove low-value infrastructure work.
- The important requirement is not novelty. It is keeping the system inspectable where it matters.

## UI Direction

> "btw if there is ever a shrimpy webui, it will be in sveltekit and i'm gonna borrow heavily from hugging face's design philosophy. they're info-dense and they do it right" — Author, 2026-03-27

Interpretation:

- If Shrimpy gets a web UI, it should be information-dense and high-signal.
- It should feel like a serious tool, not an over-padded consumer dashboard.

## Multi-Agent Apps

> starting to think that multi-agent is what makes sense, and that agents embody tasks or applications. the line between an app and an agent gets blurred. then when you have app agents running on their own heartbeats, chatting with your other app agents, while chatting with you, you get powerful emergent things

Interpretation:

- app-agents should be persistent peers, not just tasks
- they should usually deliver into the same user channel the user is already in
- on many surfaces, they may still speak through one main visible persona with attribution, rather than requiring a separate visible account per agent
- app-agents should feel like normal agents with stronger defaults, not a separate species of thing

## Init Experience

> the shrimpy init workspace docs defaults should be in the docs. then a polished shrimpy user init will be a tui walkthrough, you get a model provider working, then there's a guided agent wizard session that mutates and stores your shrimpy init markdowns.

Interpretation:

- Default workspace starter docs should come from repo-owned templates, not feel buried inside setup behavior.
- `shrimpy setup init` can stay minimal, but the polished direction is a guided onboarding session owned by a bundled admin/mechanic agent and supported by setup skills/resources.
- That onboarding should:
  - get at least one model/provider working
  - guide the user through shaping the initial agent
  - persist the resulting starter docs cleanly
- This is part of a larger pattern: Shrimpy should be able to launch guided interactive sessions that help users power up quickly, set up good defaults for their specific needs, and leave the resulting decisions in normal workspace files.

## Browser Automation

- If browser control exists later, it should feel like a practical capability in the system, not a flashy side demo.
