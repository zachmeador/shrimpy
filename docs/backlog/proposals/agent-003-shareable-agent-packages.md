---
status: draft
priority: P3
area: Agents
depends_on: []
---

# 🦐 AGENT-003: Shareable Agent Packages

## Why

Skills make capabilities portable, but Shrimpy agents are also meaningful artifacts. A carefully authored character, mechanic, simulated authority, or other persistent actor may have a durable identity, agent-specific skills, safe defaults, and optional supporting agents worth sharing as one coherent definition.

Sharing an agent is not the same as copying its workspace root. An installed agent immediately begins accumulating user-owned memory, sessions, saved material, projects, and local configuration. Treating that lived directory as an ordinary replaceable package would make updates destructive and exports unsafe.

An agent package should therefore be a portable definition that instantiates a living agent. Reuse the source resolution, discovery, provenance, hashing, drift detection, and inspect-before-change ergonomics of skill packages, while giving agents a lifecycle that preserves everything they become after installation.

## Current State

- `shrimpy agent add`, configuration commands, and agent-root scaffolding create and manage local agents, but there is no external package source or provenance record for an agent definition.
- Skill packages already install from included, local, URL, and GitHub sources; discover multiple packages in repositories; record source revisions and content hashes; report local drift; update managed copies; and reject script execution during installation.
- Workspace checkpoint tracking distinguishes definition-like agent files from lived state: `SOUL.md`, `watches.json`, and skills are checkpointable, while context, vault, projects, sessions, auth, media, and runtime state are not.
- [AGENT-002](agent-002-parent-owned-tidepools.md) defines an optional one-level ownership shape for qualifying child agents. Shareable top-level agents must not depend on tidepools existing.
- There is no safe export boundary, package manifest, install preview, definition-update policy, or way to detach package management while preserving an instantiated agent.

## Agent Admission

Package availability is not a reason to create another persistent agent. Before installation, guidance should still choose the smallest sufficient primitive:

- Install a skill when the package is reusable behavior, domain knowledge, or a capability the current agent can perform.
- Use a worker session when the work has a concrete goal and completion point.
- Install an agent only when it has an enduring identity or viewpoint, needs genuinely separate memory, and acts independently over time.
- Install as a top-level agent when it belongs to the household or collaborates across systems.
- Install into a parent's tidepool only when AGENT-002 exists and the actor is durably dedicated to that parent.

Package inspection should state why the package claims to need a persistent actor and make its watches, tools, model assumptions, skills, context seeds, and optional children visible before installation.

## Package Shape

Use a declarative agent-package directory with one manifest entrypoint, provisionally `AGENT.md`, plus definition resources:

```text
AGENT.md
SOUL.md
skills/
watches.json
seed/
  context/
tidepool/
  <child>/
```

The exact manifest schema remains open, but it should include a stable package name, description, source-visible purpose, supported install targets, agent config defaults, activation requirements, and the child admission rationale for every packaged child. A repository may contain multiple discoverable agent packages, using the same explicit candidate-selection behavior as multi-skill repositories.

An agent package has three ownership layers:

1. **Managed definition:** manifest, `SOUL.md`, packaged skills, watch definitions, safe agent-config defaults, and optional one-level child definitions. Package provenance and drift rules apply here.
2. **One-time seeds:** explicitly selected context seeds copied during instantiation and immediately becoming user-owned. Updates never replace them.
3. **Lived state:** evolving context, vault contents, projects, sessions, channel logs, runtime state, media, auth, model credentials, and other records. Package management never owns, updates, or exports these.

Packaged tidepools use the same definition/seed/lived split for each child. Agent packages never contain recursive children.

## CLI Shape

Keep agent packages under the agent command surface while making package lifecycle visibly distinct from ordinary agent lifecycle:

```text
shrimpy agent package inspect <source>
shrimpy agent package install <source> --dry-run
shrimpy agent package install <source> --as <agent-id>
shrimpy agent package install <source> --parent <agent-id>
shrimpy agent package list
shrimpy agent package show <agent-id>
shrimpy agent package update <agent-id> --dry-run
shrimpy agent package update <agent-id>
shrimpy agent package detach <agent-id>
shrimpy agent package export <agent-id>
```

Command spelling can change during implementation, but these operations should remain distinct:

- `inspect` and `--dry-run` resolve the source, validate the package, show the complete definition and activation plan, identify every persistent actor, and make no changes.
- `install` atomically records provenance and instantiates a top-level agent by default. `--parent` is available only when AGENT-002 is implemented and its admission rules pass.
- `update` considers only the managed definition. It applies clean upstream changes atomically when the live definition still matches its recorded base and refuses to overwrite locally modified definition files or config without an explicit review decision.
- `detach` removes provenance and package-update ownership while preserving the agent, its definition files, and all lived state.
- `export` emits a package from the definition layer. Context seeds require explicit opt-in; lived state is structurally ineligible.
- Actual agent removal remains `shrimpy agent remove`. Package commands never silently delete a living agent.

## Installation And Activation

Installation must be inert with respect to background and external behavior:

- Do not execute package scripts, skills, commands, or model turns during inspect, install, update, detach, or export.
- Reject unsafe paths and symlinks using the same staged-copy posture as skill packages.
- Do not create external surface bindings, broad channel membership, scheduled wakes, or user-visible delivery merely because a package declares them.
- Stage package-provided watches and channel requirements as an inspectable activation plan. Enabling them requires an explicit activation decision after the agent definition and effective policies are visible.
- Resolve safe workspace defaults for models and tools without importing provider credentials, concrete local model registry entries, or authorization assumptions from the package.
- If activation needs guided setup, use a packaged skill in a normal agent session after installation. The setup skill may propose ordinary CLI changes but receives no special installer privileges.

