# 🦐 CLI

Every Shrimpy feature is reachable through a `shrimpy <command>` subcommand. Commands print inspectable output, avoid hidden interactive requirements where possible, and compose with other tools.

## Command Structure

Command metadata lives in `src/commands/catalog.ts`. Top-level `shrimpy --help`, group usage text, and shell completion are generated from that catalog so command names, options, and docs have one source to compare against.

Canonical resource groups currently keep the implemented names: singular `agent` and `surface`, plural `channels`, `sessions`, `watches`, `skills`, `models`, and `users`. Prefer standard verbs for new commands: `list`, `show`, `read`, `create`/`add`, `set`, `remove`, `tail`, `run`, and `status`. Inspection commands intended for agents should expose `--json`.

## Session Commands

See [sessions.md](sessions.md) for session files, lifecycle, model metadata, and the direct-vs-gateway behavior behind these commands.

| Command | Purpose |
| --- | --- |
| `shrimpy` | Open Shrimpy, setting up a minimal environment when needed. |
| `shrimpy "prompt"` | Open the TUI session with an initial prompt. |
| `shrimpy run "prompt"` | Run a one-shot prompt and print the response. |
| `shrimpy agent tui <id> [prompt]` | Open a TUI session as a specific agent. |
| `shrimpy agent run <id> "prompt"` | Run a one-shot prompt as a specific agent. |
| `shrimpy sessions list [channel]` | Inspect active and archived sessions. |
| `shrimpy sessions new <channel>` | Archive/reset a session. |
| `shrimpy sessions restore <channel>` | Restore an archived session. |
| `shrimpy sessions thinking <channel> <level>` | Change reasoning effort for a session. |
| `shrimpy sessions compaction <channel> [--agent <id>] [--json]` | Inspect the effective compaction policy, selected model/inference metadata, and whether the active session recorded older runtime settings. See [compaction.md](compaction.md). |
| `shrimpy models [--json]` | Inspect model policies, agent defaults, and Pi-visible provider models. |
| `shrimpy models resolve [--agent <id>] [--session <name>\|--channel <name>] [--provider <p>] [--model <m>] [--policy <name>] [--json]` | Explain model precedence for a CLI override, explicit policy, local session, channel session, or agent default. |
| `shrimpy models policies [list] [--json]` | List configured model policies and candidate resolution. |
| `shrimpy models policies show <name> [--json]` | Inspect one model policy. |
| `shrimpy models policies set <name> --candidate <provider>/<model> ... [--json]` | Replace a policy's ordered candidates. |
| `shrimpy models policies add-candidate <name> <provider>/<model> [--index <n>] [--json]` | Add or reposition one policy candidate. |
| `shrimpy models policies remove-candidate <name> <provider>/<model> [--json]` | Remove one policy candidate. |
| `shrimpy models policies move-candidate <name> <provider>/<model> --index <n> [--json]` | Move one policy candidate. |

Common flags: `--agent`, `--provider`, `--model`, `--model-policy`, `--policy`, `--thinking`, `--skill`, `--json` where supported.

## Workspace And Runtime

| Command | Purpose |
| --- | --- |
| `shrimpy setup` | Set up a minimal working Shrimpy environment when needed. |
| `shrimpy setup init` | Create baseline workspace files. |
| `shrimpy setup telegram` | Guided Telegram config. |
| `shrimpy workspace track init [--json]` | Initialize opt-in local workspace git checkpoint tracking. |
| `shrimpy workspace track status [--json]` | Inspect workspace checkpoint tracking status and changed checkpointable paths. |
| `shrimpy workspace track checkpoint --message <text> [--json]` | Create a manual workspace checkpoint commit. |
| `shrimpy status` | Show workspace, gateway, channels, watch-run, and Telegram offset status. |
| `shrimpy watches [--agent <id>] [--json]` | Inspect configured agent-owned watches, including source paths, target channels, expected wake decisions, next runs, active runs, and recent history. |
| `shrimpy watches add <id> --agent <id> (--cron <expr>\|--every <dur>) --channel <name> --message <text>` | Add a simple agent-owned time watch. |
| `shrimpy watches show <agent-id>/<watch-id> [--json]` | Show one resolved watch with diagnostics and inspect commands. |
| `shrimpy watches history <agent-id>/<watch-id> [--limit N] [--json]` | Show recent run records for one watch. |
| `shrimpy watches run <agent-id>/<watch-id> [--json]` | Run one watch immediately and record it in watch history. |
| `shrimpy context` | Render assembled session prompt context. |
| `shrimpy context --sections` | Inspect prompt sections with provenance. |
| `shrimpy context --turn -c <name>` | Render the full turn preview, with prompt sections, turn context, and user message shown separately. |
| `shrimpy context turn --channel <name> [--session-type <type>]` | Render only turn context for a channel/session. |
| `shrimpy context files list [--agent <id>] [--older-than <dur>] [--json]` | List agent context Markdown files. Useful for upkeep skills. |
| `shrimpy context files show [--agent <id>] <path>` | Print one agent context file. |
| `shrimpy context sources list [--agent <id>] [--channel <name>] [--json]` | Inspect configured file/directory/command sources plus runtime turn context. |
| `shrimpy context sources run <id> [--agent <id>] [--channel <name>] [--session-type <type>] [--json]` | Render one context source for debugging. |
| `shrimpy context --config` | Show resolved context config. |

## Channels And Surfaces

See [channels.md](channels.md) for the channel protocol, membership, addressing, agent channel policy, and egress behavior behind these commands.

