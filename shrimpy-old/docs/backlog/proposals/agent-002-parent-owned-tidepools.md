---
status: draft
priority: P3
area: Agents
depends_on:
  - CTX-008
---

# 🦐 AGENT-002: Parent-Owned Tidepools

## Why

Top-level agents should remain the primary durable actors in a Shrimpy workspace. They are the residents the user knows, addresses, configures, and trusts with distinct roles. Some of those agents, however, need a small supporting cast: internal voices for a character, autonomous cast members in a story system, or persistent authorities whose separate viewpoints and actions are part of the system itself.

Making every helper a top-level peer exposes implementation detail and leaves ownership unclear. Giving each system a nested workspace goes too far in the other direction: it duplicates workspace semantics, forces every subsystem to understand scopes and inheritance, and turns a small agent relationship into a second runtime architecture.

A tidepool is the one-level collection of child agents owned by a top-level parent agent. Children remain ordinary Shrimpy agents with their own identity, context, sessions, skills, watches, models, and tool policy. The tidepool adds ownership, contained storage, grouped discovery, and safe lifecycle operations. It is not another workspace, and children cannot own children.

## Child Admission Test

Creating a child agent requires stronger justification than identifying a useful role. A proposed child should satisfy all three conditions:

- It has an enduring identity or viewpoint.
- It needs genuinely separate memory.
- It acts independently over time.

If the role does not need all three, use the smaller primitive:

- Use a skill when the parent needs reusable instructions or a capability such as research, editing, planning, reviewing, or domain-specific workflow.
- Use a tool, script, or context producer for deterministic actions or bounded facts.
- Use a worker session for delegated work with a concrete goal and completion point.
- Use a top-level agent when the actor is durable but belongs to the household or collaborates across systems rather than serving one parent.

Do not create child agents merely to decompose an ordinary application into job titles. Tidepools model persistent societies of independently acting identities, not object-oriented role splitting for prompts.

## Current State

- Agents are configured as one flat workspace-level array and addressed by unique id.
- An agent root may already be placed explicitly, but the runtime has no parent/child relationship or grouped lifecycle.
- Every configured agent appears conceptually as a workspace peer even when it only exists to support another agent.
- Agent sessions, watches, channels, skills, model policy, and tools already provide nearly all child-agent runtime behavior.
- Runtime context can be inspected as a whole, but selected child output does not yet have a first-class, attributable path into a parent's next-turn context.

## Product Model

- A top-level agent may own one implicit tidepool containing zero or more child agents. The tidepool does not need its own identity, config file, process, scheduler, or lifecycle.
- A child has exactly one top-level parent. The relationship is recorded explicitly in agent config rather than inferred by walking directories.
- Parent/child depth is exactly one. A child cannot own a tidepool, be another child's parent, or create a recursive ownership chain.
- A child is an ordinary resolved agent after ownership is validated. Existing session, watch, channel, skill, model, tool, and context machinery should operate on it without parallel implementations.
- Children have stable globally unambiguous addresses that include the parent relationship. Choose the delimiter only after auditing agent ids, actor ids, mentions, session keys, channel routing, and filesystem use; do not overload a currently valid top-level id shape accidentally.
- The default child root is inspectable beneath its parent, for example `agents/<parent>/tidepool/<child>/`. It has the normal agent-root layout. Workspace-wide channels, auth, models, runtime state, and configuration stay at the workspace root.
- Children load workspace context and their own `SOUL.md` and `context/` through normal sources. They do not ambiently inherit the parent's `SOUL.md`, context, session transcript, memory, or working directory.
- Parent settings may seed a child's initial model, thinking, tool, and channel-policy values, but the resulting child config is explicit. Later parent edits do not silently change children.

## Build

- Extend agent configuration with an explicit optional parent relationship and validate the graph as top-level parents plus one child layer. Reject missing parents, child parents, self-parenting, cycles, duplicate effective addresses, and roots that escape the intended parent scope.
- Add CLI-first child lifecycle operations:
  - create a child under a top-level parent
  - list a parent's children
  - inspect a child, including its parent, stable address, resolved root, context sources, model, tools, watches, sessions, and channel policy
  - update a child through the ordinary agent configuration surface
  - detach or remove a child without deleting its files by default
- Keep ordinary agent commands address-compatible with children. A child should not require tidepool-specific variants of chat, session, watch, model, skill, or channel commands after its address resolves.
- Refuse to remove or rename a parent while it owns children unless the user first makes an explicit reparent, detach, or removal decision. Never cascade-delete a tidepool by default.
- Group children beneath their parent in status and TUI discovery instead of presenting them as unrelated household peers. Direct child inspection and chat remain possible when explicitly addressed.
- Give new children no user-facing channel membership by default. Parents or users may add them to ordinary channels intentionally; internal coordination and logs continue to use normal channel semantics.
- Build the CTX-008-dependent context seam for a parent to include selected child outputs with source, child identity, and selection provenance visible in context inspection. Child chatter must never mutate parent prompts or memory implicitly.
- Update workspace search, checkpoint tracking, skill discovery and provenance, session inventory, watch inspection, channel attribution, and state-integrity checks so they follow resolved child roots rather than assuming every root matches `agents/*/`.
- Update the included `shrimpy-agents` skill with the child admission test and the skill/tool/context-producer/worker/top-level-agent alternatives. Update related setup and skill-authoring guidance so agents consistently choose the smallest sufficient primitive instead of inventing persistent actors for capability-shaped roles.
- Add one bounded character-agent or story-system example that demonstrates a parent, two or three qualifying children, a private coordination channel, and explicit selection of child output into a parent turn.

