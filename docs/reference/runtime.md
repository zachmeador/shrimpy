# 🦐 Runtime

Shrimpy has two execution modes: direct local sessions and channel sessions. Both use the same workspace, model registry, auth files, context assembly, skills, and tool surface. See [channels.md](channels.md) for channel semantics, [sessions.md](sessions.md) for session files and lifecycle, and [tools.md](tools.md) for the split between native Pi built-ins and Shrimpy daemon tools.

## Direct CLI Sessions

- `shrimpy` opens a long-lived TUI session for the selected agent on the `tui` session label. When the bare interactive command sees missing setup or no `coding` model candidate, it runs setup first. Pi's `InteractiveMode` owns rendering, key handling, and slash autocomplete; Shrimpy owns session assembly and replaces `/settings` with a unified Shrimpy/Pi selector.
- `shrimpy "prompt"` opens the same TUI path with an initial prompt.
- `shrimpy run "prompt"` opens a one-shot `run` session and prints the final assistant text.
- `shrimpy mechanic` opens a direct TUI session as the `mechanic` maintenance agent.
- `shrimpy agent tui <id>` and `shrimpy agent run <id>` select an explicit agent.
- `--provider`, `--model`, `--model-policy`, `--thinking <off|low|medium|high>`, and `--skill <id>` override one direct session where supported.
- Without a model override, local `tui` and `run` sessions first restore a saved session model when one exists, then use the selected agent's `modelPolicy`, falling back to the workspace `coding` policy. Fresh sessions without a usable policy fail with a setup hint.
- `--skill <id>` loads full skill context into the session. The normal workspace/agent skill list is also passed to Pi so `/skill:<name>`, autocomplete, and available-skill prompt advertising see the same skill set.

Direct `tui` and `run` sessions are local execution labels. They do not first write user prompts to a channel log.

## Gateway Sessions

The gateway runs three jobs:

1. Run configured surfaces such as Telegram.
2. Watch channel logs and offer new messages to channel-member agent sessions.
3. Run the watch clock and advance configured agent-owned watches.

```text
surface / CLI channel post / watch
  -> ChannelBus
  -> ChannelStore
  -> workspace/channels/*.jsonl
  -> ChannelDeliveryLoop
  -> channel membership + agent channelPolicy
  -> AgentChannelRuntime
  -> SessionRegistry
  -> Pi session turn
  -> Pi built-ins + Shrimpy daemon tools
  -> ChannelBus
  -> ChannelEgress
  -> channel log + optional surface delivery
```

Channel sessions are Pi sessions attached to Shrimpy channels. The agent's assistant text stays in its private Pi transcript unless it calls a publication helper such as `reply`, `ask`, `notify`, or `report`. `send_message` remains the lower-level tool for explicit channel routing.

Direct local sessions do not have an active publication channel, so `reply`, `ask`, `notify`, and `report` are not registered there. Local sessions answer with ordinary assistant text unless explicitly asked to send or read a Shrimpy channel.

For CLI-injected channel traffic: `shrimpy channels post <channel> <text>`. Add `--agent <id>` to stamp `origin.addressedAgentId`; the addressed agent still needs channel visibility and a policy that wakes for it.

Gateway channel sessions are opened from the agent's resolved model policy for that gateway process. Existing session files record model metadata for inspection, but channel sessions do not restore a previously recorded model as their restart default. See [sessions.md](sessions.md).

## Prompt Context

Shrimpy passes Pi one explicit system prompt. Pi's cwd-discovered `AGENTS.md`, append-system prompts, and ambient skill roots are suppressed so session context is inspectable and controlled by Shrimpy.

The Shrimpy-owned base system prompt is assembled from typed `PromptSection`s ordered by kind: identity, memory, and instructions first; capability next; runtime, activity, and evidence last. Pi then appends its own `<available_skills>` block for the Shrimpy-approved skill paths. See [context-assembly.md](context-assembly.md) and [skills.md](skills.md).

At turn time, Shrimpy prepares a `<context>...</context>` envelope with current time/session facts, channel-unread pointers, path-indexed memory slices, command-source output, and inspect commands. Shrimpy prefixes the current user message with that envelope before Pi persists and sends the turn, so the session file matches what the model saw. The context is intended for that immediately following message.

## Session Lifecycle

Sessions persist under each agent workspace as Pi `.jsonl` files with Shrimpy custom entries for metadata and lifecycle state. `SessionRegistry` serializes turns per gateway channel session. `shrimpy sessions new|clear|restore` mutate local `tui`/`run` session files directly and publish control messages for gateway channel sessions. See [sessions.md](sessions.md).

## Background Work

- Agent-owned watches live in each agent workspace at `agents/<id>/watches.json`.
- A watch is a background attention rule. Its `trigger` says what to watch; time is one trigger kind.
- A watch also has a concurrency policy and either a message action or a command action.
- Message watches emit watch-authored channel messages with plain text instructions. The owning agent must be a member of the target channel and have `channelPolicy` configured to wake for those messages.
- Command watches run a shell command and can emit to a channel based on `emit.policy` (`never`, `always`, `on_output`, `on_change`, or `on_failure`).
- Watch-origin messages carry provenance in `origin.watch`, and turn context points back to `shrimpy watches show <watch-id>` and `shrimpy watches history <watch-id>`.
- Active watch state and run history live under `runtime/watches/<agent-id>/`.
- Fresh setup seeds focused upkeep watches for `memory-management`, `journal-daily`, and `journal-compact`; it does not seed a broad catch-all upkeep watch.
- The `run_child` tool opens a fresh child `run` session for bounded work and returns the result to the parent session.
- Child runs reuse the same auth and model registry while keeping separate session persistence. See [sessions.md](sessions.md#session-kinds).

## Observability

- `shrimpy status` summarizes workspace and gateway activity.
- `shrimpy gateway status` reports gateway service, watch-run, and watch clock status.
- `shrimpy watches` reports source paths, target channels, expected wake, next runs, active runs, and recent run history.
- `shrimpy gateway logs` reads `workspace/runtime/logs/gateway.log`.
- `shrimpy context` renders the assembled session prompt and can preview per-turn context and the user message body.
