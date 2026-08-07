Generated from AGENTS.md by Shrimpy's build.

# 🦐 Shrimpy

A home agent built on Pi.

If `AGENTS-PRIVATE.md` exists at the project root, read it for workspace- and user-specific context (paths, identifiers, local hosts) that is intentionally not tracked in git.

## Key paths

- **Entry point:** `src/cli.ts`
- **Workspace:** `~/.shrimpy-workspace.json` → `workspace` field (default: `~/.shrimpy`). Config at `workspace/config/shrimpy.json`.
- **Workspace contents:** `context/SYSTEM.md`, `context/USER.md`, `context/WORKSPACE.md`, `config/shrimpy.json`, `config/channels.json`, `agents/<id>/SOUL.md`, `agents/<id>/context/`, `agents/<id>/vault/`, `agents/<id>/watches.json`, `agents/<id>/sessions/`, `agents/<id>/skills/`, `skills/`, `state/pi/auth.json`, `state/pi/models.json`, `state/users.json`, `state/watch-clock.json`, `runtime/cursors/`, `runtime/context/`, `runtime/watches/`, `runtime/logs/`, `channels/`, `media/`
- **Binary:** `~/.local/bin/shrimpy` → `dist/cli.js`
- **Local build caveat:** the local `shrimpy` binary points at this repo's generated `dist/cli.js`, and `dist/` is gitignored. Running `npm run build` or `npm test` rewrites that file and can change the live local CLI behavior even when the source change seems unrelated.
- **Project docs:** `docs/README.md`, `docs/reference/`, `docs/backlog/`, `docs/musings/`, `docs/research/`
- **Upcoming goals:** `docs/backlog/index.md` is the source of truth for planned project work. The small now/soon queue lives directly in `docs/backlog/`; unscheduled directions live in `docs/backlog/proposals/`.

## CLI coverage

Every shrimpy feature should be reachable via a `shrimpy <command>` subcommand. CLI commands are agent-friendly — an agent (including shrimpy itself) can invoke them directly, inspect their output, and compose them with other tools without needing an interactive session. This makes features easier to develop, debug, and automate.

When adding a new feature, expose it as a CLI subcommand first.

## Live workspace safety

When developing in a running Shrimpy workspace, treat the workspace config and state as user data. Be extra cautious around anything that can destroy, overwrite, reset, or migrate a user's Shrimpy config, including `config/`, `agents/`, `state/`, `runtime/`, `channels/`, `media/`, and the workspace pointer. Prefer inspectable CLI changes, preserve existing files by default, and only run destructive cleanup or reset commands when the user explicitly asks for that exact operation.

## Git workflow

This repo uses a three-tier confidence model.

- **Release tags:** safest known states. Use tagged releases when stability matters or when recovering from a bad development state.
- **`main`:** experimental but expected to build and run. Work promoted to `main` should be coherent enough that the local `shrimpy` CLI basically works.
- **`wip`:** freeform working branch for maybe-working states, checkpoint commits, scope drift, experiments, and partial implementation.

Normal development may happen directly on `wip`. Commit freely there. Promote coherent work from `wip` to `main` with cherry-picks, squash commits, or a temporary promotion branch. Avoid merging `wip` wholesale into `main` unless the whole branch state is intentionally ready.

Use feature branches only when they solve a real problem: risky refactors, dependency upgrades, release preparation, long-running experiments, or work that needs to be reviewed or parked separately.

Before landing work on `main`, run the relevant test/build command when practical and note anything skipped.

## Release process

Use GitHub Releases for public versions. Early versions are alpha-quality unless the user explicitly says otherwise.

- Cut releases only from a clean, pushed `main`, never from `wip`.
- Use semantic version tags with a `v` prefix, for example `v0.1.0`.
- Every public release at `0.1.0` or later gets a short lyrical aquatic release name/tagline. Keep it poetic but concrete, and include it in the release title or notes.
- `v0.1.0` release name: **First Light in the Tidepool**.
- For alpha releases, create a GitHub prerelease with `gh release create <tag> --target main --title "<tag> alpha - <release name>" --notes "<summary>" --prerelease`.
- GitHub automatically provides source archives; only attach release assets when there is a deliberate packaged build.

## Architecture guidance

Prefer strengthening boundaries over threading new behavior through whatever code is already nearby.

- Keep modules focused on one job and move code to the right layer instead of growing orchestration blobs.
- If a change crosses multiple layers, extract or name the seam first so the new behavior has a clear home.
- Prefer small composition helpers over large files that both wire systems together and implement policy.
- Default to wrapping Pi cleanly instead of rebuilding runtime concepts above it. Shrimpy should lean on Pi until Pi is the real constraint, then extend it at the specific pressure point rather than speculatively.
- Channels are for routing and logs. Sessions carry instructions.
- Skills are Markdown instruction bundles. Shrimpy adds trails for the visible skills to the agent's context, and Pi can load the selected skill text from those trails. Workflow execution, action choice, and scheduling live in sessions, tools, watches, and CLI commands.
- If the user asks you to perform a workflow normally guided by an included Shrimpy skill, especially setup or update, read and follow its canonical `src/skills/included/<id>/SKILL.md` directly. The user may want the current coding agent to do the work instead of handing it to the mechanic.
- Shrimpy should provide clean guardrails and comms patterns, not hardwire agent decision-making that can live in prompts, skills, or normal session logs.
- Coverage is diagnostic, not a gate. Add tests for major seams, lifecycle behavior, and regressions; do not chase percentages with low-signal tests.

## Writing

Do not hard-wrap prose in Markdown docs, agent instructions, skills, backlog notes, musings, or research notes. Let paragraphs occupy normal long lines so the editor/viewer handles wrapping. Use manual line breaks only when Markdown structure requires them, such as tables, code blocks, lists whose readability depends on separate items, or deliberately formatted examples.

## Legacy support policy

Do not add backward-compatibility or migration code unless explicitly requested by the user.

- **NEVER** add "legacy support" paths by default.
- **NEVER** leave legacy dead code, deprecated command shims, compatibility wrappers, or error-only placeholder modules behind after replacing behavior. Remove the old path entirely.
- Prefer replacing old behavior directly instead of carrying both old and new code paths.

## Philosophy

Keep it shrimple.
