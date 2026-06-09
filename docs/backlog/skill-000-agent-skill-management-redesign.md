# 🦐 SKILL-000: Agent Skill Management Redesign

Status: draft
Priority: P1
Area: Skills
Depends On: none

## Why

Shrimpy's current skill management is too close to "files happen to exist under a scanned directory." That is a weak product boundary for a system where agents are expected to gain capabilities, remember what they can do, and keep user-installed instructions inspectable over time.

The redesign should keep Pi as the skill runtime wherever Pi is already the right tool: parse Agent Skills, produce the available-skills prompt block, load full skill instructions on demand, and handle `/skill:<name>` behavior. Shrimpy should own the Shrimpy-specific layer around Pi: default skill distribution, workspace and agent scope, acquisition from local paths or URLs, provenance, deduplicated storage, compatibility with an agent's tools, and CLI inspection.

The intended user experience is simple: a user can tell an agent "add this skill pls <url>", the agent installs it for itself by default, and the skill's name and summary appear in that agent's available context on the next run. A workspace-wide install should happen only when the user explicitly asks for workspace scope.

## Principles

- Skills are prompt/resource bundles, not a separate automation control plane.
- Agent-local is the default mutation scope. Workspace-wide visibility is opt-in.
- Shrimpy source defaults are sparse, intentional, and scoped. Some defaults apply to every agent; others apply only to specific built-in agents such as `mechanic`.
- Installed skill content fetched through Shrimpy should have one canonical stored copy. Agent and workspace visibility can bind to that copy instead of repeating directories, unless the user customizes or forks the skill.
- Full skill text should not enter every session by default. The agent should see concise `name`/`description` summaries first, then load detailed instructions/resources through Pi's normal progressive-disclosure path.
- Metadata should stay light: enough to explain origin, last fetch, checksum/revision, source kind, local customization, and compatibility state.
- Shrimpy should follow the Agent Skills format in skill packages instead of inventing another package format. Shrimpy-specific metadata belongs in Shrimpy state or namespaced `metadata` fields only when package-local metadata is truly needed.
- Tool compatibility should be resolved before prompt assembly. If a skill requires tools the agent does not have, the skill should be inspectable but not advertised as available for that agent.

## Proposed Model

Use three separate concepts:

- **Package:** the canonical skill bundle with `SKILL.md` plus optional `scripts/`, `references/`, and `assets/`.
- **Binding:** a workspace or agent declaration that makes a package available in that scope.
- **Customization:** an agent or workspace-owned fork/overlay that intentionally diverges from the canonical package.

Shrimpy keeps owner-authored skill roots additive, while treating shared package storage as managed inventory. The effective skill set for an agent is resolved from:

1. packaged Shrimpy defaults declared in source;
2. workspace-authored skills under `skills/`;
3. agent-authored skills under `agents/<agent-id>/skills/`;
4. workspace-level package bindings;
5. agent-level package bindings;
6. custom forks that shadow a bound package for that scope;
7. per-session explicit skill selections.

Pi receives only the final compatible `SKILL.md` paths for that session.

Manual skill drops are allowed inside the owner's scope. If an agent writes `agents/<agent-id>/skills/new-thing/SKILL.md`, that is an agent-local skill and should become effective after normal validation and tool compatibility checks. If a workspace owner writes `skills/new-thing/SKILL.md`, that is a workspace skill. This preserves the useful "just edit files" workflow while still letting Shrimpy keep fetched/shared packages deduplicated.

## Source Defaults

Add a first-class default skill registry in source. It should be boring and small: a manifest plus package directories, not a second runtime.

The manifest should declare:

- skill id;
- package path;
- default target: all agents, no agents, or specific built-in agents;
- whether the default can be disabled;
- any Shrimpy-owned compatibility metadata that should not live in the skill package itself.

Default source skills should not be copied into every workspace during setup unless the user customizes them. Shrimpy can pass package-owned `SKILL.md` paths directly to Pi. Workspace state records only disabled defaults, added bindings, and custom forks.

## User-Installed Skills

Add one agent-friendly acquisition command that accepts a local path, direct `SKILL.md` URL, archive URL, repository URL, or well-known Agent Skills index URL:

```bash
shrimpy skills add <source> --agent <id>
shrimpy skills add <source> --workspace
```

Default behavior should require an agent id from the acting agent/session and bind only to that agent. `--workspace` is explicit because workspace installs affect every agent.

The command should:

- fetch/copy the package without executing bundled scripts;
- validate the `SKILL.md` shape through Pi or the same parser Pi uses;
- derive the id from frontmatter `name` unless `--id` is provided;
- store one canonical package copy;
- record origin URL/path, fetched timestamp, content hash, optional ETag/commit/ref/version, and source kind;
- create the requested binding only after validation succeeds;
- refuse replacement, origin changes, or workspace promotion unless explicitly forced by the user.

