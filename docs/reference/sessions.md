# 🦐 Sessions

A Shrimpy session is one private Pi working context for one agent and one
session label. Sessions persist model-facing conversation state under the
agent workspace; channels persist shared communication logs. A channel message
can become a turn in a session, but the channel log and the session transcript
are separate records. See [channels.md](channels.md) for channel protocol,
membership, addressing, and wake policy.

## Session Kinds

| Kind | Label | Path | Opened by |
| --- | --- | --- | --- |
| TUI | `tui` | `agents/<id>/sessions/tui/` | `shrimpy`, `shrimpy agent tui <id>` |
| Direct run | `run` | `agents/<id>/sessions/run/` | `shrimpy run`, `shrimpy agent run <id>` |
| Gateway channel | channel name | `agents/<id>/sessions/<channel>/` | gateway delivery after membership plus agent `channelPolicy` wake |
| Child run | `children/<timestamp-random>` | `agents/<id>/sessions/children/<timestamp-random>/` | `run_child` |

Direct and gateway labels are sanitized for filesystem paths by replacing
characters outside `a-zA-Z0-9._-` with `_`.

## Opening A Session

When a session opens, Shrimpy builds a Pi session plan:

- descriptor: agent id, kind, channel/label, cwd, and session directory
- model and model-variant inference metadata
- default and requested thinking level
- Shrimpy daemon tools plus disabled-tool policy
- stable system prompt resources and approved skills
- persisted turn-context envelope
- compaction settings

Pi owns the session runtime, transcript format, model calls, tool execution,
and TUI mechanics. Shrimpy owns the session plan, workspace paths, channel
publication tools, turn-context assembly, and inspection metadata.

## Prompt And Turn Context

Shrimpy passes Pi one stable system prompt at session open. Per-turn live facts
are rendered as a `<context>...</context>` envelope and prefixed to the current
user message before Pi persists and sends it. This keeps the session JSONL an
exact representation of the model-facing user turn.

For direct `tui` and `run` sessions, the user prompt body is the local prompt
text. For gateway sessions, the body is the formatted channel message. When
turn context exists, the persisted user message contains the context envelope
followed by that body. See [context-assembly.md](context-assembly.md) and
[turn-context.md](turn-context.md).

## Model And Thinking

Direct local sessions restore the model saved inside the existing session when
no CLI `--provider` or `--model` override is supplied. If there is no saved
session model, Shrimpy uses the selected agent's `agents[].model`.

Gateway channel sessions open from the agent default model for that gateway
process. Existing channel session files record model metadata for inspection,
but a gateway restart does not use a previously recorded channel-session model
as the restart default.

When the model changes inside a session, Shrimpy appends a visible
`shrimpy_model_switch` custom message so later turns can see that earlier
assistant messages may have used a different model.

Thinking level comes from the agent default unless a command or session setting
overrides it. `shrimpy sessions thinking tui <level>` mutates the local direct
session. `shrimpy sessions thinking <channel> <level>` for gateway channels
publishes a control message that the gateway applies to the targeted agent's
channel session.

## Lifecycle

Session files are Pi `.jsonl` files. Shrimpy marks active and archived files
with `shrimpy_lifecycle` custom entries instead of moving or rewriting the
transcript.

Use:

```bash
shrimpy sessions list [channel] [--agent <id>] [--json]
shrimpy sessions new <channel> [--agent <id>]
shrimpy sessions clear <channel> [--agent <id>]
shrimpy sessions restore <channel> [--agent <id>] [--archive <name>]
```

`new` and `clear` archive the active session file. The next turn opens a fresh
active file. `restore` marks an archived file active and archives the previous
active file if one exists.

For local labels `tui` and `run`, lifecycle commands mutate the session files
directly. For gateway channel sessions, lifecycle commands publish session
control messages into the channel; the running gateway handles them in order
with that channel session.

## Queuing

One agent has one managed gateway session per channel. `SessionRegistry`
serializes work per channel, so only one turn runs in that session at a time.
Queued turns, resets, restores, and thinking changes are applied in order for
that session. Different agents and different channels have separate sessions.

## Recorded Metadata

When a session opens, Shrimpy appends inspection metadata to the active JSONL:

- `shrimpy_system_prompt` — resolved Shrimpy system prompt
- `shrimpy_tools` — tools registered for the session
- `shrimpy_session_metadata` — agent, channel, env, model, inference, compaction, and tool policy
- `shrimpy_compaction_policy` — effective compaction policy at open time
- `shrimpy_lifecycle` — active or archived state
- `shrimpy_model_switch` — visible model-change note when the model changes

Pi ignores inspection-only custom entries when building normal model context.
Shrimpy uses them for session inspection, compaction parity, and restart
diagnostics.

## Inspection

```bash
shrimpy sessions list --agent shrimpy
shrimpy sessions list home --agent shrimpy --json
shrimpy sessions compaction home --agent shrimpy --json
shrimpy models resolve --agent shrimpy --session tui
shrimpy models resolve --agent shrimpy --channel home
shrimpy context --turn --channel home --agent shrimpy
```

`shrimpy sessions compaction` reports the current effective policy, the active
session's recorded policy/runtime metadata, and whether reset/reopen or gateway
restart is needed for changed settings. See [compaction.md](compaction.md).

## Boundaries

- Sessions are private working context; channels are shared logs.
- Gateway assistant text is not automatically published to a channel. Agents
  use `reply`, `ask`, `notify`, or `report` for user-visible output.
- Resetting or restoring a session does not mutate channel history.
- Session compaction is working-context maintenance, not long-term memory.
- Skills, memory, and turn context provide prompt material; they are not a
  second channel dispatch or wake-policy control plane.
