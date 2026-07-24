# 🦐 CLI

Every Shrimpy feature is reachable through a `shrimpy <command>` subcommand. Commands print inspectable output and compose with other tools; `--json` is for scripts and structured consumers. This doc is the command index — behavior lives in each owning doc, and full flag detail lives in `--help`.

`shrimpy --help` shows the common surface; `shrimpy help all` prints the complete catalog. Help at every level (`shrimpy channels --help`, `shrimpy channels read --help`) and shell completion are generated from one catalog in `src/commands/catalog.ts`.

## Sessions And Models

See [sessions.md](sessions.md) for session ids, lifecycle, and ownership.

| Command | Purpose |
| --- | --- |
| `shrimpy` | Open the TUI, resuming the most recent terminal-chat agent; runs setup onboarding when needed. |
| `shrimpy "prompt"` | Open the first configured agent's TUI with an initial prompt. |
| `shrimpy chat [agent]` | Open a TUI chat with the default or selected agent. |
| `shrimpy run "prompt" [--session <id>]` | Run a one-shot prompt; in-memory unless `--session` resumes durable state. |
| `shrimpy agent tui <id> [prompt]` | Open a TUI session as a specific agent. |
| `shrimpy agent run <id> "prompt"` | Run a one-shot prompt as a specific agent. |
| `shrimpy sessions list [session-id] [--agent <id>\|--all-agents]` | Inspect manifested sessions, or the cross-agent interactive-session inventory. |
| `shrimpy sessions new <session-id>` | Archive/reset a session. |
| `shrimpy sessions clear <session-id>` | Archive a session's active transcript. |
| `shrimpy sessions restore <session-id> [--archive <name>]` | Restore an archived session. |
| `shrimpy sessions set <session-id> [--thinking <level>] [--model <p/m>\|--model-policy <name>]` | Change a running session's model or reasoning effort. |
| `shrimpy sessions stop <session-id>` | Stop a running gateway turn. |
| `shrimpy sessions search <query> [--agent <id>\|--all-agents] [--channel <name>]` | Search active and archived transcripts. |
| `shrimpy sessions read <session> --around <entry> [--window N]` | Read a transcript window around one entry. |
| `shrimpy sessions compaction <session-id>` | Inspect effective compaction policy. See [compaction.md](compaction.md). |
| `shrimpy models` | Inspect model policies, agent defaults, and Pi-visible models. |
| `shrimpy models resolve [--agent <id>] [--session <id>\|--channel <name>]` | Explain model precedence for a session or channel. |
| `shrimpy models policies [list\|show\|set\|add-candidate\|remove-candidate\|move-candidate]` | Manage model policy candidates. |
| `shrimpy models providers add-openai-compatible` | Add an OpenAI-compatible provider to Pi's model registry. |

TUI and run commands accept `--provider`, `--model`, `--model-policy`, `--thinking`, and `--skill` where supported.

## Workspace And Runtime

| Command | Purpose |
| --- | --- |
| `shrimpy setup` | Run first-run setup onboarding. |
| `shrimpy setup telegram` | Guided Telegram config. |
| `shrimpy status` | Show workspace, gateway, channels, watch-run, and surface status. |
| `shrimpy update [--dry-run]` | Preflight a safe Shrimpy environment update. |
| `shrimpy workspace track init\|status\|checkpoint` | Opt-in workspace git checkpoint tracking. |
| `shrimpy workspace search <query>` | Search workspace context, skills, and vault Markdown. |
| `shrimpy workspace index status\|rebuild` | Inspect or rebuild the workspace search cache. |
| `shrimpy watches [--agent <id>]` | Inspect configured watches, next runs, and recent history. |
| `shrimpy watches add <id> --agent <id> (--cron <expr>\|--every <dur>) ...` | Add an agent-owned time watch (message or command action). |
| `shrimpy watches show\|history\|enable\|disable\|run <agent-id>/<watch-id>` | Inspect or control one watch. |
| `shrimpy worker start [--backend <pi\|codex\|claude>] <spec>` | Start a detached coding worker turn. |
| `shrimpy worker list\|status\|read\|tail\|wait <id>` | Inspect coding workers. |
| `shrimpy worker send <id> <prompt>` | Send a contract amendment to an open worker. |
| `shrimpy worker cancel\|close <id>` | Cancel or close a worker, terminating its process group if needed. |
| `shrimpy worker backends [--refresh]` | Inspect worker backend availability. |
| `shrimpy context [--sections] [--turn] [--config]` | Inspect model-facing context. See [context-assembly.md](context-assembly.md). |
| `shrimpy context turn --channel <name>` | Render only turn context for a channel/session. |
| `shrimpy context files list\|show [--agent <id>]` | List or print agent context Markdown files. |
| `shrimpy context sources list\|run [--agent <id>] [--channel <name>]` | Inspect or render configured context sources. |

