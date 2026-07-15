# 🦐 CLI

Every Shrimpy feature is reachable through a `shrimpy <command>` subcommand. Commands print inspectable output, avoid hidden interactive requirements where possible, and compose with other tools.

## Command Structure

Command metadata lives in `src/commands/catalog.ts`. Top-level `shrimpy --help` shows the calm default surface, while `shrimpy help all` prints the complete catalog. Path help such as `shrimpy channels --help`, nested namespace help such as `shrimpy models policies --help`, leaf help such as `shrimpy channels read --help`, group usage text, and shell completion are generated from the same catalog so command names, options, and docs have one source to compare against. `-h` is accepted as the short form of `--help`.

Canonical resource groups currently keep the implemented names: singular `agent` and `surface`, plural `channels`, `sessions`, `watches`, `skills`, `models`, and `users`. Prefer standard verbs for new commands: `list`, `show`, `read`, `create`/`add`, `set`, `remove`, `tail`, `run`, and `status`. Plain output is the agent-facing default for inspection. `--json` is for scripts, pipes, and cases where structured output is explicitly needed.

Default help is for common human actions. Full help, path help, reference docs, and shell completion remain the discovery surfaces for advanced diagnostics, admin commands, and agent-oriented JSON inspection. New top-level commands should be user-intention names or durable resource names; keep resource-owned diagnostics under the resource group unless a cross-cutting `inspect` or `debug` namespace would be clearer than the existing owner.

## Session Commands

See [sessions.md](sessions.md) for canonical session ids, manifests, ownership, lifecycle, and model metadata.

| Command | Purpose |
| --- | --- |
| `shrimpy` | Open Shrimpy, running setup onboarding when needed. With no prompt or explicit agent, resume the agent used most recently in terminal chat; `/new` still remembers that agent before the fresh conversation has a reply. Fall back to the first configured agent when there is no prior terminal chat. |
| `shrimpy "prompt"` | Open the first configured agent's TUI session with an initial prompt. Use `--agent <id>` to target another agent explicitly. |
| `shrimpy chat [agent] [--provider <p>] [--model <m>] [--model-policy <name>] [--thinking <level>] [--skill <id>]` | Open a TUI chat with the default or selected agent. Use `shrimpy chat mechanic` for the maintenance agent. |
| `shrimpy run "prompt" [--session <session-id>]` | Run a one-shot prompt and print the response. Runs are in-memory unless `--session` explicitly resumes durable state. |
| `shrimpy agent tui <id> [prompt]` | Open a TUI session as a specific agent. Supports `--provider`, `--model`, `--model-policy`, `--thinking`, and `--skill`. |
| `shrimpy agent run <id> "prompt"` | Run a one-shot prompt as a specific agent. |
| `shrimpy sessions list [session-id]` | Inspect manifested sessions, active/archive state, owner, and gateway lane state. |
| `shrimpy sessions new <session-id>` | Archive/reset a session through its owner or an exclusive maintenance lease. |
| `shrimpy sessions restore <session-id>` | Restore an archived session through its owner or an exclusive maintenance lease. |
| `shrimpy sessions set <session-id> [--thinking <level>] [--model <provider/model>\|--model-policy <name>]` | Change the model or reasoning effort for a running session. |
| `shrimpy sessions stop <session-id> [--agent <id>]` | Stop a running gateway turn out of band and verify the outcome. |
| `shrimpy sessions search <query> [--agent <id>] [--channel <channel>] [--all-agents] [--limit N] [--json]` | Search active and archived session transcripts with bounded snippets. |
| `shrimpy sessions read <session> --around <entry> [--window N] [--agent <id>] [--json]` | Read a bounded transcript window around one session entry. |
| `shrimpy sessions compaction <session-id> [--agent <id>] [--json]` | Inspect the effective compaction policy, selected model metadata, and whether the active session recorded older runtime settings. See [compaction.md](compaction.md). |
| `shrimpy models [--json]` | Inspect model policies, agent defaults, and Pi-visible provider models. |
| `shrimpy models resolve [--agent <id>] [--session <session-id>\|--channel <name>] [--provider <p>] [--model <m>] [--policy <name>] [--json]` | Explain model precedence for a CLI override, explicit policy, durable session, channel session, or agent default. |
| `shrimpy models policies [list] [--json]` | List configured model policies and candidate resolution. |
| `shrimpy models policies show <name> [--json]` | Inspect one model policy. |
| `shrimpy models policies set <name> --candidate <provider>/<model> ... [--json]` | Replace a policy's ordered candidates. |
| `shrimpy models policies add-candidate <name> <provider>/<model> [--index <n>] [--json]` | Add or reposition one policy candidate. |
| `shrimpy models policies remove-candidate <name> <provider>/<model> [--json]` | Remove one policy candidate. |
| `shrimpy models policies move-candidate <name> <provider>/<model> --index <n> [--json]` | Move one policy candidate. |
| `shrimpy models providers add-openai-compatible --provider <id> --model <id> [--endpoint <url>] [--context-window <n>] [--max-tokens <n>] [--thinking-format <format>] [--set-coding] [--json]` | Add an OpenAI-compatible provider model to Pi's model registry. |

