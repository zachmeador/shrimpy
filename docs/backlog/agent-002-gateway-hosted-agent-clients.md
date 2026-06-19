# 🦐 AGENT-002: Gateway-Hosted Agent Clients

Status: draft
Priority: P2
Area: Agents
Depends On: none

## Why

Shrimpy should keep one daemon process, `shrimpy gateway`, while making the agent the real runtime boundary inside that process. Conceptually, each agent is a client connected to rich IRC-like rooms: it participates in channels, owns its watches, decides whether channel messages wake it, and runs private model/tool work in sessions.

The current implementation mostly has the right pieces, but the shape is described and wired around gateway-level delivery and gateway-level watch running. That makes the gateway sound like the owner of agent attention. The gateway should host agent clients and shared infrastructure; it should not be the semantic place where product rules decide which message classes matter.

## Target Shape

```text
shrimpy gateway
  ChannelBus / ChannelStore
    durable rich channel rooms

  ChannelAppendPump
    cursors, backlog, per-channel ordering, visibility fanout

  SharedWatchClock
    schedule calculation and due-run timer

  Surfaces
    append inbound transport messages to channels

  AgentClient(shrimpy)
    channel visibility and wake policy
    watches owned by shrimpy
    private SessionRegistry for model/tool work
    handled-message state adapter and activity hooks

  AgentClient(mechanic)
    channel visibility and wake policy
    watches owned by mechanic
    private SessionRegistry for model/tool work
    handled-message state adapter and activity hooks

  Outbox
    delivers eligible public channel messages through bound surfaces
```

The gateway process is still one process. The change is the internal ownership boundary: agent behavior lives under `AgentClient`, while the gateway process hosts clients, surfaces, the channel store, shared clocks, channel append pumping, and outbound delivery. Host infrastructure is deliberately shared: agents do not each tail channel files, own their own channel cursors, or run separate watch clocks.

## Current State

- `ChannelDeliveryLoop` owns the main channel-log dispatch loop, builds one `AgentChannelRuntime` per agent, looks up channel members, and calls each runtime.
- `AgentChannelRuntime` owns an agent's channel policy evaluation and `SessionRegistry`, but not the agent's watches.
- `startGatewayWatchClock` loads all agents' `watches.json` files from the gateway level and runs due watches through a shared clock.
- Watches are stored under `agents/<id>/watches.json` and publish channel messages with watch provenance.
- Gateway backlog dispatch skips watch messages before agent policy sees them.
- Watch inspection already samples watch-origin messages through `evaluateAgentChannelPolicy`; the missing runtime gap is dispatch/backlog ownership and first-class explainability from the same policy path.
- Session control messages still reach per-agent runtimes through `SessionControlRuntime`, which is owned by the delivery loop. Keep this coordinated with `SESSION-003` rather than folding session lifecycle verification into this item.
- Sessions are private Pi contexts where the model thinks, calls tools, inspects state, edits files, and produces artifacts. Channel messages are only what someone intentionally posts.

## Remove

- Remove `ChannelDeliveryLoop` as the semantic owner of agent dispatch. It can be replaced by host plumbing, but agent channel handling belongs to `AgentClient`.
- Remove gateway-level watch running as a conceptual product layer. A shared clock can remain as infrastructure, but watches run in the owning agent client's scope.
- Remove the implicit backlog rule that treats watch messages as non-dispatchable because they are watches.
- Remove docs language that says the gateway “offers” messages to agents as though attention belongs to the gateway.
- Remove docs wording that makes watches sound like a parallel delivery path.
- Remove fuzzy wording that sessions are only private thinking rather than private model and tool work.

## Keep

- Keep one `shrimpy gateway` daemon.
- Keep channels as durable typed room logs under `workspace/channels/`.
- Keep surfaces as transport bridges that append inbound channel messages and deliver outbound eligible messages.
- Keep channel membership storage in channel config/state. Membership is visibility, not wake policy, and `AgentClient` must not become a second membership store.
- Keep one host-level channel append pump for cursors, backlog draining, and per-channel ordering. `AgentClient` receives visible events; it does not tail channel files independently.
- Keep one shared watch clock as scheduling infrastructure. `AgentClient` owns watch definitions and due-run handling, not clock mechanics.
- Keep `channelPolicy` as the wake decision shape for now: `wake | ignore`.
- Keep watches in `agents/<id>/watches.json`.
- Keep sessions as private model/tool work contexts, not public communication logs.
- Keep the outbox as the bridge from bound channel messages to external surfaces.
- Keep Shrimpy leaning on Pi for model calls, tool execution, and transcript persistence.

