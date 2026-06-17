# 🦐 shrimpy 🦐

<p align="center">
  <img src="docs/assets/shrimpy-logo-horizontal.png" alt="Shrimpy logo" width="420">
</p>

Shrimpy is a home agent built on [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent): a personal workspace runtime with persistent agents, shared memory, local tools, background work, and multiple chat surfaces.

Latest tagged release: **0.5.0 - The Reef Remembers**.

> *keep it shrimple* 🦐

## 🦐 Read First

- [docs/README.md](docs/README.md) — docs map.
- [docs/reference/overview.md](docs/reference/overview.md) — short orientation and current shape.
- [docs/reference/setup.md](docs/reference/setup.md) — install, setup, and gateway service lifecycle.
- [docs/reference/cli.md](docs/reference/cli.md) — command surface.
- [docs/reference/architecture.md](docs/reference/architecture.md) — primitives, boundaries, and source ownership.
- [docs/reference/runtime.md](docs/reference/runtime.md) — direct runs, gateway dispatch, watches, and worker delegation.
- [docs/reference/channels.md](docs/reference/channels.md) — channel protocol, membership, addressing, policy, and egress.
- [docs/reference/sessions.md](docs/reference/sessions.md) — session files, lifecycle, model metadata, and inspection.
- [docs/reference/workspace.md](docs/reference/workspace.md) — workspace layout, prompt resources, state, and logs.
- [docs/reference/configuration.md](docs/reference/configuration.md) — config files and day-to-day knobs.
- [docs/backlog/index.md](docs/backlog/index.md) — active project work.
- [CHANGELOG.md](CHANGELOG.md) — release history and unreleased changes.

## 🦐 Setup

Install the current `main` build on Linux or macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
~/.local/bin/shrimpy setup
```

The installer requires Git, Node `>=22.19.0`, and `npm`. It installs Shrimpy under `~/.local/share/shrimpy/app` and links `shrimpy`, `shrimpy-gateway`, and `shrimpy-web` into `~/.local/bin`.

To install a specific tag, branch, or commit:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | env SHRIMPY_REF=v0.5.0 bash
```

For source checkout development:

```bash
npm install
npm run build
npm link
shrimpy setup
```

Setup creates or repairs the workspace, checks model access, writes path breadcrumbs into `profile/WORKSPACE.md`, and opens the mechanic setup flow. See [docs/reference/setup.md](docs/reference/setup.md) for the full setup checklist and service behavior.

Shell completion is generated from the same CLI catalog as help:

```bash
shrimpy completion bash
shrimpy completion zsh
shrimpy completion install zsh
```

## 🦐 Usage

```bash
shrimpy                                      # launch interactive mode
shrimpy chat                                 # launch chat with the default agent
shrimpy chat career                          # launch chat with a specific agent
shrimpy mechanic                             # launch the maintenance agent
shrimpy "list files"                         # launch with an initial prompt
shrimpy run --agent mechanic "summarize status"  # one-shot prompt, print result, exit
shrimpy status                               # inspect workspace and gateway status
shrimpy workspace search "model policy"      # search profile, skills, context, and vault notes
shrimpy channels read home                   # read recent channel messages
shrimpy watches                              # inspect agent-owned watches
shrimpy worker list                          # inspect coding worker records
shrimpy-gateway                              # run surfaces, channel dispatch, and watches
shrimpy-web                                  # run the web inspector
```

Run `shrimpy --help` for the common surface and `shrimpy help all` for the complete catalog.

## 🦐 Config

Shrimpy resolves the workspace path from `~/.shrimpy/.shrimpy-workspace.json`, then `~/.shrimpy-workspace.json`; both pointer files use a `workspace` field. When no pointer exists, Shrimpy uses `~/.shrimpy/`.

Runtime config lives at `workspace/config/shrimpy.json`. Channel membership lives at `workspace/config/channels.json`. See [docs/reference/configuration.md](docs/reference/configuration.md) for the current config shape.

