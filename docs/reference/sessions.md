# 🦐 Sessions

A Shrimpy session is one private Pi working context. Channels are shared routing and communication logs; sessions carry the model-facing instructions and transcript. A channel message can become a session turn, but resetting a session never rewrites channel history. See [channels.md](channels.md).

## Identity

Every session has one structured key:

```text
agent id + namespace + name + profile id
```

The canonical CLI form omits the default profile:

| Namespace | Example | Typical host |
| --- | --- | --- |
| `local` | `local/main`, `local/setup` | TUI, setup, or an explicitly resumed run |
| `channel` | `channel/home`, `channel/telegram~main~42` | Gateway delivery |
| `worker` | `worker/wrk_123` | Pi-backed worker |

Non-default profiles use `<namespace>/<name>@<profile>`. Names and profiles are percent-encoded in CLI ids.

Durable sessions live under `agents/<agent-id>/sessions/<namespace>/<encoded-name>/<encoded-profile>/`. The path components use lossless base64url encoding, so `a~b` cannot collide with `a_b`, and `local/tui` cannot collide with `channel/tui`. Each durable directory has a `session.json` manifest containing the key, purpose, and delivery binding. Inspection discovers manifests; it does not infer identity from directory names.

This layout replaces the old flat sanitized directories directly. Shrimpy does not read or migrate the old layout.

## One Core, Multiple Hosts

All callers use the same `SessionResolver` and open path. The resolver selects the descriptor, model policy, thinking level, tools, stable prompt resources, turn context, and compaction policy. Pi owns the session runtime, transcript format, model calls, tools, and TUI mechanics.

A descriptor keeps independent concerns independent:

- `key` is identity.
- `purpose` selects policy such as `interactive`, `channel`, `setup`, `run`, or `worker`.
- `delivery` is either the caller transcript or a named channel.
- `storage` is durable or in-memory.
- `cwd` is the selected agent's configured working directory unless a specialized caller overrides it.

TUI, setup, gateway, run, and worker are hosts around this core, not different session implementations. Channel delivery registers active publication helpers such as `reply`; transcript delivery returns ordinary assistant text to its caller.

`shrimpy run` is ephemeral by default and leaves no transcript. Pass `--session <canonical-id>` to resume a durable session deliberately. TUI uses `local/main`; setup uses `local/setup`; gateway lanes use `channel/<channel>`.

Bare, promptless `shrimpy` resumes the agent whose primary terminal chat has the newest transcript or lifecycle update. This keeps the same agent selected when `/new` archives the old transcript but Pi has not yet persisted the fresh conversation. The archived conversation is recency evidence only: Shrimpy starts the fresh conversation instead of restoring its contents. Channel and worker sessions do not participate. If there is no prior primary terminal chat, Shrimpy uses the first configured agent. An explicit `--agent`, `shrimpy chat <agent>`, or `shrimpy agent tui <agent>` always wins, while `shrimpy "prompt"` without `--agent` deliberately stays on the first configured agent.

Inside the TUI, `/agents` opens a searchable, arrow-key-navigable hierarchy of agents and active local sessions. Sessions use Pi names or first-prompt previews; setup, channel, worker, and archived sessions are excluded. Select a session to switch, or an empty agent to open a new `local/main`. Failed switches restore the previous session.

## Model, Prompt, and Thinking

Every durable session restores the model recorded in its active Pi transcript when no `--provider`, `--model`, or `--model-policy` override is supplied. If no saved model exists, Shrimpy uses the agent's `modelPolicy`, then the workspace `coding` policy. `shrimpy sessions set <session-id> --model <provider/model>` changes the current session model. `--model-policy <name>` resolves the policy to a concrete model for the session. Model changes append a visible `shrimpy_model_switch` custom message.

Shrimpy gives Pi one stable system prompt when the session opens. Per-turn facts are prefixed to the current user message before Pi persists and sends it, so the JSONL matches what the model saw. Channel turns use the formatted channel message as their prompt body; transcript turns use the caller's local prompt. See [context-assembly.md](context-assembly.md) and [turn-context.md](turn-context.md).

Thinking defaults to the agent setting and can be overridden when a host opens the session. `shrimpy sessions set <session-id> --thinking <level>` changes a running gateway-owned session and waits for its correlated outcome.