Common flags: `--agent`, `--provider`, `--model`, `--model-policy`, `--policy`, `--thinking`, `--skill`, `--json` where supported.

## Workspace And Runtime

| Command | Purpose |
| --- | --- |
| `shrimpy setup` | Run first-run setup onboarding when needed. |
| `shrimpy setup telegram` | Guided Telegram config. |
| `shrimpy workspace track init [--json]` | Initialize opt-in local workspace git checkpoint tracking. |
| `shrimpy workspace track status [--json]` | Inspect workspace checkpoint tracking status and changed checkpointable paths. |
| `shrimpy workspace track checkpoint --message <text> [--json]` | Create a manual workspace checkpoint commit. |
| `shrimpy workspace search <query> [--limit N] [--json]` | Search profile, skill, agent context, and agent vault Markdown with bounded scored results. |
| `shrimpy workspace index status [--json]` | Inspect workspace search corpus size, scorer, embedding availability, and index staleness. |
| `shrimpy workspace index rebuild [--json]` | Rebuild the workspace search cache under `runtime/search/`. |
| `shrimpy update [--dry-run] [--json]` | Preflight a safe Shrimpy environment update, including mechanic model access, protected files, gateway state, install target, and migration handoff. |
| `shrimpy status` | Show workspace, gateway, channels, watch-run, and Telegram offset status. |
| `shrimpy watches [--agent <id>] [--json]` | Inspect configured agent-owned watches, including source paths, target channels, expected wake decisions, next runs, active runs, and recent history. |
| `shrimpy watches add <id> [--agent <id>] [--name <text>] [--concurrency-policy <forbid\|allow>] (--cron <expr>\|--every <dur>\|--every-ms <n>) (--channel <name> --message <text>\|--command <cmd>) [--json]` | Add an agent-owned time watch. Command watches also support `--cwd`, `--timeout-ms`, `--emit-policy`, `--emit-channel`, and `--emit-template`. |
| `shrimpy watches enable <agent-id>/<watch-id> [--json]` | Enable an existing watch. |
| `shrimpy watches disable <agent-id>/<watch-id> [--json]` | Disable an existing watch. |
| `shrimpy watches show <agent-id>/<watch-id> [--json]` | Show one resolved watch with diagnostics and inspect commands. |
| `shrimpy watches history <agent-id>/<watch-id> [--limit N] [--json]` | Show recent run records for one watch. |
| `shrimpy watches run <agent-id>/<watch-id> [--json]` | Run one watch immediately and record it in watch history. |
| `shrimpy worker backends [--refresh] [--json]` | Inspect or refresh persisted Codex, Claude Code, and Pi worker backend availability. |
| `shrimpy worker start [--backend <pi\|codex\|claude>] [--agent <id>] [--cwd <path>] [--goal <text>] [--timeout-ms <n>] <spec> [--json]` | Start a detached coding worker turn and persist its record. Codex runs through `codex exec --json`; Pi runs through Shrimpy's direct Pi session path; Claude Code is deferred. `--timeout-ms` cancels the turn if it exceeds the limit. |
| `shrimpy worker list [--all] [--json]` | List open coding workers. `--all` includes closed workers. |
| `shrimpy worker status <id> [--json]` | Show one worker's structured status, backend, owner, cwd, and goal. Single-worker JSON includes top-level `latestTurn`, `artifactPaths`, and `commands` shortcuts in addition to the full record. |
| `shrimpy worker read <id> [--json]` | Read a worker summary and turn logs. The summary includes goal, status, key actions, files touched, blockers, and latest result. Single-worker JSON uses the same shortcut shape as status. |
| `shrimpy worker send <id> <prompt> [--timeout-ms <n>] [--json]` | Send a contract amendment to an open worker. `--timeout-ms` applies to the amendment turn. |
| `shrimpy worker tail <id> [--lines <n>] [--follow]` | Print or follow the latest worker turn log. |
| `shrimpy worker wait <id> [--timeout-ms <n>] [--json]` | Block until a worker is no longer running. |
| `shrimpy worker cancel <id> [--json]` | Mark a worker cancelled, send `SIGTERM` to the recorded supervisor process group, then escalate to `SIGKILL` if it stays alive past the grace period. |
| `shrimpy worker close <id> [--json]` | Close a worker after checking the result. If the worker is still running, Shrimpy runs the same terminate-then-force-kill cleanup first. |
| `shrimpy context` | Inspect the model-facing context for an agent/session/turn. |
| `shrimpy context --sections` | Inspect prompt sections with provenance. |
| `shrimpy context --turn -c <name>` | Inspect prompt sections plus the turn-context-prefixed user message for a channel turn. |
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
| `shrimpy channels` | List channels. JSON output uses the same summary shape and leaves detailed activity to `channels show`. |
| `shrimpy channels show <name>` | Inspect one channel, including manifest binding, delivery receipts, membership, recent request-like messages, message kind counts, and traceable source records. |
| `shrimpy channels bind <name> <adapter>/<instance>/<thread>` | Bind a channel to an outbound transport. |
| `shrimpy channels unbind <name>` | Remove a channel transport binding without changing history. |
| `shrimpy channels read <name> [--limit N] [--full] [--json]` | Read recent channel messages. Plain output clips long message bodies with a truncation marker; `--full` prints complete bodies. JSON output returns complete messages. |
| `shrimpy channels search <name> [query] [--kind <kind>] [--sender <kind>] [--transport <name>] [--limit N] [--full] [--json]` | Search and filter channel messages. Plain output clips long previews with a truncation marker; `--full` prints complete previews. `--kind` accepts `user_text`, `agent_text`, `watch`, `control`, `status`, `system`, `media`, `text`, or `other`; dash forms like `user-text` also work. Additional filters include `--actor-id`, `--content-type`, `--addressed`, `--watch`, and `--source-kind`. |
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
| `shrimpy surface set-agent <surface> <thread-id> <agent>` | Set addressed agent for a surface thread, joining the agent to the resolved channel when needed. |
| `shrimpy surface clear-agent <surface> <thread-id>` | Clear addressed agent. |
| `shrimpy surface activity <channel> [--kind typing] [--duration seconds]` | Trigger a short surface activity signal for manual checks. |

