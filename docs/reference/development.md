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
- Repository developer skills: `src/skills/<id>/SKILL.md`. These are
  source-tree skill prompts for Shrimpy development work, separate from the
  workspace and agent skill bundles described in [skills.md](skills.md).
  `npm run build` mirrors them into `.claude/skills/` and `.agents/skills/`
  with `DIRECTORY_MANAGED_BY_SHRIMPY_BUILD` marker files; edit `src/skills/`,
  not the generated mirrors.
- `CLAUDE.md` is generated from `AGENTS.md` by the same build tooling and
  carries a short origin note at the top.

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

Interactive zsh launches automatically install and refresh Shrimpy's cached shell
completion in `~/.zshrc`. Set `SHRIMPY_NO_AUTO_COMPLETION=1` to disable that
bootstrap while developing.

## Releases

- Public versions use semantic version tags with a `v` prefix, for example `v0.1.0`.
- Every public release at `0.1.0` or later gets a short lyrical aquatic release name/tagline. Keep it poetic but concrete, and include it in the release title or notes.
- `v0.1.0` release name: **First Light in the Tidepool**.

## Docs Layout

- `docs/reference/` — current behavior.
- `docs/backlog/` — active engineering items, indexed by `docs/backlog/index.md`.
- `docs/musings/` — design sketches and unfinished thinking.
- `docs/research/` — external comparison and source notes.