## Channels And Surfaces

See [channels.md](channels.md) for the protocol, membership, addressing, and egress behavior behind these commands.

| Command | Purpose |
| --- | --- |
| `shrimpy channels` | List channels. |
| `shrimpy channels show <name>` | Inspect one channel: binding, receipts, membership, activity. |
| `shrimpy channels read <name> [--limit N] [--full]` | Read recent messages; `--full` prints complete bodies. |
| `shrimpy channels search <name> [query] [--kind <k>] [--sender <k>] ...` | Search and filter channel messages. |
| `shrimpy channels tail <name>` | Watch a channel log. |
| `shrimpy channels create <name>` | Create or initialize channel membership. |
| `shrimpy channels post <name> [--agent <id>] <text>` | Post a CLI human message, optionally addressed to one agent. |
| `shrimpy channels dm <a> <b>` | Create a deterministic agent DM channel. |
| `shrimpy channels members\|join\|leave <name>` | Show or edit channel membership. |
| `shrimpy channels bind <name> <adapter>/<instance>/<thread>` | Bind a channel to an outbound transport. |
| `shrimpy channels unbind <name>` | Remove a transport binding. |
| `shrimpy surface` | List surface thread state. |
| `shrimpy surface show <surface> <thread-id>` | Show one surface thread state entry. |
| `shrimpy surface set-agent\|clear-agent <surface> <thread-id> [agent]` | Set or clear the addressed agent for a surface thread. |
| `shrimpy surface activity <channel> [--kind typing]` | Trigger a short surface activity signal for manual checks. |

## Agents, Skills, Users

| Command | Purpose |
| --- | --- |
| `shrimpy agent list` | List configured agents. |
| `shrimpy agent show <id>` | Show resolved agent config and paths. |
| `shrimpy agent inspect <id>` | Show the effective tool capability view. See [tools.md](tools.md). |
| `shrimpy agent add <id>` | Add an agent and scaffold its root. |
| `shrimpy agent set <id>` | Update root, cwd, model policy, tools, thinking, or channel policy mode. |
| `shrimpy agent channel-policy <id> [--channel <name>]` | Inspect effective channel policy. |
| `shrimpy agent channel-policy set\|clear <id> [--channel <pattern>] ...` | Edit policy fields without rewriting the rest. |
| `shrimpy agent channel-policy explain <id> --channel <name> --sender <kind> --text <text>` | Explain whether a sample message would become a turn. |
| `shrimpy agent rename <old> <new>` | Rename an agent and update local state. |
| `shrimpy agent remove <id>` | Remove an agent from config/state. |
| `shrimpy skills list [--agent <id>]` | List the effective Pi-loaded skill view. |
| `shrimpy skills show <id>` | Print a skill's `SKILL.md`. |
| `shrimpy skills add <source> [--agent <id>\|--workspace]` | Install a skill package from included, local, URL, or GitHub sources. |
| `shrimpy skills update\|remove <id> [--agent <id>\|--workspace]` | Update or remove a managed skill package. |
| `shrimpy skills new <id> [--agent <id>\|--workspace]` | Scaffold a local skill. |
| `shrimpy skills validate [id]` | Validate skill frontmatter, layout, shadowing, and tool compatibility. |
| `shrimpy users list` | List identity links and the resolved owner. |
| `shrimpy users presence` | List each known user's last active chat surface channel. |
| `shrimpy users get-owner\|set-owner [userId]` | Inspect or set the workspace owner. |

## Gateway And Plumbing

| Command | Purpose |
| --- | --- |
| `shrimpy gateway status` | Show gateway health, lanes, watch clock, and loop-guard trips. |
| `shrimpy gateway logs [--lines N] [--follow] [--path]` | Read the workspace gateway log. |
| `shrimpy gateway install\|start\|stop\|restart\|uninstall` | Manage the gateway service. |
| `shrimpy help [command...]` | Show default help or help for one command path. |
| `shrimpy help all` | Show the complete command catalog. |
| `shrimpy completion bash\|zsh` | Print generated shell completion. |
| `shrimpy completion install\|write-state\|status [bash\|zsh]` | Manage cached shell completion. |

## Conventions

Canonical resource groups keep the implemented names: singular `agent` and `surface`, plural `channels`, `sessions`, `watches`, `skills`, `models`, and `users`. Prefer standard verbs for new commands: `list`, `show`, `read`, `create`/`add`, `set`, `remove`, `tail`, `run`, and `status`. New top-level commands should be user-intention names or durable resource names; keep resource-owned diagnostics under the resource group. Command plumbing lives in `src/commands/framework.ts`.
