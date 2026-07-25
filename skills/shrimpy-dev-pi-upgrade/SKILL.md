---
name: shrimpy-dev-pi-upgrade
description: Use when evaluating whether Shrimpy can upgrade to the latest stable Pi packages from a local Pi git clone, identifying likely breakage, and updating the assessment in docs/research/pi-agent.md without applying the upgrade in the main checkout.
---

# Shrimpy Dev Pi Upgrade

Use this Shrimpy developer skill from the Shrimpy repository when the user wants an upgrade assessment for Pi dependencies.

## Goal

Update the local Pi source clone (outside of the shrimpy project dir) to the latest stable Pi version, compare that version against the Pi packages currently used by Shrimpy, find what would break if Shrimpy upgraded, and update the upgrade assessment in `docs/research/pi-agent.md`.

Do not apply the upgrade to the main Shrimpy checkout unless the user explicitly asks for implementation after the report.

## Safety Boundaries

- Treat Shrimpy workspace config and runtime state as user data. Do not reset, migrate, delete, or rewrite workspace files.
- Keep the main Shrimpy checkout inspectable. Prefer a temporary Shrimpy worktree or disposable copy for dependency install, build, and test probes.
- Do not change `package.json`, lockfiles, source, tests, or generated output in the main checkout except for the requested developer-skill source and mirrors and the final `docs/research/pi-agent.md` update.
- If the working tree is dirty, record that in the report before using a clean worktree based on `HEAD`; mention that uncommitted local changes were not part of the probe unless you deliberately copied them into the disposable checkout.
- In the Pi clone, ordinary update commands are allowed for this skill: `git fetch --tags --prune` and a fast-forward pull of the stable branch or tag checkout used for analysis. Do not rewrite the Pi clone history.

## Workflow

1. Confirm you are in the Shrimpy project root. Read `AGENTS.md` and `AGENTS-PRIVATE.md` if present for local clone paths.
2. Find the Pi git clone. Prefer paths documented in `AGENTS-PRIVATE.md`, then nearby reference clone directories such as `../clones/`. If several Pi clones exist, choose the one whose package names match Shrimpy's `@earendil-works/pi-*` dependencies and record the path.
3. In the Pi clone, update remote metadata and identify the latest stable Pi release. Prefer the highest non-prerelease semver tag or stable branch release; ignore alpha, beta, rc, canary, nightly, and experimental tags unless the user explicitly asks for prerelease analysis.
4. In Shrimpy, inspect current Pi usage:
   - Read `package.json` and any lockfile for pinned `@earendil-works/pi-*` package versions.
   - Search source and tests for Pi imports, exported types, runtime adapters, and assumptions with `rg "@earendil-works/pi-|from \"pi|loadSkills|Pi" src test package.json`.
5. Compare current Pi to latest stable Pi:
   - Use the Pi clone's changelog, package manifests, exported type declarations, source diffs, and tests.
   - Diff from the tag or commit matching Shrimpy's current Pi package version to the latest stable tag or commit.
   - Focus on APIs Shrimpy imports, CLI/runtime behavior Shrimpy wraps, skill loading, prompt/session behavior, TUI integration, model config, tool schemas, and filesystem expectations.
6. Probe the upgrade in a disposable Shrimpy checkout when feasible:
   - Create a temporary `git worktree` or copy outside the main checkout.
   - Install the candidate Pi package versions there.
   - Run the smallest useful checks first, usually `npm run build`, then targeted tests around affected areas. Run the full test suite only if it is useful and affordable.
   - Keep command output concise; capture failures, not entire logs.
7. Update `docs/research/pi-agent.md` with the result. Refresh its date, current integration facts, latest stable version, upgrade assessment, implementation sequence, and relevant sources without replacing unrelated architectural or ecosystem research.

## Report Shape

The upgrade-assessment sections in `docs/research/pi-agent.md` should remain direct and actionable and preserve every field from the standalone plan contract. Integrate them with the broader research note instead of dropping detail:

```markdown
Updated: YYYY-MM-DD

## Latest Stable Pi
- Current Shrimpy Pi packages: <packages and versions>
- Latest stable Pi version inspected: <version/tag/commit>
<concise change summary>

## `<version>` Upgrade Assessment
Shrimpy checkout: <path and commit>
Pi clone: <path and commit/tag>

### Summary
<upgrade recommendation and confidence>

### Versions
- Current Shrimpy Pi packages: <packages and versions>
- Latest stable Pi version inspected: <version/tag/commit>

### Likely Breakage
- <file/API/test impact and reason>

### Required Shrimpy Changes
- <concrete edits needed before upgrading>

### Verification
- <commands run and pass/fail result>

### Upgrade Steps
1. <ordered implementation steps>

### Risks And Unknowns
- <remaining uncertainty>

## Implementation Sequence
<retain this broader sequence when the research note already uses it; keep it consistent with Upgrade Steps rather than letting the two disagree>
```

Use file paths and API names, not vague labels. Preserve checkout provenance, version evidence, commands, pass/fail outcomes, remaining uncertainty, and confidence even when the prose is reorganized to avoid duplicated sections. If no breaking changes are found, say what evidence supports that and still list the verification performed.