## Agents, Skills, Context

| Command | Purpose |
| --- | --- |
| `shrimpy agent list` | List configured agents. |
| `shrimpy agent show <id>` | Show resolved agent config and paths. |
| `shrimpy agent inspect <id>` | Show the effective tool capability view, including Pi built-ins, Shrimpy daemon tools, active tools, and excluded tools. See [tools.md](tools.md). |
| `shrimpy agent add <id>` | Add an agent and scaffold docs. Supports `--root`, `--cwd`, `--model-policy`, `--tools`, `--disable-tools`, `--thinking`, and `--channel-policy <all|mentions|addressed|none>`. |
| `shrimpy agent set <id>` | Update root, session cwd, model policy default, Shrimpy daemon tools, disabled tools, thinking default, or base channel policy mode. |
| `shrimpy agent channel-policy <id> [--channel <name>]` | Inspect base and effective agent-owned channel policy. |
| `shrimpy agent channel-policy set <id> [--channel <pattern>] [--mode <m>] [--senders a,b] [--actor-ids a,b] [--user-ids a,b]` | Set base or per-channel policy fields without rewriting the rest of the policy. |
| `shrimpy agent channel-policy clear <id> [--channel <pattern>] [--mode] [--senders] [--actor-ids] [--user-ids]` | Clear base or per-channel policy fields; `--channel` with no fields removes the whole override. |
| `shrimpy agent channel-policy explain <id> --channel <name> --sender <human\|agent\|system> --text <text> [--actor-id <id>] [--user-id <id>] [--addressed <id>]` | Explain whether a visible sample message would become a turn, including membership visibility and effective policy filters. |
| `shrimpy agent rename <old> <new>` | Rename an agent and update local state. |
| `shrimpy agent remove <id>` | Remove an agent from config/state. |
| `shrimpy skills list [--agent <id>] [--json]` | List the effective Pi-loaded agent and workspace skill view, including warnings. |
| `shrimpy skills show <id> [--agent <id>]` | Print a skill's `SKILL.md`. |
| `shrimpy skills add <source> [--agent <id>\|--workspace] [--path <path>] [--ref <ref>] [--all] [--dry-run] [--force] [--json]` | Discover, fetch, or copy a skill package into an agent or workspace skill root. |
| `shrimpy skills update <id> [--agent <id>\|--workspace] [--dry-run] [--json]` | Check a managed package's recorded source and replace it when the source revision changed, preserving locally modified installed copies. |
| `shrimpy skills remove <id> [--agent <id>\|--workspace] [--json]` | Remove one managed skill package copy and its package state record. |
| `shrimpy skills new <id> [--agent <id>\|--workspace] [--description <text>] [--force]` | Scaffold a local workspace or agent-authored skill. |
| `shrimpy skills validate [id] [--agent <id>] [--json]` | Validate skill frontmatter, Pi loading, path layout, shadowing, tool compatibility, package status, and large effective skill sets. |
| `shrimpy users list` | List identity links and the resolved owner. |
| `shrimpy users presence` | List each known user's last active chat surface channel. |
| `shrimpy users get-owner` | Print the resolved owner identity. |
| `shrimpy users set-owner <userId>` | Set the workspace owner; CLI publishing routes through the owner's actorId when set. |

