# 🦐 shrimpy 🦐

<p align="center">
  <img src="docs/assets/shrimpy-logo-horizontal.png" alt="Shrimpy logo" width="420">
</p>

Shrimpy gives agents a home on disk, and the system is designed to stay small. Agents are durable residents of one workspace: identity, memory, skills, saved work, sessions, and schedules all live as normal files. A job-search helper, a fitness tracker, a story character, or a maintenance agent can keep its own history instead of starting over as another disposable chat.

Shrimpy is small-model friendly by design: few primitives, compact context, normal files, and CLI commands a model can inspect directly. Useful behavior should come from composing those pieces before it becomes another core feature.

The primitives are plain. Channels are shared rooms and logs. Sessions are private working contexts for an agent's turns, tool use, and transcript. Watches run scheduled prompts or command checks, then route anything worth attention through channels. Skills are Markdown instructions. [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) handles model calls, tools, and session runtime; Shrimpy adds the workspace around it so agents can talk, run background work, and leave evidence you can inspect.

> *keep it shrimple* 🦐

## 🦐 Docs

- [Getting started](docs/getting-started.md) — a friendly first setup for curious newcomers.
- [Overview](docs/reference/overview.md) — what Shrimpy is and how it's shaped.
- [Setup](docs/reference/setup.md) — install and run.
- [Security](SECURITY.md) — trust assumptions and operating risks.
- [CLI](docs/reference/cli.md) — the command surface.
- [Full docs map](docs/README.md) — everything else.

## 🦐 What an agent is

An agent is a folder on disk:

- **`SOUL.md`** — who it is and how it behaves.
- **`context/`** — what it knows: its domain and your situation.
- **`skills/`** — what it can do, written as Markdown.
- **`vault/`, `projects/`** — what it keeps: durable notes and work.
- **`sessions/`, `watches.json`** — its history and its schedules.

It's just files, so you fill them in however you like.

## 🦐 Setup

Install the current `main` build on Linux or macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
```

Open a new terminal, then run:

```bash
shrimpy setup
```

Requires Git, Node `>=22.19.0`, and `npm`. Installs under `~/.local/share/shrimpy/app` and links `shrimpy`, `shrimpy-gateway`, and `shrimpy-web` into `~/.local/bin`.

Setup builds or repairs the workspace and guides model access through the available local, API-key, or subscription options. Then talk to your first agent:

```bash
shrimpy chat shrimpy
```

Pin a specific tag, branch, or commit:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | env SHRIMPY_REF=<ref> bash
```

See [docs/reference/setup.md](docs/reference/setup.md) for the full checklist and the gateway service lifecycle.

## 🦐 Usage

```bash
shrimpy                          # resume the most recent terminal-chat agent
shrimpy chat [agent]             # chat with the default or a named agent
shrimpy run --agent <id> "..."   # one-shot; add --session <id> for durable history
shrimpy status                   # workspace, gateway, channel, and watch status
shrimpy skills ...               # add and manage skills
shrimpy watches                  # list and add watches
shrimpy channels read <name>     # read a channel log
shrimpy workspace search "..."   # search context, skills, notes, and vaults
shrimpy update                   # update Shrimpy
shrimpy-gateway                  # run the gateway (delivery, schedules, surfaces)
shrimpy-web                      # run the read-only workspace inspector directly
```

`shrimpy --help` shows the common surface; `shrimpy help all` the full catalog. The gateway is meant to run as a per-user service — install it with `shrimpy gateway install` and `start`, and read logs with `shrimpy gateway logs`. The gateway starts the read-only web inspector at `http://127.0.0.1:5174` by default.

## 🦐 Status

Alpha — expect rough edges. Release history is in [CHANGELOG.md](CHANGELOG.md). MIT licensed ([LICENSE](LICENSE)); contributions welcome ([CONTRIBUTING.md](CONTRIBUTING.md)).
