# 🦐 CLI

Use `shrimpy --help` for common commands, `shrimpy help all` for the full catalog, and help at any command level for exact options. Help and shell completion share the catalog in `src/commands/catalog.ts`.

## Sessions And Models

| Command family | Use it for | Reference |
|---|---|---|
| `shrimpy`, `shrimpy chat` | Resume terminal chat or select an agent. | [Sessions](sessions.md) |
| `shrimpy run` | Run one prompt; pass `--session` for durable history. | [Sessions](sessions.md) |
| `shrimpy sessions` | Inspect, search, read, reset, restore, or control sessions. | [Sessions](sessions.md) |
| `shrimpy models` | Inspect providers, model policies, and effective model selection. | [Configuration](configuration.md#models) |

```bash
shrimpy chat shrimpy
shrimpy run --help
shrimpy sessions search "deployment notes" --agent shrimpy
shrimpy models resolve --agent shrimpy --session local/main
```

## Workspace And Runtime

| Command family | Use it for | Reference |
|---|---|---|
| `shrimpy setup`, `shrimpy update` | Set up or update the installation and workspace. | [Setup](setup.md) |
| `shrimpy status` | Inspect setup, workspace, and gateway health. | [Runtime](runtime.md#observability) |
| `shrimpy workspace` | Search saved knowledge, inspect its index, and manage checkpoints. | [Workspace](workspace.md) |
| `shrimpy context` | Inspect model-facing context, sources, and live producers. | [Context](context-assembly.md#inspection) |
| `shrimpy watches` | Create, inspect, and control recurring work. | [Runtime](runtime.md#background-work), [configuration](configuration.md#watches-and-status) |
| `shrimpy worker` | Start, inspect, amend, cancel, or close detached coding work. | [Runtime](runtime.md#background-work) |

## Channels And Surfaces

| Command family | Use it for | Reference |
|---|---|---|
| `shrimpy channels` | Read logs, inspect wake/delivery evidence, manage membership and transport bindings. | [Channels](channels.md) |
| `shrimpy surface` | Inspect and change a transport thread's addressed agent. | [Surfaces](surfaces.md) |

```bash
shrimpy channels show home
shrimpy channels read --help
shrimpy agent channel-policy explain --help
```

## Agents, Skills, Users

| Command family | Use it for | Reference |
|---|---|---|
| `shrimpy agent` | Create or configure agents, inspect capabilities, and manage wake policy. | [Configuration](configuration.md#agents), [tools](tools.md) |
| `shrimpy skills` | Inspect, author, install, update, remove, and validate skills. | [Skills](skills.md) |
| `shrimpy users` | Manage stable human identities, the workspace owner, and last-active destinations. | [Configuration](configuration.md#channels-surfaces-and-users) |

## Gateway And Plumbing

Use `shrimpy gateway` for service lifecycle, health, and logs; see [setup.md](setup.md#gateway). `shrimpy-gateway` and `shrimpy-web` run their respective processes directly. `shrimpy completion` manages shell completion.

## Conventions

Use `--json` when supported for structured output. Global `--workspace` goes before the subcommand; see [configuration.md](configuration.md#files).

Resource names are singular `agent` and `surface`, and plural `channels`, `sessions`, `watches`, `skills`, `models`, and `users`. When extending the CLI, use resource-owned verbs such as `list`, `show`, `read`, `add`, `set`, `remove`, `tail`, `run`, and `status`. Shared command plumbing lives in `src/commands/framework.ts`.