| Command | Purpose |
| --- | --- |
| `shrimpy channels` | List channels. |
| `shrimpy channels show <name>` | Inspect one channel, including membership, recent request-like messages, message kind counts, and traceable source records. |
| `shrimpy channels read <name>` | Read recent channel messages. |
| `shrimpy channels search <name> [query] [--kind <kind>] [--sender <kind>] [--transport <name>] [--limit N] [--json]` | Search and filter channel messages. `--kind` accepts `user_text`, `agent_text`, `watch`, `worker`, `system`, `media`, `text`, or `other`; dash forms like `user-text` also work. Additional filters include `--actor-id`, `--content-type`, `--addressed`, `--watch`, and `--source-kind`. |
| `shrimpy channels tail <name>` | Watch a channel log. |
| `shrimpy channels create <name>` | Create or initialize channel membership. |
| `shrimpy channels post <name> <text>` | Post a CLI human message into a channel log. |
| `shrimpy channels post <name> --agent <id> <text>` | Post a CLI human message addressed to one agent. |
| `shrimpy channels dm <a> <b>` | Create a deterministic agent DM channel. |
| `shrimpy channels members <name>` | Show channel members. |
| `shrimpy channels join <name> --agent <id>` | Add an agent to channel membership. Agent `channelPolicy` config decides which visible channel messages become turns. |
| `shrimpy channels leave <name> --agent <id>` | Remove an agent from channel membership. Agent `channelPolicy` config decides which visible channel messages become turns. |
| `shrimpy surface` | List surface thread state. |
| `shrimpy surface show <surface> <thread-id>` | Show one surface thread state entry. |
| `shrimpy surface set-agent <surface> <thread-id> <agent>` | Set addressed agent for a surface thread. |
| `shrimpy surface clear-agent <surface> <thread-id>` | Clear addressed agent. |

## Agents, Skills, Context

| Command | Purpose |
| --- | --- |
| `shrimpy agent list` | List configured agents. |
| `shrimpy agent show <id>` | Show resolved agent config and paths. |
| `shrimpy agent inspect <id>` | Show the effective tool capability view, including Pi built-ins, Shrimpy daemon tools, active tools, and excluded tools. See [tools.md](tools.md). |
| `shrimpy agent add <id>` | Add an agent and scaffold docs. Supports `--model-policy`, `--tools`, `--disable-tools`, `--thinking`, and `--channel-policy <all|mentions|addressed|none>`. |
| `shrimpy agent set <id>` | Update root, model policy default, Shrimpy daemon tools, disabled tools, thinking default, or base channel policy mode. |
| `shrimpy agent channel-policy <id> [--channel <name>]` | Inspect base and effective agent-owned channel policy. |
| `shrimpy agent channel-policy set <id> [--channel <pattern>] [--mode <m>] [--senders a,b] [--actor-ids a,b] [--user-ids a,b]` | Set base or per-channel policy fields without rewriting the rest of the policy. |
| `shrimpy agent channel-policy clear <id> [--channel <pattern>] [--mode] [--senders] [--actor-ids] [--user-ids]` | Clear base or per-channel policy fields; `--channel` with no fields removes the whole override. |
| `shrimpy agent channel-policy explain <id> --channel <name> --sender <human\|agent\|system> --text <text> [--actor-id <id>] [--user-id <id>] [--addressed <id>]` | Explain whether a visible sample message would become a turn, including membership visibility and effective policy filters. |
| `shrimpy agent rename <old> <new>` | Rename an agent and update local state. |
| `shrimpy agent remove <id>` | Remove an agent from config/state. |
| `shrimpy skills list [--agent <id>] [--json]` | List the effective Pi-loaded agent and workspace skill view, including warnings. |
| `shrimpy skills show <id> [--agent <id>]` | Print a skill's `SKILL.md`. |
| `shrimpy skills add <id> [--agent <id>\|--workspace] [--description <text>] [--force]` | Scaffold a valid workspace or agent skill bundle. |
| `shrimpy skills install <source> [--agent <id>\|--workspace] [--id <id>] [--force]` | Copy a local skill bundle or Markdown entrypoint into the workspace. |
| `shrimpy skills validate [id] [--agent <id>] [--json]` | Validate skill frontmatter, Pi loading, path layout, shadowing, and large effective skill sets. |
| `shrimpy users list` | List identity links and the resolved owner. |
| `shrimpy users get-owner` | Print the resolved owner identity. |
| `shrimpy users set-owner <userId>` | Set the workspace owner; CLI publishing routes through the owner's actorId when set. |

## Gateway

| Command | Purpose |
| --- | --- |
| `shrimpy gateway status` | Show gateway activity and watch clock status. |
| `shrimpy gateway logs` | Print recent `workspace/runtime/logs/gateway.log` lines. |
| `shrimpy gateway logs --lines 200` | Print a specific number of log lines. |
| `shrimpy gateway logs --follow` | Follow the workspace gateway log. |
| `shrimpy gateway logs --path` | Print the resolved gateway log path. |
| `shrimpy gateway install/start/stop/restart/uninstall` | Manage the systemd user service. |

## Plumbing

| Command | Purpose |
| --- | --- |
| `shrimpy completion bash` | Print Bash completion generated from the CLI catalog. |
| `shrimpy completion zsh` | Print Zsh completion generated from the CLI catalog. |
| `shrimpy completion install [bash\|zsh]` | Install cached shell completion into the current shell profile. |
| `shrimpy completion write-state [bash\|zsh]` | Write cached shell completion without changing shell profiles. |
| `shrimpy completion status [bash\|zsh]` | Print shell completion profile and cache paths. |

Command plumbing lives in `src/commands/framework.ts`: shared group dispatcher, parse wrapper, usage errors, and common flag helpers. Command metadata lives in `src/commands/catalog.ts`. Inspection commands that other agents may consume support `--json`.
