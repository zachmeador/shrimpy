# 🦐 shrimpy 🦐

<p align="center">
  <img src="docs/assets/shrimpy-logo-horizontal.png" alt="Shrimpy logo" width="420">
</p>

Shrimpy is a home agent* built on [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent).

*Home agent:* an OpenClaw-like personal workspace runtime: multiple persisting agents reachable through multiple surfaces, with shared memory, local tools, and background work.

Current release: **0.4.0 - Tides Pull Both Ways**.

> *keep it shrimple* 🦐

## 🦐 Read first

- [docs/README.md](docs/README.md) — the docs map.
- [docs/reference/overview.md](docs/reference/overview.md) — core model and invariants.
- [docs/reference/design.md](docs/reference/design.md) — philosophy, settled decisions, and active reconsiderations.
- [docs/reference/setup.md](docs/reference/setup.md) — install and gateway service lifecycle.
- [docs/reference/runtime.md](docs/reference/runtime.md) — CLI, gateway, sessions, adapters, watches, and child runs.
- [docs/reference/memory.md](docs/reference/memory.md) — memory model, upkeep, and continuity aspiration.
- [docs/reference/configuration.md](docs/reference/configuration.md) — workspace config files and day-to-day knobs.
- [docs/reference/workspace.md](docs/reference/workspace.md) — workspace layout and agent resources.
- [docs/backlog/index.md](docs/backlog/index.md) — active project work.

## 🦐 Setup

Install the current `main` build on Linux or macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
shrimpy setup init
```

The installer requires Node `>=22.19.0` and `npm`. It installs Shrimpy under `~/.local/share/shrimpy/app` and links `shrimpy`, `shrimpy-gateway`, and `shrimpy-web` into `~/.local/bin`; add that directory to `PATH` if needed.

To install a specific tag, branch, or commit:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | env SHRIMPY_REF=v0.4.0 bash
```

For source checkout development:

```bash
npm install
npm run build
npm link
shrimpy setup init
```

The installer only installs the CLI. Workspace creation and configuration stay explicit through `shrimpy setup init`.

See [docs/reference/setup.md](docs/reference/setup.md) for macOS gateway behavior and the full setup checklist.

For zsh users, the installer and interactive launches automatically install and refresh cached shell completion. Completion scripts are generated from the same CLI metadata as `shrimpy --help`:

```bash
shrimpy completion bash
shrimpy completion zsh
shrimpy completion install zsh
```

## 🦐 Usage

```bash
shrimpy                         # launch interactive mode
shrimpy chat                    # launch chat with the default agent
shrimpy chat career             # launch chat with a specific agent
shrimpy "list files"            # launch with an initial prompt
shrimpy run "summarize status"  # one-shot prompt, print result, exit
shrimpy status                  # inspect workspace and gateway status
shrimpy channels read home      # read recent channel messages
shrimpy-gateway                 # run adapters, channel watcher, and watches
shrimpy-web                     # run the web inspector
```

## 🦐 Config

Config lives at `workspace/config/shrimpy.json`. The workspace path is set in `~/.shrimpy-workspace.json`; when unset, Shrimpy uses `~/.shrimpy/`.

See [docs/reference/configuration.md](docs/reference/configuration.md) for the current config shape.

## 🦐 Workspace

The workspace directory holds runtime state:

```text
config/          JSON config files
docs/framework/ shared framework prompt resources
agents/          per-agent resources, skills, memory, and sessions
channels/        append-only JSONL message logs
media/           downloaded media
runtime/logs/    gateway logs
state/           watch clock state, provider auth, and model registry
```

See [docs/reference/workspace.md](docs/reference/workspace.md) for the full workspace map.

## 🦐 Architecture

See [docs/reference/design.md](docs/reference/design.md), [docs/reference/overview.md](docs/reference/overview.md), and [docs/reference/runtime.md](docs/reference/runtime.md) for the stable architecture notes. Key concepts:

- **AppRuntime** — resolves workspace paths, config, adapter routing, tool config, and session bootstrap inputs once so entrypoints stay thin.
- **Channels** — append-only JSONL logs for routing and history.
- **ChannelBus** — the single API for typed channel message IO and optional outbound adapter delivery.
- **Sessions** — Pi sessions persisted per agent and per channel.
- **SessionRegistry** — per-session FIFO turn control.
- **Adapters** — thin transport translators; Telegram is the main one today.
- **Watches** — agent-owned background rules that post channel messages or run commands on a schedule.

## 🦐 Structure

```text
src/
  app/                    AppRuntime, workspace paths, project-root helpers
  cli.ts                  CLI dispatcher and interactive mode entry
  gateway.ts              Gateway entry point
  gateway-ctl.ts          platform service controls for the gateway
  commands/               Non-interactive CLI subcommands
  config/                 Config loading and schema resolution
  channels/               JSONL pub/sub primitives and typed channel protocol
  context/                Context spec resolution and prompt rendering
  sessions/               Session specs, bootstrap, factory, and registry
  delivery/               Channel dispatch and fallback reply delivery
  watches/                Watch schema, clock, runner, inspection, and state stores
  tools/                  Custom tools and shared tool wiring
  surfaces/               Per-surface verticals (each <name>/ owns client,
                          bridge, outbound, commands, config, lifecycle);
                          shared/ holds chat-bridge primitives and the
                          ChatSurfaceModule contract
web/                      Svelte web inspector
extensions/               Pi extensions loaded by Shrimpy
themes/                   Shrimpy theme definitions
test/                     node:test coverage
docs/                     Stable docs, research notes, and musings
```
