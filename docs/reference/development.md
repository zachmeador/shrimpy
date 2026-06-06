# 🦐 Development

## Repo

- Entry point: `src/cli.ts`
- Gateway entry point: `src/gateway.ts`
- Runtime kernel: `src/app/runtime.ts`
- Workspace paths: `src/app/paths.ts`
- Commands: `src/commands/`, with shared CLI plumbing in `src/commands/framework.ts`
- Config: `src/config/`
- Channels: `src/channels/`
- Sessions/context: `src/sessions/`, `src/context/`
- Agents: `src/agents/`
- Surfaces: `src/surfaces/<name>/` per-surface verticals; `src/surfaces/shared/` for the `ChatSurfaceModule` contract and shared chat primitives
- Watch clock: `src/watches/`
- Tools: `src/tools/`
- Setup templates: `src/setup/templates/`
- Repository developer skills: `src/skills/<id>/SKILL.md`. These are source-tree skill prompts for Shrimpy development work, separate from the workspace and agent skill bundles described in [skills.md](skills.md). `npm run build` mirrors them into `.claude/skills/` and `.agents/skills/` with `DIRECTORY_MANAGED_BY_SHRIMPY_BUILD` marker files; edit `src/skills/`, not the generated mirrors.
- `CLAUDE.md` is generated from `AGENTS.md` by the same build tooling and carries a short origin note at the top.

## Commands

```bash
npm run build
npm run build:skills
npm test
```

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

`npm run dev:setup` rebuilds, resets an isolated `/tmp` home/workspace pair, writes a temporary `.shrimpy-workspace.json`, and runs `shrimpy setup`. It is fresh by default so edits under `src/setup/templates/` are copied into the test workspace each run. Use `npm run dev:setup -- --reuse --no-build` to rerun against the same temp workspace, or `npm run dev:setup -- --name tui` to keep a separate named sandbox.

To skip repeated provider login/model selection while testing the setup skill, run `npm run dev:setup:tui`. It is the one-command loop for setup walkthrough work: rebuild, create a fresh temp sandbox, copy `state/pi/auth.json` and `state/pi/models.json` from the workspace selected by your real `~/.shrimpy-workspace.json`, then open the setup TUI. The lower-level equivalent is `npm run dev:setup -- --copy-pi-state`. Use `npm run dev:setup:clean` when done because the sandbox may contain credentials.

Interactive zsh launches automatically install and refresh Shrimpy's cached shell completion in `~/.zshrc`. Set `SHRIMPY_NO_AUTO_COMPLETION=1` to disable that setup step while developing.

## Releases

- Use the `shrimpy-dev-release` source skill for release prep and cutting workflow.
- Confirm the working tree is clean and `main` is pushed before cutting a release.
- Public versions use semantic version tags with a `v` prefix, for example `v0.1.0`.
- Every public release at `0.1.0` or later gets a short lyrical aquatic release name/tagline. Keep it poetic but concrete, and include it in the release title or notes.
- `v0.1.0` release name: **First Light in the Tidepool**.
- For alpha releases, use GitHub prereleases:

```bash
gh release create <tag> --target main --title "<tag> alpha - <release name>" --notes "<summary>" --prerelease
```

- GitHub automatically provides source archives; attach release assets only when there is a deliberate packaged build.

## Docs Layout

- `docs/reference/` — current behavior.
- `docs/backlog/` — active engineering items, indexed by `docs/backlog/index.md`.
- `docs/musings/` — design sketches and unfinished thinking.
- `docs/research/` — external comparison and source notes.
