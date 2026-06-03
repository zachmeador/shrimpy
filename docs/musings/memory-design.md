# 🦐 Memory Feel

Date: 2026-04-03
Status: Draft

## Purpose

Define the desired feel of memory in Shrimpy.

## Current Read

The current derived peer/channel memory implementation is not the target. It is
useful scaffolding, but it is too much like global framework state and too
little like an agent maintaining its own working model of the people, channels,
and agents it actually interacts with.

Peer cards are still a good idea. The likely better shape is not "the framework
silently owns all peer cards." It is closer to:

- agents notice that they have interacted with a peer or channel
- the agent gets a normal task to update its own relationship/context note
- the note is markdown, inspectable, and editable
- a skill describes the desired card shape and update discipline
- channel logs and sessions remain evidence, not the memory product

That fits Shrimpy's agent/channel model better than one opaque derived-memory
blob.

Relationship cards should be per-agent only. If something truly belongs in
workspace-wide system context, put it in the static workspace markdowns instead
of promoting it through a hidden shared memory substrate.

`state/memory.json` is probably the wrong concept and execution. At most, a
machine state file might be useful as a low-level cursor/index/cache, but it
should not be the product shape of memory.

## First Principles

Memory is not one feature. It is the arrangement of several things:

- raw logs and session transcripts
- truncation and compaction of working context
- summaries at different levels of detail
- selective prompt injection at turn time
- command-generated prompt injections
- storage layout and naming
- watches that ask agents to review or update memory
- tools and skills that let agents create, read, update, and delete memory
- time-awareness across all of the above

The acid test for a memory system:

- it does not pollute context
- it does not pollute storage
- it remembers what the user cares about
- it remembers what the agent needs to do its job

Everything else is implementation.

## Principles

- Always-on memory should be small, high-signal, and calm.
- Memory changes should be explicit, reviewable, and reversible.
- The system should prefer summaries and breadcrumbs over dumping raw material into every conversation.
- Memory should support continuity without making the agent feel stuck or haunted by old context.
- The user should be able to trust that memory is legible rather than magical.
- Local-first transparency matters, especially for a single-user system.
- One healthy target is generous enough budget that continuity can stay rich without pretending tokens are infinitely cheap.
- Memory should be tied to Shrimpy's real nouns: users, agents, channels, sessions, watches, and skills.
- The framework should provide memory surfaces and update prompts; agents should own judgment about what matters.
- Time is part of memory, not just metadata. Agents need a compact sense of
  what happened recently, what is stale, what recurs, and what changed since
  the last relevant interaction.
- Memory upkeep should not depend on a mysterious framework agent-caller that
  silently decides when to wake agents. If a memory manager exists, it should sit
  to the side and send normal messages/orders to agents or users over channels.
- Prompt injections should be a first-class, agent-editable interface. The
  common shape is a bash command that emits a compact text block for Shrimpy to
  inject under clear timing, channel, and size rules.

## Non-Goals

- Hidden autonomous memory mutation with no trail.
- Giant opaque long-term memory stores as the default.
- Premature scale architecture before the memory experience feels right.
- A memory system that only works if the user understands `src/`.
- A global peer-card blob that agents cannot naturally inspect, edit, or reason about.

## Desired Layers

- **Evidence** — channel logs, session transcripts, files, and documents.
- **Working context** — recent messages, active task state, compaction summaries, and turn context.
- **Time context** — compact recency/staleness/change summaries available in
  every agent session, either as stable system context or progressive turn
  injections.
- **Agent-authored memory** — durable markdown notes an agent maintains because they help it do its job.
- **Relationship cards** — agent-owned notes about users, agents, or channels the agent has actually interacted with.
- **Rendered context** — the tiny selected slice injected into a turn.
- **Injection commands** — shellable producers of compact markdown/plaintext
  blocks that can feed rendered context without becoming memory-specific code.

Only the rendered context is prompt material. The rest should mostly stay out of
the model's immediate view until there is a reason to inspect it.

## Prompt Injections

Memory should not own prompt injection as a special hidden path.

Shrimpy should make this simple:

```text
bash command -> compact text block -> system or turn context
```

The command owns data retrieval and formatting. Shrimpy owns when to run it, how
much text it can emit, which sessions/channels receive it, and where it lands in
context.

Agents should be able to add or adjust these injections without touching core
runtime code. Memory cards, daily summaries, app status, channel recency, stale
commitments, and external facts can all use the same primitive.

## Relationship Cards

A relationship card should probably be a markdown document owned by an agent,
not just a generated row in shared state.

Possible shape:

```text
agents/<agent-id>/memory/
  peers/
    human-alice.md
    agent-admin.md
  channels/
    home.md
    career.md
```

The framework can detect interaction and queue/update tasks. The agent,
guided by a memory skill, decides what belongs in the card.

Cards should avoid:

- long transcript summaries
- every preference ever mentioned
- stale guesses about personality
- facts without a reason they help future work

Cards should capture:

- durable preferences the user likely cares about
- how to work with this peer or channel
- commitments, boundaries, and recurring context
- pointers to evidence when the detail matters

This makes memory an agent practice, not just a summarization pipeline.

## Memory Upkeep

The trigger shape is unresolved, but it should be legible.

Likely ingredients:

- deterministic signals from channels, sessions, watches, and changed files
- a memory-management agent or process that reviews those signals
- normal channel messages that ask specific agents to update their own memory
- user-visible requests when memory decisions need human judgment

This sidecar should send orders through the same communication model as
everything else. It should not be a hidden runtime owner that wakes agents with
uninspectable intent.

## Time Summaries

Different time scales probably belong in different memory surfaces:

- daily or weekly summaries can be built markdown files in an agent workspace
  and loaded as stable context
- hourly summaries might also be built files if they are stable enough
- minute/hour recency probably belongs in turn injections so messaging and
  polling patterns can stay fresh without polluting static memory

The exact cadence is less important than the rule: time summaries should match
their freshness horizon.

## Memory Skill

The memory skill should be strong enough to teach the agent what belongs in a
card, how to edit it, and how to avoid memory sludge. It should not need to be a
large framework manual. A focused skill under roughly 400 lines is probably the
right order of magnitude.

## Desired User Experience

- Important facts should be easy to preserve without turning memory into sludge.
- Replacing or deleting memory should feel precise, not fuzzy.
- The user should be able to understand where a recalled fact came from.
- Memory upkeep should feel helpful, not unpredictable.
- If a separate user/profile layer exists later, it should be clearly distinguished from general project or home memory.

## Open Product Questions

- How much autonomous upkeep feels good before it feels spooky?
- When does a separate user/profile layer become worth it?
- How should provenance be surfaced without clutter?
- How much continuity is desirable across task sessions versus parent conversations?
- What tasks should trigger a memory-card update?
- What deterministic signals should feed a memory-management sidecar?
- How much structure should the memory skill impose on card markdown while
  staying compact?
