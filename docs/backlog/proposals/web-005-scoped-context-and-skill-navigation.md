---
status: draft
priority: P2
area: Web
depends_on: []
---

# 🦐 WEB-005: Scoped Context And Skill Navigation

## Why

Context and skills are core parts of understanding what an agent knows and how it operates, but the web inspector exposes them only through the physical Workspace tree. Shared `context/` and `skills/` are buried inside that collapsed branch, while an agent's synthetic tree entry shows Summary, Sessions, and Watches but omits `SOUL.md`, `context/`, and `skills/`. The inspector already treats the tree as its primary menu, so scope-defining files should be reachable where their scope is visible.

## Current State

- The synthetic root contains Overview, Channels, Agents, Runtime, and the physical Workspace tree.
- Workspace `context/` and `skills/` are reachable only under the collapsed physical Workspace branch.
- Each synthetic agent contains Summary, Sessions, and Watches.
- Agent `SOUL.md`, `context/`, and `skills/` are reachable only through `agents/<id>/` in the physical tree.
- File reads already classify readable workspace content, deny secret-bearing paths, enforce realpath containment, and update through the existing workspace watcher.

## Build

- Add top-level synthetic Context and Skills groups for workspace-owned `context/` and `skills/`.
- Add Context and Skills groups beneath each synthetic agent.
- Treat `SOUL.md` as agent context and place it first in the agent's Context group, followed by the readable contents of the agent's `context/` directory.
- Represent each installed skill as a named directory containing its readable package files, with `SKILL.md` ordered first. Keep scripts and references reachable rather than reducing a skill to its manifest alone.
- Add an agent-scoped file descriptor that resolves the current configured agent root by id, then applies path classification and realpath containment relative to that root. Never encode or trust an absolute path supplied by the browser.
- Reuse the normal file response and viewer kinds so the synthetic nodes and physical nodes read the same bytes. WEB-004 may improve Markdown presentation later, but this navigation item does not depend on it.
- Keep stable node ids across tree refreshes so file edits, added or removed context files, installed or removed skills, selection, and expansion continue to work with live updates.
- Add representative tree and node-reader fixtures for workspace context, workspace skills, agent `SOUL.md`, nested agent context, agent skills, and rejected symlink or secret-bearing files.

## UX Implications

Context and Skills become first-class tree destinations instead of files that users must rediscover under Workspace. Shared context and shared skills appear near the top of the menu, while agent-owned context and skills appear under the agent they affect. `SOUL.md` sits inside agent Context because it defines that agent's durable identity and instructions.

The same file may appear in both a synthetic scoped group and the physical Workspace tree. That duplication is intentional: the synthetic path answers “what shapes this agent or workspace,” while the physical tree answers “where is this file stored.” Selecting either entry shows the same read-only content.

Skill packages remain navigable beyond `SKILL.md`, so supporting references and scripts are not hidden. This can add many rows for a workspace with large skills; the groups stay collapsible and should not force the physical Workspace branch open.

## Boundaries

- Keep the inspector read-only. Do not add context or skill editing, installation, removal, or validation controls.
- Do not change Shrimpy's workspace format or emit web-specific indexes.
- Do not surface vault, project, session, state, or arbitrary agent-root files through the scoped groups.
- Preserve the physical Workspace tree.
- Apply the existing private-path and secret-name denial rules to every synthetic file.
- Resolve configured agent roots on the server for each read and contain every agent-scoped path beneath that root.
- Prefer current workspace and skill package shapes only; do not add legacy discovery.

## Touches

- `web/server/tree.ts`
- `web/server/ids.ts`
- `web/server/nodes.ts`
- `web/server/workspace.ts`
- `test/web-tree.test.ts`

## Done

- Workspace Context and Skills groups expose current shared files without opening the physical Workspace tree.
- Every agent exposes `SOUL.md`, agent context, and installed agent skills beneath its synthetic node.
- Skill support files remain reachable with `SKILL.md` ordered first.
- Secret-bearing and symlink-escape files remain unreadable.
- Adding, editing, or removing context and skill files updates the tree and selected content without manual refresh.
