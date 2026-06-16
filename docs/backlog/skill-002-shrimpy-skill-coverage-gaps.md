# 🦐 SKILL-002: Shrimpy Skill Coverage Gaps

Status: review
Priority: P2
Area: Skills
Depends On: none

## Why

Shrimpy has enough agent-facing surfaces now that "add a skill for it" needs a sharper rule. A Shrimpy area should get a skill when an agent needs behavioral guidance: choosing the right owner, sequencing inspectable commands, preserving live workspace safety, deciding when to ask the user, or keeping a recurring workflow from becoming hidden policy. A skill should not become a second reference manual. Shared workflow behavior should live in the relevant included skill; durable feature details, command catalogs, schemas, examples, and background explanations should live in `docs/reference/` or focused project notes. `SKILL.md` is the trigger, intended behavior, safety boundary, and breadcrumb.

The current set covers several important mechanisms, but there are gaps around debugging context/session/model state and operating gateway/runtime surfaces. This note is the coverage assessment, not an implementation of every candidate skill. The high-confidence skill authoring/lifecycle slice is implemented; lower-confidence candidates stay deferred here until they prove recurring value.

## Current Coverage

Strong existing coverage:

- First setup and workspace repair triage: `shrimpy-setup` and `shrimpy-workspace-migration`.
- Agent creation and routing: `shrimpy-agents` and `shrimpy-channels`.
- Recurring/background work: `shrimpy-watches`.
- Read-only maintenance reviews: `shrimpy-security-audit` and `shrimpy-hygiene-audit`.
- Skill authoring and lifecycle: `shrimpy-skills`.
- Main-agent upkeep habits: `memory-management`, `journal-daily`, and `journal-compact`.
- Coding handoff: `shrimpy-coding-delegation`.
- Source-tree maintainer workflows: backlog, backlog worktrees, changelog, docs updates, reference docs, live-workspace mining, Pi upgrade planning, and release prep under root `skills/`.

Good docs-backed examples:

- `shrimpy-channels` points to [channels.md](../reference/channels.md), [surfaces.md](../reference/surfaces.md), and [cli.md](../reference/cli.md), then focuses on naming, routing, and guardrails.
- `shrimpy-watches` points to [configuration.md](../reference/configuration.md), [runtime.md](../reference/runtime.md), [channels.md](../reference/channels.md), and [cli.md](../reference/cli.md), then focuses on owner, cadence, wake behavior, and safety.
- [SKILL-001](skill-001-shrimpy-search-skill.md) captures the all-agent search-before-invent direction: the skill owns bounded lookup, while focused skills own concrete workflows.

## Gaps

### Skill Authoring And Lifecycle

Implemented: `shrimpy-skills` as an included Shrimpy how-to skill, plus `shrimpy-dev-skills` for source-tree skill edits.

This was the highest-confidence gap. Shrimpy has a rich `shrimpy skills` CLI and a reference doc, and now has a Shrimpy-owned behavior guide for when to create a workspace skill, install an included or external package, make an agent-local override, validate, and keep skill bodies as doc-backed agent guidance. It uses [SKILL-003](skill-003-agent-owned-skill-packages.md)'s copied included-package model: agent-owned skill files are real workspace state, and modified copies are allowed.

Docs to point at: [skills.md](../reference/skills.md), [cli.md](../reference/cli.md), [development.md](../reference/development.md), and [SKILL-001](skill-001-shrimpy-search-skill.md). The repo developer variant should also remind agents to edit root `skills/`, run `npm run build:skills`, and preserve `.agents/skills/` and `.claude/skills/` as generated mirrors.

### Context And Prompt Debugging

Candidate: `shrimpy-context-debugging`, likely mechanic-assigned after [SKILL-003](skill-003-agent-owned-skill-packages.md).

Shrimpy has several context surfaces: prompt sections, turn context, configured sources, memory slices, and persisted turn-context envelopes. Agents debugging "why did the agent see this?", "why didn't this memory load?", or "what context is too large?" need a guided inspection workflow more than another docs page. The skill should point to docs, then prescribe `shrimpy context --sections`, `shrimpy context --turn`, `shrimpy context sources list/run`, and bounded file inspection.

Docs to point at: [context-assembly.md](../reference/context-assembly.md), [turn-context.md](../reference/turn-context.md), [memory.md](../reference/memory.md), [workspace.md](../reference/workspace.md), and [cli.md](../reference/cli.md).

### Model Policy And Provider Selection

Candidate: `shrimpy-model-policy`, likely mechanic-assigned after [SKILL-003](skill-003-agent-owned-skill-packages.md).

Model state affects setup, session quality, local/private preferences, cost, and repair. The CLI has `shrimpy models` and `shrimpy models resolve`, but there is no behavior guide for diagnosing why an agent picked a model, changing a policy without overfitting setup, or explaining hosted-vs-local tradeoffs without embedding provider lore in prompts.

Docs to point at: [configuration.md](../reference/configuration.md), [sessions.md](../reference/sessions.md), and [cli.md](../reference/cli.md). This should stay a policy/debugging guide, not a model catalog.

### Session Lifecycle And Compaction

Candidate: `shrimpy-session-debugging`, lower priority than model, gateway, and context debugging.

