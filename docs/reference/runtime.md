# 🦐 Runtime

Shrimpy has one Pi session core hosted by foreground commands, the gateway, setup, and workers. Hosts share the workspace, resolver, model registry, auth files, context assembly, skills, and tool surface; delivery and persistence are explicit session policy. See [channels.md](channels.md) for channel semantics, [sessions.md](sessions.md) for identity and lifecycle, and [tools.md](tools.md) for the split between native Pi built-ins and Shrimpy daemon tools.

## Direct CLI Sessions

- `shrimpy` opens the selected agent's durable `local/main` TUI session. The shared TUI launcher runs setup onboarding first when `modelPolicies.coding` does not resolve or setup agent workspace files are missing. Pi's `InteractiveMode` owns the core renderer, tools, session state, and live Pi settings. Shrimpy adds public Pi extensions for its animated working indicator, composed stock footer with a bottom-right shrimp, command registration, the `/thinking` adapter, and post-`/new` archival. Four compatibility seams preserve established UX that pinned Pi does not expose publicly: inline ephemeral `/status`, `/shrimpy`, and Shrimpy `/changelog` output; the Shrimpy/Pi `/settings` namespace; model favorites plus cycle/share/scoped-model guardrails; and zero-height collapsed turn context. The Pi settings branch and model list still use Pi's real components.
- `shrimpy "prompt"` opens the same TUI path with an initial prompt.
- `shrimpy chat [agent]` opens the same TUI chat path for the default or selected agent without treating positionals as an initial prompt.
- `shrimpy run "prompt"` opens an in-memory one-shot session and prints the final assistant text. `--session <canonical-id>` opts into a durable resumed session.
- `shrimpy chat mechanic` opens the same direct TUI chat path as the `mechanic` maintenance agent.
- `shrimpy agent tui <id>` opens the same gated TUI launcher for an explicit agent. `shrimpy agent run <id>` runs a one-shot prompt as an explicit agent.
- `/agents` opens a searchable, keyboard-navigable list of agents and local sessions. Selecting a session switches agents; selecting an agent with none opens a new `local/main`. The header shows the active agent, and a failed switch restores the previous session.
- `--provider`, `--model`, `--model-policy`, `--thinking <off|minimal|low|medium|high|xhigh|max>`, and `--skill <id>` override one direct session where supported.
- Direct sessions start in the selected agent's configured `cwd`, defaulting to the agent root. Fresh setup config starts the `shrimpy` agent in `agents/shrimpy` and the `mechanic` agent at the workspace root.
- Without a model override, every durable session first restores its saved model when one exists, then uses the selected agent's `modelPolicy`, falling back to the workspace `coding` policy. Fresh sessions without a usable policy fail with a setup hint.
- `--skill <id>` loads full skill context into the session. The normal workspace/agent skill list is also passed to Pi so `/skill:<name>`, autocomplete, and available-skill prompt advertising see the same skill set.

Transcript-delivered foreground sessions do not first write user prompts to a channel log.

Setup model access uses a plain CLI wizard backed by Pi auth and model registry APIs, including a local OpenAI-compatible endpoint path that writes Pi `models.json`. Normal TUI launchers are blocked until setup is ready; non-interactive TUI commands print a setup hint instead of opening a session.

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
  -> SessionPool lane
  -> Pi session turn
  -> Pi built-ins + Shrimpy daemon tools
  -> ChannelBus
  -> channel log
  -> ChannelOutbox
  -> optional bound surface delivery + receipt
```

Channel sessions are Pi sessions attached to Shrimpy channels. The agent's assistant text stays in its private Pi transcript unless it calls a publication helper such as `reply`, `ask`, `notify`, or `report`. `send_message` remains the lower-level tool for explicit channel routing.

Direct local sessions do not have an active publication channel, so `reply`, `ask`, `notify`, and `report` are not registered there. Local sessions answer with ordinary assistant text unless explicitly asked to send or read a Shrimpy channel.

For CLI-injected channel traffic: `shrimpy channels post <channel> <text>`. Add `--agent <id>` to stamp `origin.addressedAgentId`; the addressed agent still needs channel visibility and a policy that wakes for it.

Gateway channel sessions use the same resolver and agent-configured `cwd` as foreground sessions. Like every durable session, they restore a recorded model when no explicit override is supplied. See [sessions.md](sessions.md).

## Prompt Context

Shrimpy passes Pi one explicit system prompt. Pi's cwd-discovered `AGENTS.md`, append-system prompts, and ambient skill roots are suppressed so session context is inspectable and controlled by Shrimpy.

The Shrimpy-owned base system prompt is assembled from typed `PromptSection`s ordered by kind: identity, memory, and instructions first; capability next; runtime, activity, and evidence last. The contained prompt renderer appends Pi's `<available_skills>` block for the Shrimpy-approved skill paths. See [context-assembly.md](context-assembly.md) and [skills.md](skills.md).

At turn time, Shrimpy prepares current time/session facts, channel-unread pointers, command-source output, and inspect commands. Direct Pi sessions persist the submitted user message unchanged and add the prepared context as a `shrimpy_turn_context` custom message immediately after it; both messages participate in model context. The custom message stays collapsed in the transcript until Ctrl+O expands turn details. Gateway delivery still prefixes the routed channel prompt with its context and publication instruction before persistence. See [turn-context.md](turn-context.md).

## Session Lifecycle

Durable sessions persist under each agent workspace as manifested Pi `.jsonl` directories. `SessionPool` serializes each gateway lane and exposes lane state for gateway status. Owner leases prevent foreground, gateway, and maintenance hosts from opening or mutating the same transcript concurrently. Session lifecycle commands and live setting or stop controls route to the owner when possible; unowned lifecycle changes take a maintenance lease and apply directly. See [sessions.md](sessions.md).

## Background Work

- Agent-owned watches live in each agent workspace at `agents/<id>/watches.json`.
- A watch is a background attention rule. Its `trigger` says what to watch; time is one trigger kind.
- A watch also has a concurrency policy and either a message action or a command action.
- Message watches emit watch-authored channel messages with plain text instructions. The owning agent must be a member of the target channel and have `channelPolicy` configured to wake for those messages. The watch instruction stays internal; the agent sends any user-visible chat message with `reply`, `notify`, or `send_message`.
- Command watches run a shell command and can emit to a channel based on `emit.policy` (`never`, `always`, `on_output`, `on_change`, or `on_failure`).
- Watch-origin messages carry provenance in `origin.watch`, and turn context points back to `shrimpy watches show <watch-id>` and `shrimpy watches history <watch-id>`.
- The gateway watches agent `watches.json` files and reloads watch definitions when they change, preserving existing clock state for unchanged watches.
- Active watch state and run history live under `runtime/watches/<agent-id>/`.
- Fresh setup installs focused upkeep and audit watches disabled by default; the setup flow can enable selected watches with user approval. It does not seed a broad catch-all upkeep watch.
- Coding worker delegation is managed through `shrimpy worker ...` commands and worker records, not through a nested session tool.

## Observability

- `shrimpy status` summarizes workspace and gateway activity.
- `shrimpy gateway status` reports PID/heartbeat-backed gateway process health separately from service-manager state, followed by surface health, watch-run, watch clock, gateway lane, and loop-guard status. `shrimpy status` uses the same liveness collector.
- `shrimpy watches` reports source paths, target channels, expected wake, next runs, active runs, and recent run history.
- `shrimpy gateway logs` reads `workspace/runtime/logs/gateway.log`.
- `shrimpy context` inspects the assembled session prompt, per-turn context, and user message body for an agent/session/turn.
