# 🦐 SKILL-001: Shrimpy Search Skill

Status: review
Priority: P2
Area: Skills
Depends On: none

## Why

Agents need a small advertised path for finding existing Shrimpy knowledge before inventing new state. Passive docs are not enough: Shrimpy gives agents skill trails in context, and Pi advertises visible skills by name, description, and file location. Search is the recurring cross-cutting behavior that does not belong solely to watches, channels, vault capture, agents, or coding delegation.

The broad `shrimpy-workflows` router was too close to a table of contents. Focused skills now own the real workflows, so the remaining useful shared behavior is search-before-invent: workspace notes, session transcripts, channel logs, and current turn context.

## Current State

- `shrimpy-search` is an included Shrimpy how-to skill under `src/skills/included/shrimpy-search/` and is assigned as a workspace-owned package copy during setup.
- `shrimpy-workflows` has been removed from included skill sources and default workspace assignment.
- Focused workflow guidance lives in the relevant included skills: `shrimpy-watches`, `shrimpy-channels`, `remember`, `shrimpy-agents`, `shrimpy-skills`, and `shrimpy-coding-delegation`.
- [SKILL-003](skill-003-agent-owned-skill-packages.md) owns the copied included-package distribution model. This note owns the `shrimpy-search` content shape.

## Build

- Add an all-agent `shrimpy-search` skill. Its frontmatter description should say to use it when looking up existing workspace knowledge, session history, channel messages, or turn context before answering or inventing new state.
- Keep `SKILL.md` short. It should tell agents which corpus to search, carry the essential lookup commands, and point to reference docs for details.
- Include bounded commands for `shrimpy workspace search`, `shrimpy workspace index status`, `shrimpy sessions search`, `shrimpy sessions read`, `shrimpy channels search`, `shrimpy channels read`, `shrimpy context turn`, and `shrimpy context --sections`.
- Route from search results to the right focused skill: `remember` for saved files or research packets, `shrimpy-channels` for routing and channel records, `shrimpy-watches` for recurring work, and `shrimpy-skills` for skill ownership or package state.
- Remove `shrimpy-workflows` from included skill sources, setup assignments, reference docs, tests, and changelog.
- Verify examples against current CLI behavior and run the setup/skill tests.

## Boundaries

- Do not recreate a broad workflow router under another name.
- Do not add pattern routing to `SYSTEM.md`; the skill trail is the agent-facing routing path.
- Do not add a separate workspace knowledge reference manual. `docs/reference/workspace.md`, `sessions.md`, `channels.md`, and `context-assembly.md` own durable details.
- Do not treat search visibility as permission to mutate results. Search is for finding and inspecting; edits still follow the owning skill and user approval rules.
- Do not build new runtime behavior in this item. Use existing CLI search, read, and context surfaces.
- Do not leave legacy `shrimpy-workflows` shims or placeholder docs.

## Done

- `shrimpy-search` is advertised to all compatible agents through the copied included package model.
- The skill gives concrete bounded lookup commands and routes results to focused skills.
- `shrimpy-workflows` is removed from default skills and included sources.
- `docs/reference/skills.md` describes the new default skill set.
- Setup and skill tests cover default visibility and package installation for `shrimpy-search`.
