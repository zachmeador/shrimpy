# 🦐 SKILL-002: Shrimpy Skill Coverage Gaps

Status: draft
Priority: P2
Area: Skills
Depends On: none

## Why

Shrimpy has enough agent-facing surfaces now that "add a skill for it" needs a sharper rule. A Shrimpy area should get a skill when an agent needs behavioral guidance: choosing the right owner, sequencing inspectable commands, preserving live workspace safety, deciding when to ask the user, or keeping a recurring workflow from becoming hidden policy. A skill should not become a second reference manual. Durable feature details, command catalogs, examples, and background explanations should live in `docs/reference/`, `docs/patterns/`, or focused project notes, with `SKILL.md` acting as the trigger, decision guide, and breadcrumb.

The current set covers several important mechanisms, but there are gaps around creating skills, debugging context/session/model state, and operating gateway/runtime surfaces. This note is the coverage assessment, not an implementation of every candidate skill.

## Current Coverage

Strong existing coverage:

- First setup and workspace repair triage: `setup`, `mechanic`, and `workspace-migration`.
- Agent creation and routing: `add-agent` and `channel-routing`.
- Recurring/background work: `watches`.
- Read-only maintenance reviews: `security-audit` and `hygiene-audit`.
- Main-agent upkeep habits: `memory-management`, `journal-daily`, and `journal-compact`.
- Coding handoff: `coding-delegation`.
- Source-tree maintainer workflows: backlog, backlog worktrees, changelog, docs updates, reference docs, live-workspace mining, Pi upgrade planning, and release prep under root `skills/`.

Good docs-backed examples:

- `channel-routing` points to [channels.md](../reference/channels.md), [surfaces.md](../reference/surfaces.md), and [cli.md](../reference/cli.md), then focuses on naming, routing, and guardrails.
- `watches` points to [configuration.md](../reference/configuration.md), [runtime.md](../reference/runtime.md), [channels.md](../reference/channels.md), and [cli.md](../reference/cli.md), then focuses on owner, cadence, wake behavior, and safety.
- [SKILL-001](skill-001-pattern-reference-skill.md) already captures the all-agents pattern-skill direction: pattern content belongs in docs, while the skill indexes and triggers the right pattern.

## Gaps

### Skill Authoring And Lifecycle

Candidate: `skill-management` for the mechanic, plus a repo developer skill such as `shrimpy-dev-skills` for source-tree skill edits.

This is the highest-confidence gap. Shrimpy has a rich `shrimpy skills` CLI and a reference doc, but no Shrimpy-owned behavior guide for when to create a workspace skill, when to bind an external package, when to make an agent-local override, how to validate, and how to keep skill bodies as doc-backed agent guidance. The mechanic also needs clear rules for not copying whole docs into a skill, not treating skill bindings as a permission boundary, and not editing generated mirrors.

Docs to point at: [skills.md](../reference/skills.md), [cli.md](../reference/cli.md), [development.md](../reference/development.md), and [SKILL-001](skill-001-pattern-reference-skill.md). The repo developer variant should also remind agents to edit root `skills/`, run `npm run build:skills`, and preserve `.agents/skills/` and `.claude/skills/` as generated mirrors.

### Context And Prompt Debugging

Candidate: `context-debugging` for the mechanic.

Shrimpy has several context surfaces: prompt sections, turn context, configured sources, memory slices, and persisted turn-context envelopes. Agents debugging "why did the agent see this?", "why didn't this memory load?", or "what context is too large?" need a guided inspection workflow more than another docs page. The skill should point to docs, then prescribe `shrimpy context --sections`, `shrimpy context --turn`, `shrimpy context sources list/run`, and bounded file inspection.

Docs to point at: [context-assembly.md](../reference/context-assembly.md), [turn-context.md](../reference/turn-context.md), [memory.md](../reference/memory.md), [workspace.md](../reference/workspace.md), and [cli.md](../reference/cli.md).

### Model Policy And Provider Selection

Candidate: `model-policy` for the mechanic.

Model state affects setup, session quality, local/private preferences, cost, and repair. The CLI has `shrimpy models` and `shrimpy models resolve`, but there is no behavior guide for diagnosing why an agent picked a model, changing a policy without overfitting setup, or explaining hosted-vs-local tradeoffs without embedding provider lore in prompts.

Docs to point at: [configuration.md](../reference/configuration.md), [sessions.md](../reference/sessions.md), and [cli.md](../reference/cli.md). This should stay a policy/debugging guide, not a model catalog.

### Session Lifecycle And Compaction

Candidate: `session-debugging` for the mechanic.

Users and agents will ask to reset, restore, search, stop, or understand sessions. The command surface exists, and compaction has its own reference doc, but a skill would help preserve session data by default, choose read/search/reset commands, explain active-vs-archived sessions, and inspect compaction policy before deleting or resetting anything.

