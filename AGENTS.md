# 🦐 Shrimpy

A home agent built on Pi.

If `AGENTS-PRIVATE.md` exists at the project root, read it for workspace- and user-specific context (paths, identifiers, local hosts) that is intentionally not tracked in git.

## Key paths

- **Entry point:** `src/cli.ts`
- **Workspace:** `~/.shrimpy-workspace.json` → `workspace` field (default: `projectRoot/.shrimpy`). Config at `workspace/config/shrimpy.json`.
- **Workspace contents:** `profile/WORKSPACE.md`, `profile/SYSTEM.md`, `profile/USER.md`, `config/shrimpy.json`, `config/channels.json`, `config/schedules.json`, `agents/<id>/SOUL.md`, `agents/<id>/context/`, `agents/<id>/vault/`, `agents/<id>/schedules.json`, `agents/<id>/sessions/`, `agents/<id>/skills/`, `skills/`, `state/pi/auth.json`, `state/pi/models.json`, `state/users.json`, `state/scheduler.json`, `runtime/cursors/`, `runtime/briefings/`, `runtime/logs/`, `channels/`, `media/`
- **Binary:** `~/.local/bin/shrimpy` → `dist/cli.js`
- **Project docs:** `docs/README.md`, `docs/reference/`, `docs/backlog/`, `docs/tracking/`, `docs/musings/`, `docs/research/`
- **Upcoming goals:** `docs/backlog/index.md` is the source of truth for planned project work. Each active item has its own note in `docs/backlog/`.

## CLI coverage

Every shrimpy feature should be reachable via a `shrimpy <command>` subcommand. CLI commands are agent-friendly — an agent (including shrimpy itself) can invoke them directly, inspect their output, and compose them with other tools without needing an interactive session. This makes features easier to develop, debug, and automate.

When adding a new feature, expose it as a CLI subcommand first.

## Architecture guidance

Prefer strengthening boundaries over threading new behavior through whatever code is already nearby.

- Keep modules focused on one job and move code to the right layer instead of growing orchestration blobs.
- If a change crosses multiple layers, extract or name the seam first so the new behavior has a clear home.
- Prefer small composition helpers over large files that both wire systems together and implement policy.
- Default to wrapping Pi cleanly instead of rebuilding runtime concepts above it. Shrimpy should lean on Pi until Pi is the real constraint, then extend it at the specific pressure point rather than speculatively.
- Channels are for routing and logs. Sessions carry instructions.
- Skills are Pi-style capability bundles under workspace or agent skill directories. Treat them as prompts/resources for sessions, not a second control plane.
- Shrimpy should provide clean guardrails and comms patterns, not hardwire agent decision-making that can live in prompts, skills, or normal session logs.
- Coverage is diagnostic, not a gate. Add tests for major seams, lifecycle behavior, and regressions; do not chase percentages with low-signal tests.

## Legacy support policy

Do not add backward-compatibility or migration code unless explicitly requested by the user.

- **NEVER** add "legacy support" paths by default.
- **NEVER** leave legacy dead code, deprecated command shims, compatibility wrappers, or error-only placeholder modules behind after replacing behavior. Remove the old path entirely.
- Prefer replacing old behavior directly instead of carrying both old and new code paths.