Useful companion commands:

```bash
shrimpy skills list [--agent <id>] [--json]
shrimpy skills inspect <id> [--agent <id>] [--json]
shrimpy skills show <id> [--agent <id>]
shrimpy skills update <id> [--agent <id>|--workspace]
shrimpy skills bind <id> --agent <id>|--workspace
shrimpy skills unbind <id> --agent <id>|--workspace
shrimpy skills fork <id> --agent <id>|--workspace
shrimpy skills validate [id] [--agent <id>] [--json]
```

Use `add` for acquisition and binding. Move local authoring to a clearer command such as `shrimpy skills new <id>`.

## Storage Sketch

Keep enabled visibility separate from package content. Exact filenames can change during implementation, but the shape should preserve these boundaries:

```text
skills/packages/<id>/SKILL.md              canonical user-installed package
skills/packages/<id>/scripts/...
skills/packages/<id>/references/...
skills/packages/<id>/assets/...
state/skills/packages.json                 origin, fetchedAt, hash, etag/ref/version, source kind
state/skills/bindings.json                 workspace bindings and agent bindings
skills/custom/<id>/SKILL.md                optional workspace customization for a managed package
agents/<agent-id>/skills/<id>/SKILL.md     agent-authored skill or agent customization
```

Package storage is not the enablement mechanism for fetched/shared packages. Bindings are. Local `skills/` roots remain additive authoring surfaces.

`agents/<agent-id>/skills/<id>/` is not legacy; it is the agent's owned skill authoring surface. Shrimpy should inspect and validate those skills, then omit only skills that fail loading or are blocked by compatibility policy.

## Tool Compatibility

Use the agent tool capability view as the local truth. A skill cannot grant itself tools.

Initial compatibility rules:

- Parse the standard Agent Skills `allowed-tools` field when present.
- Treat `allowed-tools` as a compatibility declaration and permission request, not as authorization.
- Support a small Shrimpy interpretation layer that maps names such as `Read`, `Bash(...)`, `read`, `bash`, or Shrimpy daemon tool names onto the agent's resolved tool policy.
- If a required/declared tool is unavailable, keep the package and binding inspectable but mark the skill unavailable for that agent and omit it from Pi's advertised skills.
- Show missing tools in `shrimpy skills list --agent <id>`, `shrimpy skills inspect`, and `shrimpy agent inspect`.
- If the ecosystem settles on a distinct required-tools metadata key, support it as an input to the same compatibility check. Until then, prefer the standard `allowed-tools` field plus Shrimpy state over a new first-party package convention.

This is the main agent experience improvement: agents should not see skills they cannot actually use, and users should get a concrete reason instead of confusing failed tool attempts.

## Boundaries

- Do not build a first-party skills marketplace.
- Do not require registry accounts, API keys, or cloud services for skills.
- Do not auto-install workspace-wide skills from an agent-local request.
- Do not execute skill scripts during install/update/validation.
- Do not duplicate package directories per agent unless the user intentionally customizes that agent's copy.
- Do not invent a Shrimpy-only skill package format.
- Do not add backward-compatibility shims or migration behavior in this item unless the user explicitly asks for an existing-workspace migration plan.

## Implementation Slices

1. Add a resolver for effective skills from source defaults, local skill roots, package bindings, and compatibility gates while still passing final paths to Pi.
2. Add source default skill manifest support and stop copying unchanged defaults into new workspaces.
3. Add canonical package storage plus provenance metadata for local path installs.
4. Extend acquisition to direct URLs and simple well-known Agent Skills discovery.
5. Add tool compatibility gating and expose blocked reasons in skill and agent inspection.
6. Add update/unbind/fork flows and tests for replacement safety.
7. Refresh stable docs once behavior exists.

## Done

- New workspaces get sparse Shrimpy defaults without repeating default package content in workspace storage.
- Agents can install a URL skill for themselves through a CLI path and see its summary in their available skills context.
- Workspace-wide skill installation requires explicit workspace scope.
- One canonical user-installed package can be bound to multiple agents without duplicate copies.
- Customizing a skill creates a deliberate scoped fork.
- Origin, last fetched time, and content hash are inspectable.
- Skills with missing required/declared tools are visible in inspection output but are not advertised as available to incompatible agents.
- Pi remains the runtime loader for the final effective skill paths.
- Tests cover default resolution, local skill root discovery, URL/local acquisition, non-overwrite behavior, provenance recording, scoped bindings, custom fork precedence, and tool compatibility gating.
