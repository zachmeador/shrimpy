# 🦐 Runtime

Shrimpy has one Pi session core hosted by foreground commands, the gateway, setup, and workers. Hosts share the workspace, resolver, model runtime, auth and catalog state, context assembly, skills, and tool surface; delivery and persistence are explicit session policy. See [channels.md](channels.md) for channel semantics, [sessions.md](sessions.md) for identity and lifecycle, and [tools.md](tools.md) for the split between native Pi built-ins and Shrimpy daemon tools.

## Direct CLI Sessions

`shrimpy` resumes terminal chat, `shrimpy chat <agent>` selects an agent, and `shrimpy run "prompt"` runs one prompt. Local sessions answer with ordinary assistant text. See [sessions.md](sessions.md) for selection, persistence, models, thinking, and TUI controls.

Normal TUI launchers require a ready workspace; [setup.md](setup.md#setup) describes onboarding. Durable interactive preferences are documented in [configuration.md](configuration.md#interactive-preferences).

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

For CLI-injected channel traffic: `shrimpy channels post <channel> <text>`. Add `--agent <id>` to stamp `origin.addressedAgentId`; the addressed agent still needs channel visibility and a policy that wakes for it.

Gateway sessions use the same agent cwd, model resolution, context assembly, and owner leases as direct sessions. See [sessions.md](sessions.md) and [context-assembly.md](context-assembly.md).

## Background Work

- A watch is an agent-owned background attention rule in `agents/<id>/watches.json`: a `trigger` (time is the implemented kind), a concurrency policy, and either a message action or a command action. Config shapes live in [configuration.md](configuration.md).
- Message watches emit watch-authored channel messages; the owning agent needs channel membership and a `channelPolicy` that wakes for them. Command watches run a shell command and can emit to a channel based on `emit.policy`.
- Watch-origin messages carry provenance in `origin.watch`, and turn context points back to `shrimpy watches show <watch-id>` and `shrimpy watches history <watch-id>`.
- The gateway loads and reloads each agent's `watches.json` independently. An invalid file leaves that agent with no watches at startup; a failed reload keeps its last valid watches while other agents continue normally. Fixing the file applies it without a gateway restart, while an empty or removed file unregisters that agent's watches. Unchanged schedules retain their clock state.
- `shrimpy watches` reports per-agent load failures with the agent ID and source path. Error details are sanitized so watch contents, commands, and secrets do not enter diagnostics. Active watch state and run history live under `runtime/watches/<agent-id>/`.
- Next-run timestamps persist in `state/watch-clock.json`. A watch whose scheduled time passed while the gateway was down runs once on the next start, carrying its original fire time, then resumes its schedule. Missed runs do not stack up: a watch due several times during a long outage still runs once. This covers downtime only; a crash after a watch message reached its channel is covered in [channels.md](channels.md).
- Setup offers optional upkeep and audit routines through the included `shrimpy-watches-default-init` skill. It creates only selected watches, initially disabled, and enables only those the user approves.
- Coding worker delegation runs through `shrimpy worker ...` commands and worker records.

## Observability

- `shrimpy status` summarizes workspace and gateway activity.
- `shrimpy gateway status` reports PID/heartbeat-backed gateway process health separately from service-manager state, followed by surface health, watch-run, watch clock, gateway lane, and loop-guard status. `shrimpy status` uses the same liveness collector.
- Gateway lane outcomes include `reply-recovery=reviewed`, `woke`, or `failed` when the channel reply watchdog ran.
- `shrimpy watches` reports source paths, load failures, target channels, expected wake, next runs, active runs, and recent run history.
- `shrimpy gateway logs` reads `workspace/runtime/logs/gateway.log`.
- `shrimpy context` inspects the assembled session prompt, per-turn context, and user message body for an agent/session/turn.

## Reply Recovery

After a human-authored channel turn finishes without publishing a visible reply, the gateway makes one bounded review call using the active model. It can leave the turn alone or give the same session one reminder to publish, recorded as `[shrimpy:channel-reply-recovery]`. Review and recovery each run at most once for the source message; reviewer failure leaves the original turn intact.

Agent- and system-authored turns skip review. Direct sessions answer locally and do not use reply recovery. Gateway lane diagnostics report whether review ran, woke the agent, or failed.