Users and agents will ask to reset, restore, search, stop, or understand sessions. The command surface exists, and compaction has its own reference doc, but a skill would help preserve session data by default, choose read/search/reset commands, explain active-vs-archived sessions, and inspect compaction policy before deleting or resetting anything.

Docs to point at: [sessions.md](../reference/sessions.md), [compaction.md](../reference/compaction.md), [runtime.md](../reference/runtime.md), and [cli.md](../reference/cli.md).

### Gateway And Service Operations

Candidate: `shrimpy-gateway-ops`, likely mechanic-assigned after [SKILL-003](skill-003-agent-owned-skill-packages.md).

Setup and migration mention gateway commands, but operating the service is its own recurring maintenance shape: inspect status, read logs, restart safely, understand watch dormancy, and avoid uninstalling or rewriting LaunchAgents/system services without user approval. A small skill would prevent agents from treating gateway failures as generic process failures.

Docs to point at: [setup.md](../reference/setup.md), [runtime.md](../reference/runtime.md), [surfaces.md](../reference/surfaces.md), and [cli.md](../reference/cli.md).

### Workspace Knowledge And Capture

Implemented: `shrimpy-search` from [SKILL-001](skill-001-shrimpy-search-skill.md).

Shrimpy has workspace search, session search, channel search, and turn-context inspection. Agents need a behavioral wrapper for "find what we know" before creating duplicate memories, vault notes, watches, channels, agents, or skills. `shrimpy-search` owns that lookup path and hands off to `remember`, `shrimpy-channels`, `shrimpy-watches`, or `shrimpy-skills` once the relevant corpus is found.

Docs to point at: [workspace.md](../reference/workspace.md), [memory.md](../reference/memory.md), and [cli.md](../reference/cli.md).

### Adapter-Specific Surface Skills

Candidate: defer until a second real adapter ships.

`shrimpy-channels` covers generic surfaces and Telegram well enough today. A Discord, BlueBubbles, or browser-control surface should get its own setup/debugging skill only when the adapter has behavior that cannot be summarized by the generic routing skill plus reference docs. Research notes already exist for Discord and BlueBubbles; do not create adapter skills before implementation creates real command and config surfaces.

Docs to point at: [surfaces.md](../reference/surfaces.md), [channels.md](../reference/channels.md), and the relevant adapter reference doc after it exists.

## Existing Skill Cleanup

- `shrimpy-mechanic-ideas` and the broad `shrimpy-workflows` router are replaced by focused skills. Use `shrimpy-search` for lookup and the owning workflow skill for action.
- `shrimpy-coding-delegation` is the right owner for worker behavior, but it should point at [cli.md](../reference/cli.md) or a future worker reference doc instead of carrying too much command reference inline.
- `memory-management`, `journal-daily`, and `journal-compact` are useful watch-target skills, but their command recipes and hard-wrapped prose should be revisited when memory/reference docs can own more of the detail.
- `shrimpy-agents` and `shrimpy-setup` intentionally carry more policy because they touch live workspace state. When they change, prefer linking to docs for command details and keeping skill text focused on decisions, safety, and validation.

## Non-Gaps

- Every CLI command does not need a skill. Commands with clear inspection output and no behavioral fork can stay docs-only.
- Security and hygiene audits can stay checklist-heavy. Their value is the output contract, safety boundary, and review scope, not a durable reference explanation.
- Source developer skills do not need one-to-one coverage for every repo directory. Add them for repeat workflows with risk or recurring judgment, not for ordinary source editing.

## Build

1. Add the skill-authoring rule to Shrimpy's stable skill docs: skills guide agent behavior and point to docs wherever possible.
2. Add a `shrimpy-skills` included skill that points to the skill and CLI docs, guides workspace-vs-agent-vs-package choices, respects copied included-package ownership, and enforces validation.
3. Add a `shrimpy-dev-skills` source-tree developer skill for editing root `skills/` and included package sources, including `npm run build:skills` when generated mirrors are affected.
4. Add future skills only when the repeated behavior is clear: likely `shrimpy-model-policy`, `shrimpy-gateway-ops`, and `shrimpy-context-debugging`. Add `shrimpy-session-debugging` only if session reset/search/compaction support keeps producing recurring mechanic work.
5. Keep workspace knowledge lookup in `shrimpy-search` and durable capture in `remember`.
6. When touching existing included skills, reduce inline reference material and add doc breadcrumbs before adding new prose.

## Boundaries

- Do not add skills just to advertise that a feature exists.
- Do not duplicate reference docs, command catalogs, or long examples inside skills.
- Do not treat skills as permission or routing policy. They are context trails and behavior guides.
- Do not create adapter-specific skills before the adapter has shipped commands, config, and reference docs.
- Do not create backlog notes just to decide whether a small skill should exist. Add the obvious high-value skills after the included-package ownership model lands; defer the rest in this note.

## Done

- The current default and repository developer skill set has a documented coverage assessment.
- Shrimpy's skill reference states the docs-backed behavior-guide rule.
- `shrimpy-skills` and `shrimpy-dev-skills` cover the first high-confidence authoring/lifecycle gap.
- Lower-confidence candidates are accepted, deferred, implemented as `shrimpy-search`, or folded into existing skills with a short reason.
