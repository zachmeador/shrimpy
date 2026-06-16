# 🦐 SKILL-001: Shrimpy Workflows Skill

Status: review
Priority: P2
Area: Skills
Depends On: none

## Why

Agents need a small advertised path from ordinary user requests into Shrimpy's core workflow shapes. Passive docs are not enough: Shrimpy only gives agents skill trails in context, and Pi advertises visible skills by name, description, and file location. The skill is the routing surface; docs are the support material it points to.

The current mechanic-only `shrimpy-mechanic-ideas` skill mixes owner choices, app examples, and loose brainstorming. Replace it with one all-agent workflow skill that uses plain Shrimpy nouns and points to relevant skills and reference docs for the details.

## Current State

- Included all-agent skills already cover upkeep and coding handoff, but no all-agent skill tells a normal agent how to choose between watches, channels, vault files, memory search, and workers.
- `shrimpy-mechanic-ideas` is visible only to the mechanic and carries its own reference corpus.
- The previous backlog split one idea across a passive examples document and a skill/router plan. The useful shape is one all-agent routing skill backed by focused skills and reference docs.
- [SKILL-003](skill-003-agent-owned-skill-packages.md) owns the distribution pivot to copied included skill packages. This note still owns the `shrimpy-workflows` content shape.

## Build

- Add an all-agent `shrimpy-workflows` skill. In the current implementation this is an included package source under `src/skills/included/shrimpy-workflows/`, assigned as a workspace-owned package copy during setup.
- Name the skill `shrimpy-workflows`. Its frontmatter description should use plain language: use when a user wants Shrimpy to remember or find something, save files, watch something over time, route work through a channel, or hand off a clear task to a worker.
- Keep `SKILL.md` short. It should tell agents which relevant skill or reference doc to use, and carry only the memory-lookup commands that do not have a more specific skill owner. It should not copy command catalogs or long examples.
- Keep backing workflow guidance in the relevant included skills:
  - `shrimpy-watches`: scheduled work, reminders, briefings, recurring checks, monitors, emit policy, and channel choice.
  - `shrimpy-channels`: user-facing channels, background/log channels, app/workflow channels, and routing expectations.
  - `vault-capture`: durable files, captures, research packets, trackers, notes, artifacts, and source metadata.
  - `shrimpy-coding-delegation`: when to delegate, how to prepare a handoff packet, how to inspect worker status/results, and how to report or merge the result.
- Keep each skill short, command-backed, and named after the Shrimpy concept it explains. Skills hold shared workflow behavior; reference docs hold durable feature details.
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
- `shrimpy-coding-delegation` should align with the worker CLI, while staying useful for Codex, Claude Code, Shrimpy/Pi, or another coding agent.
- `vault.md` should align with the landed `vault-capture` skill and [workspace.md](../reference/workspace.md).
- The docs can mention concrete examples such as reminders, briefings, monitors, trackers, career workflows, and character agents, but the durable entry points remain watches, channels, vault, memory, and workers.

## Done

- `shrimpy-workflows` is advertised to all compatible agents through the copied included package model.
- The skill description and body route ordinary workflow requests to the correct skill first, then reference docs when more detail is needed.
- Shared workflow guidance lives in the relevant included skills instead of a separate patterns docs directory.
- `shrimpy-mechanic-ideas` is removed from included skill sources, templates, mechanic pointers, docs, and tests.
- `docs/reference/skills.md` describes the new default skill set.
- `shrimpy skills validate` passes, and tests cover default skill visibility and removal of the old mechanic-only ideas skill.
