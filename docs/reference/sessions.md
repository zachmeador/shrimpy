# 🦐 Sessions

A Shrimpy session is one private Pi working context: the model-facing instructions, tool use, and transcript for one agent in one place. Channel messages can become session turns, but resetting a session never rewrites channel history; see [channels.md](channels.md).

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

Durable sessions live under `agents/<agent-id>/sessions/<namespace>/<encoded-name>/<encoded-profile>/`, with a `session.json` manifest in each directory containing the key, purpose, and delivery binding. Inspection discovers manifests rather than inferring identity from directory names; path components use lossless base64url encoding so distinct names cannot collide.

## One Core, Multiple Hosts

All callers use the same `SessionResolver` and open path. The resolver selects the descriptor, model policy, thinking level, tools, stable prompt resources, turn context, and compaction policy. Pi owns the session runtime, transcript format, model calls, tools, and TUI mechanics.

A descriptor keeps independent concerns independent:

- `key` is identity.
- `purpose` selects policy: `interactive`, `channel`, `setup`, `run`, or `worker`.
- `delivery` is either the caller transcript or a named channel.
- `storage` is durable or in-memory.
- `cwd` is the selected agent's configured working directory unless a specialized caller overrides it.

TUI, setup, gateway, run, and worker are hosts around this core, not different session implementations. TUI uses `local/main`; setup uses `local/setup`; gateway lanes use `channel/<channel>`. `shrimpy run` is ephemeral by default and leaves no transcript; pass `--session <canonical-id>` to resume a durable session deliberately.

Bare, promptless `shrimpy` resumes the agent with the most recent terminal-chat activity, falling back to the first configured agent. An explicit `--agent`, `shrimpy chat <agent>`, or `shrimpy agent tui <agent>` always wins; `shrimpy "prompt"` without `--agent` stays on the first configured agent.

Inside the TUI, `/agents` opens a searchable, arrow-key-navigable hierarchy of agents and active local sessions. Select a session to switch, or an empty agent to open a new `local/main`. A failed switch restores the previous session.

## Model, Prompt, and Thinking

Every durable session restores the model recorded in its active Pi transcript when no `--provider`, `--model`, or `--model-policy` override is supplied. If no saved model exists, Shrimpy uses the agent's `modelPolicy`, then the workspace `coding` policy. `shrimpy sessions set <session-id> --model <provider/model>` changes the current session model; model changes append a visible `shrimpy_model_switch` custom message.

Shrimpy gives Pi one stable system prompt when the session opens, and per-turn facts travel with the current user message, so the JSONL matches what the model saw. Channel turns use the formatted channel message as their prompt body; transcript turns use the caller's local prompt. See [context-assembly.md](context-assembly.md).

Thinking defaults to the agent setting and can be overridden when a host opens the session. `shrimpy sessions set <session-id> --thinking <level>` changes a running gateway-owned session and waits for its correlated outcome.

## Ownership and Lifecycle

A durable session records its current owner under `runtime/sessions/`. That record acts as a lock: foreground, gateway, and maintenance processes cannot open or change the same transcript concurrently.

Lifecycle and runtime controls use canonical ids:

```bash
shrimpy sessions list [session-id] [--agent <id>|--all-agents] [--json]
shrimpy sessions new <session-id> [--agent <id>] [--no-wait] [--json]
shrimpy sessions clear <session-id> [--agent <id>] [--no-wait] [--json]
shrimpy sessions restore <session-id> [--agent <id>] [--archive <name>] [--no-wait] [--json]
shrimpy sessions set <session-id> [--thinking <level>] [--model <provider/model>|--model-policy <name>] [--agent <id>] [--no-wait] [--json]
shrimpy sessions stop <session-id> [--agent <id>] [--no-wait] [--json]
```

`new` and `clear` mark the active Pi JSONL archived with a `shrimpy_lifecycle` entry. `restore` marks an archive active and archives the previous active file. A model or thinking change applies to the session itself, not the agent default or channel configuration. Stop aborts the running turn without waiting behind it; queued turns remain in FIFO order.

How a command reaches the session depends on who owns it:

- **Unowned**: lifecycle commands take a maintenance lease and apply the file operation directly.
- **Gateway-owned**: the command sends a correlated channel control message, waits up to 30 seconds for `operation_status`, and verifies success on disk. `set` and `stop` require a live owner and route out of band this way.
- **Foreground-owned**: external mutation is rejected; use that host's own controls.

`--no-wait` returns a `queued` result after publication. JSON outcomes are `applied`, `applied_direct`, `failed`, `unconfirmed`, or `queued`.

## Pool and Queuing

The gateway has one `SessionPool` per agent and one lane per channel session. The lane is the only FIFO queue: it serializes turns, reset, restore, and session setting changes, which lets stop controls reach a running lane immediately. Different agents and session keys remain independent.

`shrimpy sessions list` and `shrimpy gateway status` expose running turn age, queue depth, last outcome, and live owner when available.

## Search and Inspection

```bash
shrimpy sessions list --all-agents --json
shrimpy sessions search "deployment notes" --agent shrimpy
shrimpy sessions read agents/shrimpy/sessions/channel/<name>/<profile>/example.jsonl --around a1b2c3d4
shrimpy sessions compaction channel/home --agent shrimpy --json
shrimpy models resolve --agent shrimpy --session local/main
```

Search scans active and archived Pi JSONL transcripts. It matches user and assistant text, tool-call names, tool-result names, and recorded bash commands without exposing tool-result bodies. `sessions read` expands one hit into a bounded neighboring window.

`sessions list --all-agents` exposes the same inventory used by the TUI `/agents` navigator: every configured agent plus its active durable local interactive sessions. Per-agent `sessions list` retains the full manifested lifecycle and ownership view.

Session JSONL also records inspection-only custom entries — `shrimpy_system_prompt`, `shrimpy_tools`, `shrimpy_session_metadata`, `shrimpy_compaction_policy`, `shrimpy_lifecycle`, and `shrimpy_model_switch` — which Pi ignores when building model context. The `shrimpy_turn_context` entry is the exception: it participates in model context. See [context-assembly.md](context-assembly.md).

## Edge Cases

- Bare `shrimpy` recency counts an archived transcript as evidence, so `/new` keeps the same agent selected before the fresh conversation has a reply; the fresh conversation starts empty rather than restoring the archive's contents.
- Owner records left by dead processes are rechecked under a transaction before removal, and release removes a record only when its token still matches.
- The `/agents` navigator excludes setup, channel, worker, and archived sessions; `sessions list --all-agents` excludes archives and in-memory sessions too.
