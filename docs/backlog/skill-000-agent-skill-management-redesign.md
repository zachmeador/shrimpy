# 🦐 SKILL-000: Agent Skill Management Redesign

Status: review
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

The effective skill set for an agent is resolved by precedence:

1. agent-authored skills under `agents/<agent-id>/skills/`;
2. workspace-authored skills under `skills/`;
3. fetched package bindings for the agent or workspace;
4. packaged Shrimpy defaults declared in source;
5. per-session explicit skill selections resolved through the same view.

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

Add one agent-friendly acquisition command. The current implementation accepts a local skill directory, local Markdown `SKILL.md` file, direct `http(s)` `SKILL.md` URL, or GitHub repository spec:

```bash
shrimpy skills add <source> --agent <id> [--path <path>|--all] [--dry-run]
shrimpy skills add <source> --workspace [--path <path>|--all] [--dry-run]
```

Default behavior binds only to one agent, using `--agent <id>` when supplied or the configured default agent otherwise. `--workspace` is explicit because workspace installs affect every agent.

The command should:

- fetch/copy the package without executing bundled scripts;
- validate the `SKILL.md` shape through Pi or the same parser Pi uses;
- derive the id from frontmatter `name` unless `--id` is provided;
- store one canonical package copy;
- record origin URL/path, fetched timestamp, content hash, source revision, GitHub owner/repo/path/ref/commit metadata when relevant, and source kind;
- create the requested binding only after validation succeeds;
- refuse replacement, origin changes, or workspace promotion unless explicitly forced by the user.

Useful companion commands:

```bash
shrimpy skills list [--agent <id>] [--json]
shrimpy skills show <id> [--agent <id>]
shrimpy skills update <id> [--dry-run] [--json]
shrimpy skills bind <id> [--agent <id>|--workspace] [--json]
shrimpy skills unbind <id> [--agent <id>|--workspace] [--json]
shrimpy skills fork <id> --agent <id>|--workspace
shrimpy skills validate [id] [--agent <id>] [--json]
```

Use `add` for acquisition and binding. Move local authoring to a clearer command such as `shrimpy skills new <id>`.

## Storage Sketch

Keep enabled visibility separate from package content. Exact filenames can change during implementation, but the shape should preserve these boundaries:

```text
state/skills/packages/<id>/SKILL.md        canonical user-installed package
state/skills/packages/<id>/scripts/...
state/skills/packages/<id>/references/...
state/skills/packages/<id>/assets/...
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

## Implemented Scope

1. Add a resolver for effective skills from source defaults, local skill roots, package bindings, and compatibility gates while still passing final paths to Pi.
2. Add source default skill manifest support and stop copying unchanged defaults into new workspaces.
3. Add canonical package storage plus provenance metadata for local path, local file, direct `SKILL.md` URL, and GitHub-backed installs.
4. Add `shrimpy skills add` for fetched package acquisition/binding and `shrimpy skills new` for local authoring.
5. Add tool compatibility gating from `allowed-tools`, expose blocked reasons in `skills list`/`validate`, and omit incompatible skills from Pi.
6. Add GitHub repository spec parsing, multi-`SKILL.md` discovery, `--path`/`--all` selection, dry-run add output, GitHub provenance, directory/blob SHA update checks, and `shrimpy skills update`.
7. Add `shrimpy skills bind` and `shrimpy skills unbind` to change managed package visibility without refetching or duplicating package content.
8. Refresh stable docs and tests for default resolution, local additive roots, package acquisition, provenance, scoped bindings, shadowing, update checks, dry runs, and tool compatibility.

## Remaining Follow-Ups

- Add `shrimpy skills fork` for intentional agent or workspace customization of managed packages.
- Extend acquisition beyond local/direct URL/GitHub sources to archives or well-known skill indexes if those become worth supporting.
- Surface missing skill tools in `shrimpy agent inspect` as well as the skill commands.