## 🦐 Workspace

The workspace directory holds prompt resources, agent files, config, and runtime state:

```text
profile/        shared WORKSPACE.md, SYSTEM.md, and USER.md prompt resources
config/         runtime config and channel membership
agents/         per-agent SOUL.md, context, vault, projects, watches, skills, and sessions
skills/         workspace-level shared skills
channels/       append-only JSONL channel logs
media/          downloaded media
state/          durable state: Pi auth/models, users, presence, workers, and watch clock
runtime/        disposable state: cursors, turn context, watches, workers, pids, logs, and search cache
```

Each agent root under `agents/<id>/` owns its identity, memory, saved files, project work, watches, skills, and Pi session transcripts. See [docs/reference/workspace.md](docs/reference/workspace.md) for the full workspace map.

## 🦐 Architecture

See [docs/reference/architecture.md](docs/reference/architecture.md), [docs/reference/overview.md](docs/reference/overview.md), and [docs/reference/runtime.md](docs/reference/runtime.md) for the stable architecture notes. Key concepts:

- **AppRuntime** — resolves workspace paths, config, surfaces, tool config, context config, and session bootstrap inputs.
- **Profile resources** — workspace-level prompt resources under `profile/`.
- **Agents** — persistent actors with `SOUL.md`, memory, tools, skills, watches, sessions, vaults, and projects.
- **Channels** — append-only JSONL logs for routing and history.
- **ChannelBus** — facade for typed channel IO, membership-aware reads, and optional outbound egress.
- **Channel outbox** — gateway loop that delivers bound channel messages to surfaces and records receipts.
- **Sessions** — Pi sessions persisted per agent and per channel or local session label.
- **SessionRegistry** — per-session FIFO turn control for gateway channel sessions.
- **Surfaces** — transport adapters such as Telegram, organized as self-contained verticals.
- **Gateway** — long-running process for surfaces, channel dispatch, watches, and workspace checkpoint ticks.
- **Watches** — agent-owned background rules that post channel messages or run commands on a schedule.
- **Workers** — detached coding worker records and artifacts managed through `shrimpy worker ...`.
- **Skills** — Markdown instruction bundles advertised to Pi as Shrimpy-selected context trails.

## 🦐 Structure

```text
src/
  app/                    AppRuntime, metadata, workspace paths, project-root helpers
  cli.ts                  CLI dispatcher and interactive mode entry
  gateway.ts              gateway entry point
  gateway/                service controls, runtime helpers, delivery loop, logs, pid/state helpers
  commands/               non-interactive CLI subcommands and command catalog
  config/                 config loading, validation, and schema resolution
  agents/                 agent config, workspace files, channel policy, and lifecycle helpers
  channels/               JSONL store, typed protocol, bus, manifests, membership, outbox, egress
  context/                context source resolution, prompt sections, and turn-context rendering
  sessions/               session specs, bootstrap, factory, registry, storage, search, compaction
  inference/              model parameter and thinking helpers
  search/                 workspace search indexing and scoring
  skills/                 source-default skills, package state, package sources, project sync
  surfaces/               per-surface verticals plus shared chat-surface primitives
  tools/                  Shrimpy daemon tools and tool policy/factory wiring
  tui/                    Shrimpy TUI extensions and renderers
  watches/                watch schema, clock, runner, inspection, actions, and run stores
  workers/                detached worker records, availability, runner, and supervisor helpers
  workspace-checkpoints/  opt-in local workspace checkpoint tracking
  setup/                  setup/onboarding flow and workspace templates
  web/                    web inspector server and workspace file/tree APIs
  util/                   shared parsing, JSON, style, channel-pattern, and time helpers
web/                      Svelte web inspector client
extensions/               Pi extensions loaded by Shrimpy
themes/                   Shrimpy theme definitions
skills/                   Shrimpy development skills mirrored by the build
test/                     node:test coverage
docs/                     stable docs, backlog, research notes, and musings
```