## Ownership and Lifecycle

A durable session records its current owner under `runtime/sessions/`. That record acts as a lock: foreground, gateway, and maintenance processes cannot open or change the same transcript concurrently. Owner acquisition, stale-owner replacement, and release are serialized across processes. Records left by dead processes are rechecked under that transaction before removal, and release removes a record only when its token still matches.

Lifecycle and runtime controls use canonical ids:

```bash
shrimpy sessions list [session-id] [--agent <id>|--all-agents] [--json]
shrimpy sessions new <session-id> [--agent <id>] [--no-wait] [--json]
shrimpy sessions clear <session-id> [--agent <id>] [--no-wait] [--json]
shrimpy sessions restore <session-id> [--agent <id>] [--archive <name>] [--no-wait] [--json]
shrimpy sessions set <session-id> [--thinking <level>] [--model <provider/model>|--model-policy <name>] [--agent <id>] [--no-wait] [--json]
shrimpy sessions stop <session-id> [--agent <id>] [--no-wait] [--json]
```

`new` and `clear` mark the active Pi JSONL archived with a `shrimpy_lifecycle` entry. `restore` marks an archive active and archives the previous active file. If no process owns the session, lifecycle commands take a maintenance lease and apply the file operation directly. If the gateway owns it, the command sends a correlated channel control message, waits up to 30 seconds for `operation_status`, and verifies lifecycle success on disk. Foreground-owned sessions reject external mutation; use that host's controls.

`set` and `stop` require a live owner. Gateway-owned controls are routed out of band. A model or thinking change applies to the session itself; it does not change the agent default or channel configuration. Foreground hosts expose their own model and thinking controls. Stop aborts the running turn without waiting behind it; queued turns remain in FIFO order. `--no-wait` returns a `queued` result after publication. JSON outcomes are `applied`, `applied_direct`, `failed`, `unconfirmed`, or `queued`.

## Pool and Queuing

The gateway has one `SessionPool` per agent and one lane per channel session. The lane is the only FIFO queue: it serializes turns, reset, restore, and session setting changes. `ChannelDeliveryLoop` tracks in-flight dispatches but does not add another channel queue, which lets stop controls reach a running lane immediately. Different agents and session keys remain independent.

`shrimpy sessions list` and `shrimpy gateway status` expose running turn age, queue depth, last outcome, and live owner when available.

## Search and Inspection

```bash
shrimpy sessions list --all-agents --json
shrimpy sessions search "deployment notes" --agent shrimpy
shrimpy sessions read agents/shrimpy/sessions/channel/<name>/<profile>/example.jsonl --around a1b2c3d4
shrimpy sessions compaction channel/home --agent shrimpy --json
shrimpy models resolve --agent shrimpy --session local/main
shrimpy models resolve --agent shrimpy --channel home
```

`sessions list --all-agents` exposes the same navigator inventory used by `/agents`: every configured agent plus its active durable local interactive sessions. It does not include archives or setup, channel, worker, missing, or in-memory sessions. Ordinary per-agent `sessions list` retains the full manifested lifecycle and ownership view.

Search scans active and archived Pi JSONL transcripts. It matches user and assistant text, assistant tool-call names, tool-result names, and recorded bash commands without exposing tool-result bodies. `sessions read` expands one hit into a bounded neighboring window.

Session JSONL also records `shrimpy_system_prompt`, `shrimpy_tools`, `shrimpy_session_metadata`, `shrimpy_compaction_policy`, `shrimpy_lifecycle`, and `shrimpy_model_switch` entries. Pi ignores those inspection-only entries when building ordinary model context. Direct-session turn context is different: the `shrimpy_turn_context` custom message is persisted immediately after its user message and participates in model context. Pi's renderer expansion state shows it when Ctrl+O expands transcript details; Shrimpy suppresses the otherwise empty custom-message spacer while it is collapsed.

## Boundaries

- Sessions are private working context; channels are shared logs.
- Channel-bound assistant text is private until the agent uses a publication helper.
- Resetting or restoring a session does not mutate channel history.
- Session compaction is working-context maintenance, not long-term memory.
- Skills provide instructions; hosts and session policy decide scheduling, delivery, and persistence.
