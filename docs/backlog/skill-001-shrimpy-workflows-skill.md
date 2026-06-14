# 🦐 SKILL-001: Shrimpy Workflows Skill

Status: todo
Priority: P2
Area: Skills
Depends On: none

## Why

Agents need a small advertised path from ordinary user requests into Shrimpy's core workflow shapes. Passive docs are not enough: Shrimpy only gives agents skill trails in context, and Pi advertises visible skills by name, description, and file location. The skill is the routing surface; docs are the support material it points to.

The current mechanic-only `shrimpy-mechanic-ideas` skill mixes owner choices, app examples, and loose brainstorming. Replace it with one all-agent workflow skill that uses plain Shrimpy nouns and points to short pattern docs for the details.

## Current State

- Source-default all-agent skills already cover upkeep and coding handoff, but no all-agent skill tells a normal agent how to choose between watches, agents, channels, vault files, memory search, and workers.
- `shrimpy-mechanic-ideas` is visible only to the mechanic and carries its own reference corpus.
- The previous backlog split one idea across a passive examples document and a skill/router plan. The useful shape is one all-agent skill backed by focused docs.

## Build

- Add a source-default all-agent skill under `src/setup/templates/skills/shrimpy-workflows/` and register it with target `all` in `src/skills/defaults.ts`.
- Name the skill `shrimpy-workflows`. Its frontmatter description should use plain language: use when a user wants Shrimpy to remember or find something, save files, watch something over time, choose or create an agent, route work through a channel, or delegate bounded work to a worker.
- Keep `SKILL.md` short. It should explain when to read each backing doc, give the relevant doc path, and name the default Shrimpy shape. It should not copy command catalogs or long examples.
- Add the backing docs under `docs/patterns/`:
  - `watches.md`: scheduled work, reminders, briefings, recurring checks, monitors, emit policy, and channel choice.
  - `agents.md`: when to stay with the current agent, use an existing agent, or create a new agent.
  - `channels.md`: user-facing channels, background/log channels, app/workflow channels, and routing expectations.
  - `vault.md`: durable files, captures, research packets, trackers, notes, artifacts, and source metadata.
  - `memory.md`: how to search before acting, including workspace search, session/channel search when available, vault/context files, source-file reads, and when to ask the user instead of guessing.
  - `workers.md`: when to delegate, how to prepare a handoff packet, how to inspect worker status/results, and how to report or merge the result.
- Keep each pattern doc short, command-backed, and named after the Shrimpy concept it explains.
- Remove `shrimpy-mechanic-ideas` from defaults, templates, mechanic references, docs, and tests.
- Update `docs/reference/skills.md` and any default-skill tests for the new all-agent skill.
- Verify examples against current CLI behavior and run `shrimpy skills validate`.

## Boundaries

- Do not add pattern routing to `SYSTEM.md`; the skill trail is the agent-facing routing path.
- Do not add an app/config examples document as a separate surface.
- Do not invent top-level docs for workflow subtypes such as reminders, briefings, monitors, trackers, or scoped agents. Put those examples inside the relevant Shrimpy noun doc.
- Do not treat skills as permissions. The skill advertises workflow guidance; commands, tools, channels, sessions, watches, and files do the work.
- Do not build new runtime behavior in this item. Use existing CLI surfaces and docs-backed guidance.
- Do not leave legacy `shrimpy-mechanic-ideas` shims or placeholder docs.

## Notes

- `memory.md` should be about lookup behavior, not long-term memory policy. It should tell agents how to search and inspect existing workspace knowledge before inventing answers.
- `workers.md` should align with the existing `coding-delegation` skill and worker CLI, while staying useful for non-coding bounded delegation if that path exists.
- `vault.md` should align with [VAULT-001](vault-001-default-workspace-collections.md) and [VAULT-002](vault-002-main-agent-capture-research.md) without depending on those items being complete.
- The docs can mention concrete examples such as reminders, briefings, monitors, trackers, career workflows, and character agents, but the durable entry points remain watches, agents, channels, vault, memory, and workers.

## Done

- `shrimpy-workflows` is advertised to all compatible agents as a source-default skill.
- The skill description and body route ordinary workflow requests to the correct backing doc without requiring `SYSTEM.md` prompt changes.
- Six backing docs exist under `docs/patterns/`: `watches.md`, `agents.md`, `channels.md`, `vault.md`, `memory.md`, and `workers.md`.
- `shrimpy-mechanic-ideas` is removed from source defaults, templates, mechanic pointers, docs, and tests.
- `docs/reference/skills.md` describes the new default skill set.
- `shrimpy skills validate` passes, and tests cover default skill visibility and removal of the old mechanic-only ideas skill.