## Change

- Introduce an `AgentClient` runtime boundary inside `shrimpy gateway` by renaming/extracting the current `AgentChannelRuntime` shape rather than inventing a second runtime model.
- Move agent channel handling, channel policy evaluation, session dispatch, handled-message state adapter, activity hooks, watch loading, and watch due-run handling under `AgentClient`.
- Make the gateway construct and host one `AgentClient` per resolved agent.
- Turn `ChannelDeliveryLoop` into neutral host plumbing, likely named around channel appends rather than delivery. It should own cursors, backlog draining, per-channel ordering, membership visibility fanout, and any still-needed session-control routing, but not product rules about message classes.
- Make watch loading/reloading per-agent: each `AgentClient` owns its `watches.json` definitions and registers resolved watches with shared clock infrastructure.
- Run due watches through the owning `AgentClient`; a watch can still publish a channel message, and that message then follows the ordinary channel path.
- Make watch backlog behavior explicit: watch-origin messages are live-only by default unless the emitted message opts into backlog dispatch with a still-valid `expiresAt` or explicit `dispatchBacklog` field. Do not keep a hidden gateway class check.
- Update inspection so `shrimpy agent channel-policy explain ...` or an equivalent command can demonstrate a watch-origin decision using the same sampled-message shape that `shrimpy watches show` already uses for expected wake.
- Update gateway/session/channel state inspection to name agent clients where useful: active sessions, watched channels, loaded watches, and handled-message state should read as per-agent runtime state.

## Boundaries

- No separate agent processes.
- No new attention framework or richer decision model beyond current `wake | ignore`.
- No new channel config semantics.
- No per-agent channel tailers, duplicated channel cursors, duplicated per-channel append queues, or separate watch clocks.
- No surface adapter rewrite.
- Do not move channel membership storage into `AgentClient`.
- Do not make channels carry private tool traces or private model work.
- Do not make channels into job schedulers, lock managers, retry queues, or worker lifecycle stores. Long-running work may post status messages to channels, but execution state belongs elsewhere.
- Do not add backward-compatibility or migration paths unless the implementation explicitly chooses a persisted format change that requires one.

## Touches

- `src/gateway/channel-delivery-loop.ts`
- `src/gateway/watch-service.ts`
- `src/agents/channel-runtime.ts`
- `src/agents/channel-policy.ts`
- `src/sessions/registry.ts`
- `src/watches/`
- `src/gateway/runtime-state.ts`
- `src/commands/agent-channel-policy.ts`
- `test/channel-delivery-loop.test.ts`
- `test/agent-channel-runtime.test.ts`
- `test/gateway-watch-service.test.ts`
- `test/watches-command.test.ts`
- `docs/reference/architecture.md`
- `docs/reference/channels.md`
- `docs/reference/runtime.md`
- `docs/reference/sessions.md`

## Done

- `shrimpy gateway` hosts one `AgentClient` per resolved agent.
- Each `AgentClient` owns channel policy evaluation, session dispatch, handled-message state, activity hooks, and that agent's watches.
- The host channel append pump has no hidden watch-message class check. Watch-origin messages follow the ordinary live channel path, and backlog replay follows the explicit live-only-by-default stale/backlog contract.
- Watch loading and reload diagnostics are reported per owning agent.
- The shared watch clock schedules due runs once, then routes each due run to the owning `AgentClient`.
- Channel and gateway inspection describe agent runtime state in terms of agent clients, not gateway-owned attention.
- Reference docs describe the shape accurately: channels are rich rooms, agents are gateway-hosted clients, watches are agent-owned message producers, sessions are private model/tool work contexts, and the gateway is the host process.
- Tests cover human, agent, surface, CLI, system, and watch-origin messages reaching the same agent-client policy evaluator; live watch-origin dispatch through membership and policy; watch runs happening in the owning agent client scope; watch reloads preserving shared clock state; and the explicit watch backlog contract.
