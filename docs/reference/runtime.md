# 🦐 Runtime

Shrimpy has one Pi session core hosted by foreground commands, the gateway, setup, and workers. Hosts share the workspace, resolver, model runtime, auth and catalog state, context assembly, skills, and tool surface; delivery and persistence are explicit session policy. See [channels.md](channels.md) for channel semantics, [sessions.md](sessions.md) for identity and lifecycle, and [tools.md](tools.md) for the split between native Pi built-ins and Shrimpy daemon tools.

## Direct CLI Sessions

- `shrimpy` opens the selected agent's durable `local/main` TUI session, running setup onboarding first when `modelPolicies.coding` does not resolve or setup agent workspace files are missing. Pi's `InteractiveMode` owns the core renderer, tools, session state, and live Pi settings; Shrimpy layers its own indicator, footer, commands, `/thinking` adapter, post-`/new` archival, and a few narrow compatibility seams for UX that pinned Pi does not expose publicly.
- `shrimpy "prompt"` opens the same TUI path with an initial prompt.
- `shrimpy chat [agent]` opens the same TUI chat path for the default or selected agent without treating positionals as an initial prompt.
- `shrimpy run "prompt"` opens an in-memory one-shot session and prints the final assistant text. `--session <canonical-id>` opts into a durable resumed session.
- `shrimpy chat mechanic` opens the same direct TUI chat path as the `mechanic` maintenance agent.
- `shrimpy agent tui <id>` opens the same gated TUI launcher for an explicit agent. `shrimpy agent run <id>` runs a one-shot prompt as an explicit agent.
- `/agents` opens a searchable, keyboard-navigable list of agents and local sessions. Selecting a session switches agents; selecting an agent with none opens a new `local/main`. The header shows the active agent, and a failed switch restores the previous session.
- `--provider`, `--model`, `--model-policy`, `--thinking <off|minimal|low|medium|high|xhigh|max>`, and `--skill <id>` override one direct session where supported. `--skill <id>` preloads full skill context; the normal workspace/agent skill list still reaches Pi for `/skill:<name>` and prompt advertising.
- Direct sessions start in the selected agent's configured `cwd`, defaulting to the agent root. Model selection follows the durable-session precedence in [sessions.md](sessions.md).

Transcript-delivered foreground sessions do not first write user prompts to a channel log.

Setup model access uses a plain CLI wizard backed by Pi's `ModelRuntime` provider, login, availability, and refresh APIs, including a local OpenAI-compatible endpoint path that writes Pi `models.json`. Runtime bootstrap restores cached dynamic catalogs without network access; setup's explicit refresh action permits a bounded network refresh. Normal TUI launchers are blocked until setup is ready; non-interactive TUI commands print a setup hint instead of opening a session.

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

Shrimpy passes Pi one explicit system prompt; Pi's cwd-discovered `AGENTS.md`, append-system prompts, and ambient skill roots are suppressed so session context stays inspectable and Shrimpy-controlled. Stable prompt assembly and per-turn context injection live in [context-assembly.md](context-assembly.md); skill advertising lives in [skills.md](skills.md).

## Session Lifecycle

Durable sessions persist under each agent workspace as manifested Pi `.jsonl` directories. `SessionPool` serializes each gateway lane and exposes lane state for gateway status. Owner leases prevent foreground, gateway, and maintenance hosts from opening or mutating the same transcript concurrently. Session lifecycle commands and live setting or stop controls route to the owner when possible; unowned lifecycle changes take a maintenance lease and apply directly. See [sessions.md](sessions.md).

## Background Work

- A watch is an agent-owned background attention rule in `agents/<id>/watches.json`: a `trigger` (time is the implemented kind), a concurrency policy, and either a message action or a command action. Config shapes live in [configuration.md](configuration.md).
- Message watches emit watch-authored channel messages; the owning agent needs channel membership and a `channelPolicy` that wakes for them. Command watches run a shell command and can emit to a channel based on `emit.policy`.
- Watch-origin messages carry provenance in `origin.watch`, and turn context points back to `shrimpy watches show <watch-id>` and `shrimpy watches history <watch-id>`.
- The gateway reloads watch definitions when `watches.json` files change, preserving clock state for unchanged watches. Active watch state and run history live under `runtime/watches/<agent-id>/`.
- Next-run timestamps persist in `state/watch-clock.json`. A watch whose scheduled time passed while the gateway was down runs once on the next start, carrying its original fire time, then resumes its schedule. Missed runs do not stack up: a watch due several times during a long outage still runs once. This covers downtime only; a crash after a watch message reached its channel is covered in [channels.md](channels.md).
- Fresh setup installs focused upkeep and audit watches disabled by default; the setup flow can enable selected watches with user approval.
- Coding worker delegation runs through `shrimpy worker ...` commands and worker records.

## Observability

- `shrimpy status` summarizes workspace and gateway activity.
- `shrimpy gateway status` reports PID/heartbeat-backed gateway process health separately from service-manager state, followed by surface health, watch-run, watch clock, gateway lane, and loop-guard status. `shrimpy status` uses the same liveness collector.
- `shrimpy watches` reports source paths, target channels, expected wake, next runs, active runs, and recent run history.
- `shrimpy gateway logs` reads `workspace/runtime/logs/gateway.log`.
- `shrimpy context` inspects the assembled session prompt, per-turn context, and user message body for an agent/session/turn.