## Gateway

| Command | Purpose |
| --- | --- |
| `shrimpy gateway status` | Show gateway activity, watch clock status, gateway lanes, and recent loop-guard trips. |
| `shrimpy gateway logs` | Print recent `workspace/runtime/logs/gateway.log` lines. |
| `shrimpy gateway logs --lines 200` | Print a specific number of log lines. |
| `shrimpy gateway logs --follow` | Follow the workspace gateway log. |
| `shrimpy gateway logs --path` | Print the resolved gateway log path. |
| `shrimpy gateway install/start/stop/restart/uninstall` | Manage the workspace runtime gateway service. |

## Plumbing

| Command | Purpose |
| --- | --- |
| `shrimpy help [command...]` | Show default help or help for one command path. |
| `shrimpy help all` | Show the complete command catalog. |
| `shrimpy completion bash` | Print Bash completion generated from the CLI catalog. |
| `shrimpy completion zsh` | Print Zsh completion generated from the CLI catalog. |
| `shrimpy completion install [bash\|zsh]` | Install cached shell completion into the current shell profile. |
| `shrimpy completion write-state [bash\|zsh]` | Write cached shell completion without changing shell profiles. |
| `shrimpy completion status [bash\|zsh]` | Print shell completion profile and cache paths. |

Command plumbing lives in `src/commands/framework.ts`: shared group dispatcher, parse wrapper, usage errors, and common flag helpers. Command metadata lives in `src/commands/catalog.ts`. Inspection commands should keep plain output concise for agents and expose `--json` for structured consumers.
