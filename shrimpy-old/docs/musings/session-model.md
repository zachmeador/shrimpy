# 🦐 Session Model

Date: --
Status: Draft

Notes on what the comms layer should feel like to a user.

This note is about user model and surface feel, not runtime mechanics.

## High-Level Framing

Shrimpy should be framed as a **multi-agent home AI system**, not one agent with extra surfaces.

The workspace is the home/system. Agents are persistent actors inside it.

## Core Terms

- **Agent** — a persistent identity with its own memory, tools, and habits.
- **Channel** — the shared message space. A Telegram chat, iMessage conversation, Discord DM/channel/thread, or TUI chat should all normalize to a channel in Shrimpy.
- **Session** — the private working context for one agent attached to one channel. This is the thing `/new` and `/clear` should reset for that agent.
- **Surface** — where interaction happens, such as TUI, a Telegram chat, or a future web chat.
- **Worker session** — a short-lived spawned session for bounded work, not a persistent peer like an app-agent.

## Important UX Rule

Users experience a stable chat, but the runtime likely needs a shared channel plus one private session per participating agent.

`/new` or `/clear` should reliably mean:

- same agent
- same channel
- same long-term memory and identity
- fresh session
- no hidden carryover from the prior working context unless explicitly pulled back in

The channel transcript should remain intact.

This needs to hold across all surfaces.

## Telegram And `/new`

In Telegram, the chat itself should normalize directly to a channel.

The likely model is:

- Telegram chat = channel
- agent = who the user is talking to
- session = that agent's private working context for that channel

So `/new` in Telegram should:

- keep the same Telegram chat
- keep the same channel
- keep the same agent
- create a new session for that agent on that channel
- archive the old session instead of mutating it
- keep the visible transcript in the channel, ideally with a boundary marker

This preserves the UX pattern users already expect from systems like OpenClaw while avoiding the jarring feeling of "clean context means the transcript disappeared".

## Deliveries

Worker-session results, app-agent updates, and background work should usually deliver into the same user channel the user is already in.

The important behavior is:

- deliveries are visible to the user in the channel
- deliveries are visible to the agents participating in that channel
- deliveries feel like a visit into the current conversation, not a side-channel notification the active agent cannot see

## TUI vs Routed Messaging

There are probably two comms modes, and that is acceptable:

- **Direct mode** — TUI and local CLI can open a channel/session pair directly.
- **Routed mode** — Telegram, web, and agent-to-agent comms go through the messaging layer first.

These can feel different at the edge, but they should converge on the same underlying channel/session model.

## Messaging Feel

- Channel-based surfaces should feel like shared rooms.
- Each agent can have its own private working context behind that room.
- Direct local sessions are acceptable as long as they still feel like the same system, not a separate toy mode.
- A visible reply should be intentional.
- Silence should mean "the agent chose not to speak yet," not "the system secretly dropped the message."
- Switching which agent you're addressing should feel lightweight and local to the current surface.
- Media should feel native, not bolted on.
- The transcript should survive session resets.

## Channels Should Stay Generic

Channels should not be reduced to "one agent's inbox".

A channel can be:

- a DM between a human and an agent
- a DM between two agents
- a multi-human/multi-agent group chat
- a system/event feed
- a task/work log

An inbox is just one possible channel convention, not the core primitive.

This is what makes multi-agent rooms possible: one human and many agents can all share the same channel while each agent keeps its own private session for that channel.

The clean mental model is closer to IRC with richer message types:

- channels are the durable shared rooms
- humans and agents are members of channels
- membership is the real source of truth for who watches a channel
- typed messages add richer payloads and control events on top of that room model

Triggering does not need to be clever:

- if an agent has effectively unlimited budget, it can just evaluate every message on channels it watches
- if an agent is budget-constrained, it can use cheap string pattern matching before waking the model
- mentions, keywords, and simple prefixes fit naturally into that cheap trigger layer
- this is an optimization choice for the participant, not the core routing model

## Likely Direction

The clean user-facing model is:

- users experience channels as chats
- humans and agents participate in channels
- each agent has its own resettable session per channel
- surfaces host channels
- adapters connect surfaces to the runtime

One special channel should exist by default:

- `home` — the default system/home room for background activity, system events, and home-level coordination

## Cross-Surface Extension

This model should extend naturally to other surfaces:

- Telegram chat -> channel
- iMessage conversation -> channel
- Discord DM / channel / thread -> channel
- TUI chat -> channel

Then `/new` means the same thing everywhere:

- keep the same channel
- start a new clean session for the addressed agent
- keep the channel transcript
- mark the reset boundary in channel history

The harder question across surfaces is visible identity, not session reset.

## Shared Flow Patterns

### Opening Shrimpy Locally

- Opening `shrimpy` should feel like entering a private working conversation with an agent.
- Running `shrimpy run "prompt"` should feel like a one-shot version of that same relationship.
- Local direct sessions can differ mechanically from routed surfaces, but the continuity should still come from the same identity, memory, and tools.

### Shared Channel Feel

- Sending into a channel should feel like writing into a durable room that agents can return to later.
- Replies from background work or other agents should usually show up in the same room the user is already using.
- A channel should feel stable even when the private working context behind an agent changes.

### Background Work

- Background activity should feel like quiet ambient help, not noisy unsolicited interruption.
- System events should land where they make sense for the user, not wherever is easiest for the runtime.
- Worker-session results should feel like a visit back into the conversation, not a detached notification stream.

### Boundaries

- There should be very little hidden magic around forgetting, memory changes, or session resets.
- If something important changes, the user should be able to understand what changed and where it will show up.

## Visible Identity

Internally, many agents may be active.

Externally, many surfaces will usually expose one visible identity:

- Telegram: most users will probably run one bot account
- iMessage / BlueBubbles: likely one visible identity
- Discord: may support richer visible identity patterns, but one default persona may still be the cleanest default

So the system likely needs to separate:

- internal agent identity
- visible surface identity

One clean one-account pattern is surface-local addressed-agent switching:

- one visible bot/account stays fixed
- the surface tracks which agent plain messages are addressed to
- later messages carry that addressed-agent metadata into the runtime
- channel membership does not change just because the surface target changed
