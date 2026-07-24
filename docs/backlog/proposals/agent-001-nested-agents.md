---
status: draft
priority: P3
area: Agents
depends_on:
  - CTX-008
---

# AGENT-001: Nested Agents

## Why

Character-agent and creative habitat patterns get more interesting if an agent can own a small cast of child agents that live inside its workspace and are managed by the parent agent. This would let a durable character keep internal voices, familiars, critics, lore keepers, or other supporting agents close to its own files without turning them into global workspace peers by default.

This is low priority and should stay behind practical agent, context, and app-pattern work. The goal is to scope the shape, not to add a special character runtime.

## Current State

- Agents are configured as a flat workspace-level array and addressed by unique id.
- Resolved agent roots default to `agents/<id>`, though a root can be set explicitly.
- Agent-owned files already live under the resolved root, including `SOUL.md`, `context/`, `vault/`, `projects/`, `watches.json`, `sessions/`, and `skills/`.
- Channels, channel policies, sessions, watches, skills, and model policy all assume ordinary agent ids. There is no parent/child relationship, delegated ownership model, or child-agent lifecycle command.
- The character-agent musing describes internal voices as ordinary agents or context producers whose outputs can be selected into a parent character's next-turn context.

## Build

- Define the product model for nested agents: a child agent is owned by a parent agent, lives under the parent's root, and can be listed, inspected, updated, and removed through CLI commands.
- Choose an address format that is stable in channels, sessions, watches, logs, and state, for example `parent/child` or another explicit parent-child id form.
- Add CLI-first lifecycle operations, likely under `shrimpy agent child ...` or an equivalent namespace:
  - create a child agent for a parent
  - list children for a parent
  - show/inspect a child agent's resolved config and paths
  - update model policy, tools, thinking, channel policy, and root-like placement within the parent scope
  - remove a child agent without deleting parent files by default
- Keep child roots inspectable under the parent agent, for example `agents/<parent>/agents/<child>/` or another explicit nested path.
- Let child agents run normal sessions, own watches, use skills, and keep scoped memory without silently mutating the parent's prompt or memory.
- Add an explicit context assembly path for parent turns that may include selected child outputs, with provenance visible through runtime context inspection.
- Make parent-managed defaults practical: child channel membership, wake behavior, tool limits, and model policy should be easy to inherit or override without hiding the effective settings.
- Update app/config examples with one optional character-agent pattern once the primitive exists.

## Boundaries

- Do not make nested agents a new runtime species. They should be ordinary agents with an ownership relationship and scoped storage.
- Do not let child agents directly edit parent identity, system prompts, memory, or config unless the parent explicitly grants that through normal tool and file permissions.
- Do not make child-agent chatter user-visible by default. Delivery and attribution should remain channel-policy decisions.
- Do not replace flat workspace-level agents. Nested agents are for local ownership and creative composition, not the default way to model every multi-agent setup.
- Do not implement this before context provenance and basic app-pattern examples make the desired shape clearer.
- Do not add migration or legacy aliases for existing agents unless a concrete workspace-facing break is intentionally accepted.

## Touches

- `shrimpy-search`: nested agents should follow the same search-before-invent behavior before creating or changing child-agent state.
- [Character agents musing](../../musings/character-agents.md): the main design pressure comes from internal voices and scoped memory for character agents.
- [CTX-008](ctx-008-runtime-context-producers.md): parent context assembly needs inspectable provenance if child outputs are injected into a turn.
- [Channels](../../reference/channels.md): child-agent messages should remain attributable and routable through normal channel semantics.
- [Sessions](../../reference/sessions.md): child sessions should stay separate from parent sessions.
- [Skills](../../reference/skills.md): child skills should use the same workspace/agent skill model, scoped to the child root where applicable.

## Done

- A parent can create, list, inspect, update, and remove child agents through CLI commands.
- Child agents have stable ids, inspectable roots, sessions, watches, skills, memory, model policy, and tool policy.
- Parent turns can include selected child outputs only through an explicit, inspectable context assembly path.
- Parent and child memory remain separate unless normal, visible workspace files intentionally connect them.
- Character-agent examples can model internal voices without special runtime hacks.
