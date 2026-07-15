---
name: shrimpy-dev-live-workspace
description: Use when inspecting a live or production Shrimpy workspace for recurring local patterns that should inform Shrimpy source changes, especially workspace profile instructions, agent SOUL/context files, workspace or agent skills, watches, channel routing, manual overrides, and default skills/instructions that may need improvement.
---

# Shrimpy Dev Live Workspace

Use this Shrimpy developer skill to mine the user's real workspace for source-worthy patterns. The live workspace is production data: inspect it carefully, summarize patterns, and move only durable product lessons into the repository.

## Goal

Turn repeated live usage into concrete source improvements. Prefer improving setup templates, default skills, repository developer skills, reference docs, or backlog notes when local workspace customizations reveal a durable Shrimpy behavior. Do not treat a single personal note as a product requirement without evidence or user confirmation.

## Safety

- Work read-only in the live workspace unless the user explicitly asks to edit it.
- Do not run setup, migration, cleanup, reset, checkpoint restore, or destructive maintenance commands against the live workspace.
- Avoid secrets and high-volume private data by default: do not read `state/pi/auth.json`, provider credentials, raw media, full session transcripts, full channel logs, or large runtime logs unless directly necessary and explicitly justified.
- Summarize private prose as patterns. Do not copy personal content, credentials, private identifiers, channel payloads, or local-only paths into tracked repo files.
- Preserve uncommitted user edits in the repository and in the workspace. Inspect `git status --short` before changing source files.

## Workspace Discovery

1. Confirm the Shrimpy repository root and read `AGENTS.md` plus `AGENTS-PRIVATE.md` if present.
2. Resolve the live workspace from `~/.shrimpy-workspace.json` `workspace`, falling back to `~/.shrimpy`. Use private notes only as local hints; do not hard-code those paths into tracked files.
3. Inventory before reading deeply. Prefer `find`, `rg --files`, `wc -l`, and file sizes to understand shape without dumping content.
4. Start with small text surfaces: `context/WORKSPACE.md`, `context/SYSTEM.md`, `context/USER.md`, `config/shrimpy.json`, `config/channels.json`, `agents/*/SOUL.md`, `agents/*/context/**/*.md`, `agents/*/watches.json`, `skills/**/SKILL.md`, and `agents/*/skills/**/SKILL.md`.
5. Sample runtime material only when the pattern depends on behavior in the wild. Prefer bounded command output and metadata over raw logs.

## Source Baseline

Compare live workspace patterns to source-owned defaults:

- Workspace context templates: `src/setup/templates/workspace/context/WORKSPACE.md`, `src/setup/templates/workspace/context/SYSTEM.md`, and `src/setup/templates/workspace/context/USER.md`.
- Default agent instructions: `src/setup/templates/workspace/agents/shrimpy/SOUL.md`, `src/setup/templates/workspace/agents/mechanic/SOUL.md`, and `src/setup/templates/workspace/agents/mechanic/context/`.
- Included Shrimpy skill packages: `src/skills/included/`.
- Repository developer skills: `skills/`.
- Current behavior docs: `docs/reference/`.
- Future work: `docs/backlog/`.

## Pattern Criteria

Promote a live pattern when one or more of these is true:

- The same instruction, caveat, workaround, or expectation appears in multiple workspace files, skills, agents, watches, or repeated usage notes.
- A workspace-authored or agent-authored skill looks like a generally useful default capability.
- A local instruction corrects confusion caused by included package assignments, setup wording, command output, or docs.
- A live watch, channel route, or context file exposes a missing setup default, CLI inspection surface, safety guardrail, or documentation breadcrumb.
- The user repeatedly relies on a local convention that new workspaces or agents would benefit from by default.

Do not promote a pattern when it is only a private preference, one-off project detail, credential/location fact, raw memory, transient runtime state, or unvalidated speculation.

## Routing Findings

- Improve `src/setup/templates/**` when the pattern should exist in newly initialized workspaces.
- Improve `src/skills/included/**` when a shipped runtime agent skill needs clearer triggers, safer commands, or better workflow guidance.
- Improve repository `skills/**` when the lesson is about maintaining Shrimpy's source tree.
- Update `docs/reference/**` when the live pattern shows stable behavior is poorly documented.
- Create or update `docs/backlog/**` when the live pattern needs source work but the implementation is not obvious or not requested yet.
- Update `CHANGELOG.md` only when the resulting source change affects user, operator, maintainer, or agent behavior enough to mention.

Use the relevant Shrimpy developer skill before editing changelog, docs, reference docs, or backlog files.

## Workflow

1. Inspect repository state with `git status --short`.
2. Resolve and inventory the live workspace read-only.
3. Read the smallest useful set of workspace artifacts, included skill sources, and setup templates.
4. Write down the pattern, source evidence, live evidence, and why it should or should not become a source change.
5. Make tightly scoped source edits only after choosing the owning file.
6. Sync repository developer skills with `npm run build:skills` when editing root `skills/`.
7. For template or source-code changes, run the smallest useful build/test command. For skill-only edits, validate the skill and run `npm run build:skills`.

## Reporting

Report the workspace areas inspected, the patterns found, the source files changed, and the checks run. Mention intentional non-edits when a live pattern stayed private, too specific, or too uncertain to promote.
