# 🦐 CLI

Every Shrimpy feature is reachable through a `shrimpy <command>` subcommand. Commands print inspectable output, avoid hidden interactive requirements where possible, and compose with other tools.

## Session Commands

| Command | Purpose |
| --- | --- |
| `shrimpy` | Open the default agent's TUI session. |
| `shrimpy "prompt"` | Open the TUI session with an initial prompt. |
| `shrimpy run "prompt"` | Run a one-shot prompt and print the response. |
| `shrimpy agent tui <id> [prompt]` | Open a TUI session as a specific agent. |
| `shrimpy agent run <id> "prompt"` | Run a one-shot prompt as a specific agent. |
| `shrimpy sessions list [channel]` | Inspect active and archived sessions. |
| `shrimpy sessions new <channel>` | Archive/reset a session. |
| `shrimpy sessions restore <channel>` | Restore an archived session. |
| `shrimpy sessions thinking <channel> <level>` | Change reasoning effort for a session. |
| `shrimpy sessions compaction <channel> [--agent <id>] [--json]` | Inspect the effective compaction policy, selected model/inference metadata, and whether the active session recorded older runtime settings. See [compaction.md](compaction.md). |

Common flags: `--agent`, `--provider`, `--model`, `--thinking`, `--skill`, `--json` where supported.

## Workspace And Runtime

| Command | Purpose |
| --- | --- |
| `shrimpy setup` | Initialize and launch setup flow. |
| `shrimpy setup init` | Create baseline workspace files. |
| `shrimpy setup telegram` | Guided Telegram config. |
| `shrimpy status` | Show workspace, gateway, channels, heartbeat, and Telegram offset status. |
| `shrimpy context` | Render assembled session context. |
| `shrimpy context --sections` | Inspect prompt sections with provenance. |
| `shrimpy context --briefing -c <name>` | Render only the turn briefing preview for a channel/session. |
| `shrimpy context turn --channel <name>` | Render prompt sections plus the turn-context preview. |
| `shrimpy context files list [--agent <id>] [--older-than <dur>] [--json]` | List agent context Markdown files. Useful for upkeep skills. |
| `shrimpy context files show [--agent <id>] <path>` | Print one agent context file. |
| `shrimpy context sources list [--agent <id>] [--channel <name>] [--json]` | Inspect configured file/directory/command sources plus runtime turn context. |
| `shrimpy context sources run <id> [--agent <id>] [--channel <name>]` | Render one context source for debugging. |
| `shrimpy context --config` | Show resolved context config. |

## Channels And Surfaces

| Command | Purpose |
| --- | --- |
| `shrimpy channels` | List channels. |
| `shrimpy channels show <name>` | Inspect one channel. |
| `shrimpy channels read <name>` | Read recent channel messages. |
| `shrimpy channels tail <name>` | Watch a channel log. |
| `shrimpy channels create <name>` | Create/bootstrap channel membership. |
| `shrimpy channels post <name> <text>` | Post a CLI human message into a channel log. |
| `shrimpy channels post <name> --agent <id> <text>` | Post a CLI human message addressed to one agent. |
| `shrimpy channels dm <a> <b>` | Create a deterministic agent DM channel. |
| `shrimpy channels members <name>` | Show channel members. |
| `shrimpy channels join/leave <name> --agent <id>` | Update channel membership. Agent `attention` config decides which channel messages become turns. |
| `shrimpy surface` | List surface thread state. |
| `shrimpy surface show <surface> <thread-id>` | Show one surface thread state entry. |
| `shrimpy surface set-agent <surface> <thread-id> <agent>` | Set addressed agent for a surface thread. |
| `shrimpy surface clear-agent <surface> <thread-id>` | Clear addressed agent. |

## Agents, Skills, Context

| Command | Purpose |
| --- | --- |
| `shrimpy agent list` | List configured agents. |
| `shrimpy agent show <id>` | Show resolved agent config and paths. |
| `shrimpy agent inspect <id>` | Show the effective tool capability view, including Pi built-ins, Shrimpy daemon tools, active tools, and excluded tools. |
| `shrimpy agent add <id>` | Add an agent and scaffold docs. Supports `--provider`, `--model`, `--tools`, `--disable-tools`, `--thinking`, and `--attention <all|mentions|addressed|none>`. |
| `shrimpy agent set <id>` | Update root, model default, Shrimpy daemon tools, disabled tools, thinking default, or attention mode. |
| `shrimpy agent attention <id> [--channel <name>]` | Inspect base and effective attention policy, including implied rules. |
| `shrimpy agent attention set <id> [--channel <pattern>] [--mode <m>] [--senders a,b] [--actor-ids a,b] [--user-ids a,b]` | Set base or per-channel attention fields without rewriting the rest of the policy. |
| `shrimpy agent attention clear <id> [--channel <pattern>] [--mode] [--senders] [--actor-ids] [--user-ids]` | Clear base or per-channel attention fields; `--channel` with no fields removes the whole override. |
| `shrimpy agent attention test <id> --channel <name> --sender <human\|agent\|system> --text <text>` | Explain whether a sample message would become a turn. |
| `shrimpy agent schedules <id>` | List one agent's schedule definitions. |
| `shrimpy agent schedule <id> <schedule-id>` | Show one agent schedule definition. |
| `shrimpy agent rename <old> <new>` | Rename an agent and update local state. |
| `shrimpy agent remove <id>` | Remove an agent from config/state. |
| `shrimpy skills list` | List agent and workspace skills. |
| `shrimpy skills show <id>` | Print a skill's `SKILL.md`. |
| `shrimpy users list` | List identity links and the resolved owner. |
| `shrimpy users get-owner` | Print the resolved owner identity. |
| `shrimpy users set-owner <userId>` | Set the workspace owner; CLI publishing routes through the owner's actorId when set. |

## Gateway

| Command | Purpose |
| --- | --- |
| `shrimpy gateway status` | Show gateway activity and scheduler status. |
| `shrimpy gateway logs` | Print recent `workspace/runtime/logs/gateway.log` lines. |
| `shrimpy gateway logs --lines 200` | Print a specific number of log lines. |
| `shrimpy gateway logs --follow` | Follow the workspace gateway log. |
| `shrimpy gateway logs --path` | Print the resolved gateway log path. |
| `shrimpy gateway install/start/stop/restart/uninstall` | Manage the systemd user service. |

## Plumbing

Command plumbing lives in `src/commands/framework.ts`: shared group dispatcher, parse wrapper, usage errors, and common flag helpers. Inspection commands that other agents may consume support `--json`.
