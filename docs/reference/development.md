# 🦐 Development

## Repo

- Entry point: `src/cli.ts`
- Gateway entry point: `src/gateway.ts`
- Runtime kernel: `src/app/runtime.ts`
- Workspace paths: `src/workspace/paths.ts`
- Commands: `src/commands/`, with shared CLI plumbing in `src/commands/framework.ts`
- Config: `src/config/`
- Channels: `src/channels/`
- Sessions/context: `src/sessions/`, `src/context/`
- Agents: `src/agents/`
- Surfaces: `src/surfaces/<name>/` per-surface verticals; `src/surfaces/shared/` for the `ChatSurfaceModule` contract and shared chat primitives
- Watch clock: `src/watches/`
- Tools: `src/tools/`
- Setup templates: `src/setup/templates/`
- Web inspector: `web/` owns the Svelte client, file-backed server, workspace readers, live invalidation, and shared private transport types. Shrimpy core only owns `src/config/web.ts` and `src/gateway/web-sidecar.ts` for configuration and process lifecycle.
- Repository developer skills: repository-root `skills/<id>/SKILL.md`. These are source-tree skill prompts for Shrimpy development work, separate from the workspace and agent skills described in [skills.md](skills.md). `npm run build` mirrors them into `.claude/skills/` and `.agents/skills/` with `DIRECTORY_MANAGED_BY_SHRIMPY_BUILD` marker files; edit `skills/`, not the generated mirrors.
- `CLAUDE.md` is generated from `AGENTS.md` by the same build tooling and carries a short origin note at the top.

## Commands

From a source checkout, install dependencies, build, and link the commands:

```bash
npm install
npm run build
npm link
```

Build and test commands:

```bash
npm run build
npm run build:skills
npm run build:web
npm test
```

Use `npm run web:dev` for the split Vite/client and file-backed server development loop. The inspector reads the selected Shrimpy workspace directly, stays read-only, and updates through filesystem invalidations; when a workspace format changes, update readers under `web/server/` rather than adding web-specific output to Shrimpy core.

Local checks:

```bash
node dist/cli.js --help
node dist/cli.js context --config
node dist/cli.js gateway logs --path
```

Setup walkthrough loop:

```bash
npm run dev:setup:tui
npm run dev:setup
npm run dev:setup:init
npm run dev:setup:status
npm run dev:setup:shell
npm run dev:setup:clean
```

`npm run dev:setup` rebuilds, resets an isolated `/tmp` home/workspace pair, sets `SHRIMPY_WORKSPACE` to the temp workspace, and runs `shrimpy setup`. The isolated `HOME` keeps shell/provider side effects out of the real home directory; workspace selection does not depend on a temporary pointer file. It is fresh by default so edits under `src/setup/templates/` are copied into the test workspace each run. Use `npm run dev:setup -- --reuse --no-build` to rerun against the same temp workspace, or `npm run dev:setup -- --name tui` to keep a separate named sandbox.

To skip repeated provider login/model selection while testing the setup skill, run `npm run dev:setup:tui`. It is the one-command loop for setup walkthrough work: rebuild, create a fresh temp sandbox, copy `state/pi/auth.json`, `state/pi/models.json`, and `state/pi/models-store.json` when present from the workspace selected by normal workspace resolution in the current shell, then open the setup TUI. The lower-level equivalent is `npm run dev:setup -- --copy-pi-state`. Use `npm run dev:setup:clean` when done because the sandbox may contain credentials.

Interactive zsh launches automatically install and refresh Shrimpy's cached shell completion in `~/.zshrc`. Set `SHRIMPY_NO_AUTO_COMPLETION=1` to disable that setup step while developing.

## Releases

The release process — version tags, GitHub prereleases, release names — lives in `AGENTS.md` and the `shrimpy-dev-release` source skill.

## Docs Layout

- `docs/reference/` — current behavior.
- `docs/backlog/` — the now/soon engineering queue plus unscheduled `proposals/`, indexed by `docs/backlog/index.md`.
- `docs/musings/` — design sketches and unfinished thinking.
- `docs/research/` — external comparison and source notes.