## Portable Definition Boundary

Tidepools should have a clean distribution boundary without making package management part of this implementation:

- Definition material is portable: child configuration, `SOUL.md`, `watches.json`, and child skills.
- Seed context may be included only by explicit choice and becomes user-owned after creation.
- Lived material is not portable by default: sessions, vault contents, evolving context, channel logs, runtime state, media, auth, and model credentials stay behind.
- [AGENT-003](agent-003-shareable-agent-packages.md) owns manifests, sources, provenance, installation, updates, detachment, and export. AGENT-002 only keeps child definitions structurally portable and exposes the one-level ownership target that AGENT-003 may optionally use.

## UX Implications

- The user continues to see a household of top-level agents. Supporting children appear grouped beneath the parent that owns them.
- Creating a helper starts from the parent: conceptually, `shrimpy agent child add <parent> <child>`, with the final command spelling chosen alongside the stable address format.
- Agent creation guidance asks whether the proposed child has enduring identity, separate memory, and independent activity. Capability-shaped requests should normally produce a skill or bounded worker instead.
- Existing agent commands work once given a child's full address; users do not learn a parallel set of tidepool commands.
- Children stay backstage by default: no automatic user-facing delivery, no ambient parent-memory access, and no unexplained contribution to a parent response.
- Inspection explains both structure and behavior: who owns the child, where its files live, which channels can wake it, and whether any of its output entered a parent turn.
- Flat top-level agents remain supported and remain the default. A user who never creates a child should see no workflow regression.

## Boundaries

- No nested workspaces, tidepool-local `config/`, tidepool-local `state/`, or scoped workspace resolution.
- No child gateways, schedulers, auth stores, model registries, channel stores, or runtime trees.
- No recursive nesting, arbitrary depth, named sub-tidepools, or child-owned children.
- No special child-agent execution loop. Ownership changes discovery, defaults, storage, and lifecycle, not how an agent thinks.
- No child agents created solely to perform research, editing, planning, criticism, or another capability the parent can gain through a skill or bounded worker.
- No implicit access to parent identity, context, memory, sessions, vault, projects, or tools.
- No implicit injection of child output into parent context and no direct child mutation of parent files.
- No bundle installer, remote package resolver, update system, or export system in the initial feature.
- No migration or compatibility aliases for existing agent ids or roots.

## Notes

- “Tidepool” names the parent's child-agent collection, not a general-purpose containment primitive.
- One implicit tidepool per top-level agent avoids naming, routing, and nesting questions that add no value to the supporting-cast use case.
- The first implementation should prove the relationship with ordinary agents and channels before considering bundle distribution.
- The exact address delimiter remains the main design decision to resolve before promotion from draft. It must be safe across config validation, mentions, actor ids, session identity, logs, commands, and filenames.

## Touches

- [CTX-008](ctx-008-runtime-context-producers.md): selected child output needs an inspectable context path before parent composition is trustworthy.
- [AGENT-003](agent-003-shareable-agent-packages.md): shareable top-level agents and optional one-level tidepool definitions.
- [Character agents musing](../../musings/character-agents.md): internal voices are the clearest architecture test for a parent-owned tidepool.
- [Story worlds musing](../../musings/story-worlds.md): directors and autonomous casts provide a larger bounded test without requiring recursive ownership.
- [Workspace](../../reference/workspace.md): child roots extend the agent-root layout while workspace state remains workspace-scoped.
- [Configuration](../../reference/configuration.md): agent config gains the ownership relationship and effective-address rules.
- [Channels](../../reference/channels.md): child communication, wake behavior, attribution, and delivery remain ordinary channel policy.
- [Sessions](../../reference/sessions.md): child sessions remain separate and use the child's stable address.
- [Skills](../../reference/skills.md): child skills and future definition portability should reuse resolved agent roots and existing provenance concepts.

## Done

- A top-level agent can create, list, inspect, configure, and remove children through CLI commands.
- Every child has one top-level parent, a stable address, an inspectable root beneath that parent, and ordinary agent runtime behavior.
- Validation makes recursion and ambiguous ownership impossible.
- Status and TUI discovery group children beneath parents while ordinary agent commands can target a child directly.
- Parent and child identity, context, memory, sessions, and files remain separate unless visible channels or explicit context sources connect them.
- A parent turn can include selected child output only through an attributable context path visible in inspection.
- Parent rename and removal operations cannot orphan or silently delete children.
- Included agent-management, setup, and skill-authoring guidance teaches the child admission test and recommends the smallest sufficient primitive.
- Flat agents continue to behave exactly as before.
