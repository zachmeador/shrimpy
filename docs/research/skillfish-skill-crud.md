# 🦐 Skillfish And Skill CRUD

Date: 2026-06-09
Status: Research note

This note reviews [`knoxgraeme/skillfish`](https://github.com/knoxgraeme/skillfish) for ideas Shrimpy can borrow while its own skill CRUD is still prototyping. The short answer: Skillfish has useful product and safety ideas, but it is not a good direct dependency for Shrimpy right now.

## Sources Checked

- GitHub repo: [`knoxgraeme/skillfish`](https://github.com/knoxgraeme/skillfish), cloned at `d8b9e2824818e134fd99710c0b86202b4043aaea` from `main`, latest commit dated 2026-06-06.
- npm package metadata: [`skillfish@1.0.37`](https://www.npmjs.com/package/skillfish), last modified 2026-05-03.
- npm tarball: `skillfish-1.0.37.tgz`, 49 files, 314,560 bytes unpacked.
- Skillfish source at the reviewed commit: [`README.md`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/README.md), [`package.json`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/package.json), [`LICENSE`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/LICENSE), [`src/commands/add.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/commands/add.ts), [`src/commands/install.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/commands/install.ts), [`src/commands/bundle.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/commands/bundle.ts), [`src/commands/update.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/commands/update.ts), [`src/lib/installer.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/lib/installer.ts), [`src/lib/manifest.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/lib/manifest.ts), [`src/lib/project-manifest.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/lib/project-manifest.ts), [`src/lib/github.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/lib/github.ts), [`src/telemetry.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/telemetry.ts), [`src/telemetry-worker.ts`](https://github.com/knoxgraeme/skillfish/blob/d8b9e2824818e134fd99710c0b86202b4043aaea/src/telemetry-worker.ts).
- Shrimpy current skill surface: `src/commands/skills.ts`, `src/skills/service.ts`, `docs/reference/skills.md`, `docs/backlog/skill-000-agent-skill-management-redesign.md`.

## Short Answer

Do not make Skillfish a Shrimpy dependency now.

The license is the blocker. Skillfish is declared and shipped as `AGPL-3.0`. That is a real free software license, but it is a strong copyleft/network-copyleft license and a poor fit for embedding into Shrimpy's MIT-licensed runtime without an explicit license decision. Even ignoring license risk, the package is CLI-shaped rather than SDK-shaped: `dist/index.js` exports nothing, there is no `exports` map, and the reusable functions are only reachable by deep imports into internal modules. Those internals include global agent detection, global/project filesystem writes, update-notifier, registry calls, and opt-out telemetry. That is not the clean dependency shape Shrimpy wants for live-workspace-safe CRUD.

The useful path is to borrow ideas, not code. Skillfish is helpful as a reference for GitHub repository acquisition, declarative manifests, update tracking, safe copy behavior, and user-facing command ergonomics. Shrimpy should keep owning its visible-copy package model and lean on Pi for Agent Skills parsing.

## What Skillfish Is

Skillfish is a standalone skill manager for many coding agents. It detects installed agents such as Claude Code, Cursor, Codex, Copilot, Gemini CLI, OpenCode, Goose, and others, then installs `SKILL.md` bundles into each agent's expected skill directory. It supports global and project scopes, interactive and JSON modes, repository discovery, updates, removal, local skill initialization, registry search, registry submission, and a `skillfish.json` team manifest.

The main model is:

- `skillfish add owner/repo` discovers `SKILL.md` files in a GitHub repository, lets the user select one or all skills, downloads the chosen directory through `giget`, and copies it into every selected agent's skills directory.
- Each external installed skill gets a `.skillfish.json` manifest in the skill directory with owner, repo, path, branch, SHA, optional pinned ref, installed directory name, and source mode.
- `skillfish update` scans installed skills that have manifests, checks GitHub tree/blob SHAs, and reinstalls changed skills.
- `skillfish bundle` scans installed external skills and writes a project or global `skillfish.json`.
- `skillfish install` reconciles a `skillfish.json` manifest: install missing entries, reinstall changed refs/sources, skip unchanged entries, and remove manifest-managed skills no longer listed.
- Local skills created by `skillfish init` do not get external manifests and are intentionally excluded from bundle output.

That is a polished CLI product shape. It is not the same product as Shrimpy. Shrimpy's skills are scoped to a Shrimpy workspace and Shrimpy agents, with Pi as the runtime loader; Skillfish is an OS-level sync/install tool across many unrelated agents.

## Dependency Fit

Skillfish has five top-level runtime dependencies: `@clack/prompts`, `commander`, `giget`, `picocolors`, and `update-notifier`. In the cloned lockfile that expands to 63 production package entries. This is not enormous for a CLI, but it is not minimal for Shrimpy's needs, especially because Shrimpy already has command parsing, uses Node's built-in `fetch`, and can implement GitHub tarball or raw-file acquisition without carrying interactive prompt and update notification packages.

The published npm package is `skillfish@1.0.37`, but the cloned GitHub `main` `package.json` says `1.0.31`, while npm metadata says `gitHead` is `5231f55dc1342d8087e70526e6109783db09d6d1` and GitHub `main` HEAD is `d8b9e2824818e134fd99710c0b86202b4043aaea`. There are no tags in the shallow clone. This is not necessarily wrong, but it weakens confidence that GitHub source, npm source, and release provenance are straightforward to audit.

Telemetry is also a mismatch. Skillfish dispatches command and install telemetry to `https://mcpmarket.com/api/telemetry` from a detached worker, disabled by `DO_NOT_TRACK` or CI. That can be acceptable in a user-facing CLI if documented clearly, but it is not acceptable as hidden behavior inside Shrimpy's own skill installation path. A dependency would need a stable library API that cannot trigger update checks, prompts, registry traffic, or telemetry unless Shrimpy explicitly asks.

Verdict: no direct dependency unless Skillfish later offers a permissively licensed SDK package with explicit exports, no side effects, no telemetry in library paths, and a narrow API for parsing repository specs, discovering skills, downloading bundles, and computing provenance.

## Current Shrimpy Shape

Shrimpy's current skill CRUD shape already covers the core model from SKILL-000:

- `shrimpy skills list [--agent <id>] [--json]`
- `shrimpy skills show <id> [--agent <id>]`
- `shrimpy skills add <source> [--agent <id>|--workspace] [--id <id>] [--path <path>] [--ref <ref>] [--all] [--dry-run] [--force] [--json]`
- `shrimpy skills update <id> [--agent <id>|--workspace] [--dry-run] [--json]`
- `shrimpy skills remove <id> [--agent <id>|--workspace] [--json]`
- `shrimpy skills new <id> [--agent <id>|--workspace] [--description <text>] [--force]`
- `shrimpy skills validate [id] [--agent <id>] [--json]`

The resolver scans agent-owned `agents/<id>/skills/<id>/SKILL.md` and workspace-owned `skills/<id>/SKILL.md`, annotates package-backed copies from `state/skills/packages.json`, validates through Pi's `loadSkills`, enforces id/frontmatter name agreement, tracks shadowed skills, gates advertising by declared tool compatibility, and passes only winning compatible `SKILL.md` paths into Pi.

The biggest difference from Skillfish is storage philosophy. Skillfish stores a manifest inside each installed skill directory. Shrimpy stores target-scoped provenance centrally in `state/skills/packages.json`, but still installs package content as visible copies in the target workspace or agent skill root so agents and users can inspect and edit what is actually available.

Shrimpy is still missing the customization lifecycle command: `fork`. Skillfish is most useful as a reference for that follow-up and for any later manifest sync surface.

## Worth Borrowing

### Repository Spec Parsing

Skillfish accepts compact GitHub specs:

```text
owner/repo
owner/repo@v1.0.0
owner/repo/path/to/skill
owner/repo@main/skills/my-skill
```

Shrimpy's current `skills add` accepts local directories, local Markdown files, direct `http(s)` `SKILL.md` URLs, and GitHub repository specs with explicit `--ref` and `--path` support. This was added in Shrimpy's own parser rather than by adopting Skillfish's package, and Shrimpy preserves the default of agent-local install unless `--workspace` is explicit.

One caveat from Skillfish's parser: `owner/repo@ref/path` cannot represent branch names with slashes and a path at the same time, because the first slash after `@` separates ref from path. Shrimpy should either document that limitation, prefer explicit `--ref` and `--path` flags for ambiguous cases, or use a URL-like syntax rather than overloading one string too far.

### GitHub Discovery

Skillfish discovers skills by fetching the repo default branch, then the recursive Git tree, then every path ending in `SKILL.md`. It fetches each candidate raw `SKILL.md` to read `name` and `description` for selection. This is the shape Shrimpy now uses for GitHub repository URLs: discover many bundles in a repo, fail clearly when multiple candidates exist in non-interactive mode unless `--all` or `--path` is supplied, and keep JSON output agent-friendly.

Shrimpy should still validate selected entries through Pi after download, because Pi is Shrimpy's runtime parser.

### Provenance And Update Tracking

Skillfish's `.skillfish.json` stores enough provenance to explain and update a package: owner, repo, path, branch, SHA, optional pinned ref, installed name, and whether the skill came from manual add or a manifest. Shrimpy's `state/skills/packages.json` records source, source kind, fetched timestamp, content hash, source revision, and GitHub owner/repo/path/ref/commit metadata for GitHub-backed packages.

The useful extraction is to keep those fields in Shrimpy package state rather than package-local `.skillfish.json` files:

```json
{
  "sourceKind": "github",
  "owner": "owner",
  "repo": "repo",
  "path": "skills/foo",
  "ref": "v1.0.0",
  "resolvedRef": "main",
  "resolvedSha": "..."
}
```

Skillfish's most useful detail is directory-level change detection. For a subdirectory skill, it stores the tree SHA for that directory; for a root skill, it stores the `SKILL.md` blob SHA. That reduces false update notifications when unrelated files in the repo change. Shrimpy now does the same for GitHub-backed packages.

### Manifest Sync

Skillfish's `skillfish.json` is useful as a team sync shape: a declarative list of external skills, where local skills remain in the repo and external skills are installed by manifest. Shrimpy probably should not make `skillfish.json` its native state file because the name and semantics are Skillfish-owned, but an import/export compatibility command could be useful later:

```bash
shrimpy skills import skillfish.json --agent <id>
shrimpy skills export --workspace --format skillfish
```

That should stay optional. Shrimpy's durable truth should remain `state/skills/packages.json` and the visible workspace or agent skill roots.

### Safe Copy And Rollback

Skillfish's installer skips symlinks while copying downloaded bundles, creates destination parents with restrictive modes, backs up existing directories before overwrite, and rolls back on copy failure. Shrimpy's package installer already stages into a temp directory and only moves into place after Pi validation, which is good. The local-directory copy path should adopt the symlink posture: do not preserve or follow symlinks from a skill package into managed storage. A malicious or accidental local skill directory should not be able to smuggle links to unrelated user files into `state/skills/packages/`.

Skillfish also refuses to execute bundled scripts during install. Shrimpy should keep that boundary.

### Command Ergonomics

Skillfish consistently supports `--json`, non-interactive behavior, confirmation before installing untrusted skill instructions, and clear "already exists, use --force" behavior. Shrimpy has the right agent-friendly CLI instinct already, but the useful details are:

- machine-readable JSON for every lifecycle command;
- targeted exit codes or stable error codes once agents start composing skill commands;
- dry-run support for `skills add`, `skills update`, and any future manifest sync;
- clear distinction between local authored skills and external package skills.

## Not Worth Borrowing

Do not borrow global multi-agent detection. Shrimpy should not scan a user's entire home directory for Claude/Cursor/Codex/etc. skill directories. Shrimpy's relevant boundary is the Shrimpy workspace and configured Shrimpy agents.

Do not borrow Skillfish's global duplicate-install model. Installing the same external skill into every detected OS-level agent directory makes sense for a cross-agent tool. Shrimpy's boundary is narrower: copy packages only into the selected Shrimpy workspace or agent skill root, then track provenance centrally.

Do not borrow registry search or submission as a core feature. `skill.fish`/MCP Market integration is a product surface outside Shrimpy's current skill CRUD problem. If Shrimpy eventually supports discovery, make it an optional provider, not a base dependency.

Do not borrow telemetry or update-notifier behavior. Shrimpy's skill management should be inspectable, local-first, and quiet unless the user asks for network work.

Do not borrow Skillfish's frontmatter parsing. It uses regex helpers for `name` and `description`. Shrimpy should keep delegating Agent Skills parsing and validation to Pi so runtime behavior and CLI inspection stay aligned.

## Recommended Shrimpy Follow-Ups

1. Add `shrimpy skills fork` before building any broad sync/import flow.
2. Consider ETag/Last-Modified tracking for direct URL updates; the current path can still fetch and hash direct `SKILL.md` sources.
3. Report skipped local package entries as warnings when symlinks, hidden entries, or `node_modules` are ignored.
4. Consider stable error codes once agents start composing skill commands heavily.
5. Consider a later optional `skillfish.json` import/export for interoperability, but do not make that file Shrimpy's source of truth.

## Final Take

Skillfish is clean enough to learn from as a CLI, but not clean enough to embed as a Shrimpy dependency. The AGPL license alone makes it a bad fit for a permissively licensed Shrimpy runtime. The package shape confirms that: it is a CLI with prompts, updater, telemetry, registry hooks, and global agent filesystem assumptions, not a narrow library for skill package acquisition.

For Shrimpy, the best extraction is conceptual: GitHub repo specs, per-package provenance, directory-level SHA update checks, manifest-style sync semantics, dry-run/update ergonomics, and symlink-safe copying. The first set is now in Shrimpy while Shrimpy's own target-scoped package state and Pi-backed validation remain the center.