## Build

- Define and validate the agent-package manifest, safe file layout, package id rules, supported config defaults, seed rules, optional child declarations, and activation plan.
- Extract or reuse the skill package source resolvers, repository discovery, download staging, source revision metadata, hashing, symlink rejection, and atomic copy helpers through a package-neutral boundary rather than duplicating them.
- Add agent-package provenance and base-definition hashes under Shrimpy state, separate from skill package records and from the live agent root.
- Implement inspect, dry-run, install, list, show, update, detach, and export as CLI-first operations with JSON output.
- Make updates compare recorded base, incoming definition, and live definition/config. Never touch seed or lived paths, and refuse ambiguous drift rather than guessing.
- Make export walk an explicit definition allowlist rather than a broad denylist. Secrets and records should be structurally unreachable from the exporter.
- Add activation-plan inspection and explicit application for watches, channel membership, and other ambient behavior.
- When AGENT-002 exists, allow one package to declare a root agent plus a one-level tidepool or allow a single agent package to target an existing parent. Keep top-level installation fully usable without AGENT-002.
- Update `shrimpy-agents`, `shrimpy-skills`, setup guidance, workspace migration guidance, and stable package documentation with the agent admission test and the definition/seed/lived ownership model.

## UX Implications

- Users can inspect a shareable agent before deciding whether they want another persistent actor in their home.
- Installation feels familiar to skill-package users: the same source kinds, candidate discovery, dry runs, provenance, and drift language apply.
- The package preview makes the larger consequence explicit. It shows identity, memory seeding, watches, tool/model defaults, channel requirements, and optional child actors instead of presenting an agent like a harmless capability.
- Local customization is expected. A modified `SOUL.md`, packaged skill, watch definition, or managed config value causes update review rather than silent replacement.
- Detaching package management keeps the living agent intact. Removing the agent remains a separate, explicit, potentially destructive action.
- Export produces a reviewable definition package, never an accidental backup containing memories, transcripts, credentials, or personal files.
- Users who only need reusable behavior are directed to install a skill instead.

## Boundaries

- No nested workspaces, workspace packages, gateway packages, or alternate runtime scopes.
- No recursive agent ownership. Optional packaged children are one level deep and depend on AGENT-002.
- No packaging or exporting sessions, evolving context, vault contents, projects, channel logs, runtime state, media, auth, model credentials, or provider configuration.
- No package install or update that executes scripts, starts model sessions, enables watches, joins external channels, or binds surfaces automatically.
- No package update that overwrites locally modified definition material or any lived state without an explicit review decision.
- No package removal command that conflates stopping package management with deleting an agent.
- No treating research, editing, planning, reviewing, or other capability-shaped roles as agents merely because a package exists.
- No migration or compatibility shim for unmanaged existing agents. Exporting or adopting one into package management must be an explicit operation.

## Notes

- “Agent package” is preferable to “agent bundle” because it aligns with skill-package vocabulary and leaves “bundle” available for broader application artifacts if those ever become necessary.
- The managed-definition record must retain enough base material or hashes to explain drift without treating user-owned files as disposable.
- A package may provide skills containing scripts as ordinary resources, but package management never runs them. Later execution occurs through normal agent tools and policy.
- Channel templates may belong in the activation plan, but channel logs never belong in the package.
- The first useful vertical slice is a single top-level agent from a local source with inspect, install, drift-aware update, detach, and definition-only export. GitHub discovery and packaged tidepools can follow once that lifecycle is trustworthy.

## Touches

- [AGENT-002](agent-002-parent-owned-tidepools.md): optional one-level child definitions and installation into an existing parent's tidepool.
- [Skills](../../reference/skills.md): source resolution, discovery, provenance, hashing, drift, update, and validation mechanics to reuse.
- [Workspace](../../reference/workspace.md): agent-root layout and checkpoint definition-versus-lived-state precedent.
- [Configuration](../../reference/configuration.md): safe packaged agent defaults and live config drift.
- [Channels](../../reference/channels.md): inspectable activation plans for membership and delivery without packaging logs.
- [Runtime](../../reference/runtime.md): packaged watch definitions remain inactive until explicitly enabled.
- [SECURITY-001](../security-001-agent-sandboxing-security-strategy.md): installed agents and packaged scripts still operate under ordinary agent tool and sandbox policy.

## Done

- Local, URL, and GitHub sources can be inspected and installed as top-level agent packages with provenance recorded.
- Multi-package repositories require explicit candidate selection and package validation rejects unsafe layouts and symlinks.
- Dry-run output shows every persistent actor, managed definition file, context seed, effective config default, watch, channel requirement, and activation action.
- Package installation and update execute nothing and activate no watches, surface bindings, or external delivery.
- Definition updates are atomic, preserve locally modified files pending explicit review, and never inspect or modify lived state.
- Detaching package management preserves the agent and all of its files; deleting the agent remains a separate command.
- Export includes only allowlisted definition material plus explicitly selected seeds and cannot reach secrets, memories, records, projects, or runtime state.
- Stable docs and included skills teach when to install a skill, top-level agent, tidepool child, or worker session.
- If AGENT-002 is available, packages may include one qualifying tidepool or target an existing parent without allowing recursive nesting.
