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
- Scheduler: `src/scheduler/`
- Tools: `src/tools/`
- Setup templates: `src/setup/templates/`

## Commands

```bash
npm run build
npm test
```

Local checks:

```bash
node dist/cli.js --help
node dist/cli.js context --config
node dist/cli.js gateway logs --path
```

## Docs Layout

- `docs/reference/` — current behavior.
- `docs/backlog/` — active engineering items, indexed by `docs/backlog/index.md`.
- `docs/musings/` — design sketches and unfinished thinking.
- `docs/research/` — external comparison and source notes.
