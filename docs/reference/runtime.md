# 🦐 Runtime

Shrimpy has two execution modes: direct local sessions and channel sessions. Both use the same workspace, model registry, auth files, context assembly, skills, and tool surface.

## Direct CLI Sessions

- `shrimpy` opens a long-lived TUI session for the selected agent on the `tui` session label. Pi's `InteractiveMode` owns rendering, key handling, and slash autocomplete; Shrimpy owns session assembly and replaces `/settings` with a unified Shrimpy/Pi selector.
- `shrimpy "prompt"` opens the same TUI path with an initial prompt.
- `shrimpy run "prompt"` opens a one-shot `run` session and prints the final assistant text.
- `shrimpy agent tui <id>` and `shrimpy agent run <id>` select an explicit agent.
- `--provider`, `--model`, and `--thinking <off|low|medium|high>` override one session.
- Without a CLI override, local `tui` and `run` sessions first restore a saved session model when one exists, then use the selected agent's `agents[].model`. Fresh sessions without an agent default fail with a setup hint.
- `--skill <id>` loads full skill context into the session. The normal
  workspace/agent skill list is also passed to Pi so `/skill:<name>`,
  autocomplete, and available-skill prompt advertising see the same skill set.

Direct `tui` and `run` sessions are local execution labels. They do not first write user prompts to a channel log.

## Gateway Sessions

The gateway runs three jobs:

1. Run configured surfaces such as Telegram.
2. Watch channel logs and offer new messages to subscribed agent sessions.
3. Run the scheduler and emit scheduled messages into channels.

```text
surface / CLI channel post / scheduler
  -> ChannelBus
  -> ChannelStore
  -> workspace/channels/*.jsonl
  -> ChannelDeliveryLoop
  -> AgentChannelRuntime
  -> SessionRegistry
  -> Pi session turn
  -> tools / reply, ask, notify, report, send_message
  -> ChannelBus
  -> ChannelEgress
  -> channel log + optional surface delivery
```

Channel sessions are Pi sessions attached to Shrimpy channels. The agent's assistant text stays in its private Pi transcript unless it calls a publication helper such as `reply`, `ask`, `notify`, or `report`. `send_message` remains the lower-level tool for explicit channel routing.

For CLI-injected channel traffic: `shrimpy channels post <channel> <text>`. Add `--agent <id>` when the turn addresses one agent directly.

Gateway channel sessions are opened from the agent default model for that gateway process. Existing session files record model metadata for inspection, but channel sessions do not restore a previously recorded model as their restart default.

## Prompt Context

Shrimpy passes Pi one explicit system prompt. Pi's cwd-discovered `AGENTS.md`,
append-system prompts, and ambient skill roots are suppressed so session context
is inspectable and controlled by Shrimpy.

The Shrimpy-owned base system prompt is assembled from typed `PromptSection`s
ordered by kind: identity, memory, and instructions first; capability next;
runtime, activity, and evidence last. Pi then appends its own
`<available_skills>` block for the Shrimpy-approved skill paths. See
[context-assembly.md](context-assembly.md) and [skills.md](skills.md).

At turn time, Shrimpy prepends a `<context>...</context>` block: current time/session facts, channel-unread pointers, path-indexed memory slices, command-source output, and inspect commands.

## Session Lifecycle

- Sessions persist under the agent workspace.
- Each agent has its own session directory per channel.
- Each channel session directory contains all of that channel's Pi `.jsonl` session files.
- Shrimpy records session metadata and lifecycle state as Pi custom entries inside the `.jsonl`.
- `SessionRegistry` serializes turns per session: one channel session has one active turn at a time.
- `shrimpy sessions new <channel>` and `clear` mark the active `.jsonl` archived; the next turn creates a fresh one.
- `shrimpy sessions restore <channel>` marks an archived `.jsonl` active and archives the previously active file.
- For direct local labels (`tui`, `run`), session commands mutate local session dirs directly.
- For channel sessions handled by the gateway, session commands publish control messages that the gateway handles.

## Background Work

- The heartbeat is a setup-seeded scheduled task that emits into a normal channel/session pair.
- Schedules live in each agent workspace at `agents/<id>/schedules.json`.
- Agent schedules emit addressed channel messages with plain text instructions for the owning agent.
- Fresh setup also seeds ordinary memory upkeep schedules for `memory-management`, `journal-daily`, and `journal-compact`.
- The `run_child` tool opens a fresh child `run` session for bounded work and returns the result to the parent session.
- Child runs reuse the same auth and model registry while keeping separate session persistence.

## Observability

- `shrimpy status` summarizes workspace and gateway activity.
- `shrimpy gateway status` reports gateway service, scheduled-run, and scheduler status.
- `shrimpy gateway logs` reads `workspace/runtime/logs/gateway.log`.
- `shrimpy context` renders assembled session context for inspection.