Docs to point at: [sessions.md](../reference/sessions.md), [compaction.md](../reference/compaction.md), [runtime.md](../reference/runtime.md), and [cli.md](../reference/cli.md).

### Gateway And Service Operations

Candidate: `gateway-ops` for the mechanic.

Setup and migration mention gateway commands, but operating the service is its own recurring maintenance shape: inspect status, read logs, restart safely, understand watch dormancy, and avoid uninstalling or rewriting LaunchAgents/system services without user approval. A small skill would prevent agents from treating gateway failures as generic process failures.

Docs to point at: [setup.md](../reference/setup.md), [runtime.md](../reference/runtime.md), [surfaces.md](../reference/surfaces.md), and [cli.md](../reference/cli.md).

### Workspace Knowledge And Capture

Candidate: `workspace-knowledge` or folded into the `patterns` skill from [SKILL-001](skill-001-pattern-reference-skill.md).

Shrimpy has workspace search and planned vault collection conventions. Agents need a behavioral wrapper for "capture this", "look into this", "save useful research", and "find what we know" workflows. This should probably wait for [VAULT-001](vault-001-default-workspace-collections.md), [VAULT-002](vault-002-main-agent-capture-research.md), and [CTX-011](ctx-011-workspace-knowledge-breadcrumbs.md) to settle, then become either a focused all-agents skill or one category inside the patterns skill.

Docs to point at: [workspace.md](../reference/workspace.md), [memory.md](../reference/memory.md), [cli.md](../reference/cli.md), and future vault/pattern docs.

### Adapter-Specific Surface Skills

Candidate: defer until a second real adapter ships.

`channel-routing` covers generic surfaces and Telegram well enough today. A Discord, BlueBubbles, or browser-control surface should get its own setup/debugging skill only when the adapter has behavior that cannot be summarized by the generic routing skill plus reference docs. Research notes already exist for Discord and BlueBubbles; do not create adapter skills before implementation creates real command and config surfaces.

Docs to point at: [surfaces.md](../reference/surfaces.md), [channels.md](../reference/channels.md), and the relevant adapter reference doc after it exists.

## Existing Skill Cleanup

- `shrimpy-mechanic-ideas` should be replaced by [SKILL-001](skill-001-pattern-reference-skill.md); keep pattern material in docs and leave the skill as an index.
- `coding-delegation` is the right owner for worker behavior, but it should point at [cli.md](../reference/cli.md) or a future worker reference doc instead of carrying too much command reference inline.
- `memory-management`, `journal-daily`, and `journal-compact` are useful watch-target skills, but their command recipes and hard-wrapped prose should be revisited when memory/reference docs or pattern docs can own more of the detail.
- `add-agent` and `setup` intentionally carry more policy because they touch live workspace state. When they change, prefer linking to docs for command details and keeping skill text focused on decisions, safety, and validation.

## Non-Gaps

- Every CLI command does not need a skill. Commands with clear inspection output and no behavioral fork can stay docs-only.
- Security and hygiene audits can stay checklist-heavy. Their value is the output contract, safety boundary, and review scope, not a durable reference explanation.
- Source developer skills do not need one-to-one coverage for every repo directory. Add them for repeat workflows with risk or recurring judgment, not for ordinary source editing.

## Build

1. Add the skill-authoring rule to Shrimpy's stable skill docs: skills guide agent behavior and point to docs wherever possible.
2. Add a `skill-management` mechanic skill that points to the skill and CLI docs, guides workspace-vs-agent-vs-package choices, and enforces validation.
3. Add a `shrimpy-dev-skills` source-tree developer skill for editing root `skills/` and setup template skills, including `npm run build:skills` and the docs-backed rule.
4. Split the remaining candidates into small backlog notes or explicitly defer them: `context-debugging`, `model-policy`, `session-debugging`, `gateway-ops`, and `workspace-knowledge`.
5. When touching existing default skills, reduce inline reference material and add doc breadcrumbs before adding new prose.

## Boundaries

- Do not add skills just to advertise that a feature exists.
- Do not duplicate reference docs, command catalogs, or long examples inside skill bundles.
- Do not treat skills as permission or routing policy. They are context trails and behavior guides.
- Do not create adapter-specific skills before the adapter has shipped commands, config, and reference docs.
- Do not implement all candidate skills in one broad change; each should be small, docs-backed, and independently validated with `shrimpy skills validate`.

## Done

- The current default and repository developer skill set has a documented coverage assessment.
- Shrimpy's skill reference states the docs-backed behavior-guide rule.
- The first follow-up skill-management work is either implemented or tracked as its own concrete backlog note.
- Lower-confidence candidates are accepted, deferred, or closed with a short reason.
