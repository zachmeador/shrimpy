# 🦐 Channels

Channels are durable shared rooms. They carry messages, provenance, routing facts, and evidence. Sessions do the private thinking; channels are the shared communication record.

A channel can represent a home chat, a surface thread, an agent DM, a group, a system feed, a work log, or a watch target. Channel logs live as append-only JSONL files under `workspace/channels/`.

## Message Protocol

Each channel message has:

```json
{
  "id": "...",
  "timestamp": 1760000000000,
  "sender": {
    "kind": "human",
    "actorId": "human:alice",
    "userId": "alice",
    "displayName": "Alice"
  },
  "origin": {
    "transport": "telegram",
    "sourceChannel": "telegram~main~123",
    "transportUserId": "123456789",
    "transportChatId": "123",
    "addressedAgentId": "shrimpy"
  },
  "content": {
    "type": "text",
    "data": { "text": "hello" }
  }
}
```

`sender` identifies who authored the message in Shrimpy terms:

- `kind` is `human`, `agent`, or `system`.
- `actorId` is the stable Shrimpy actor id used by policy and search.
- `userId` and `displayName` are optional stable human identity fields.

`origin` records where the message came from and how it should be interpreted:

- `transport` is a producer label such as `cli`, `internal`, `watch`, or a surface name such as `telegram`.
- `sourceChannel` points back to the source channel when a message is relayed or published.
- `transportUserId` and `transportChatId` keep transport ids out of agent policy.
- `addressedAgentId` is addressing metadata for visible agents to evaluate.
- watch-origin messages can also carry `watchId` and `watch` provenance.

`content.type` is one of `text`, `image`, `image_group`, `unsupported_media`, or `system`. Publication helpers such as `reply`, `ask`, `notify`, and `report` publish `text` messages with a `content.data.publication` intent. Session reset, restore, and thinking-level control messages are `system` messages in the channel log.

## Membership

Channel membership lives in `config/channels.json`:

```json
{
  "channels": {
    "home": {
      "agents": {
        "shrimpy": {},
        "mechanic": {}
      }
    }
  }
}
```

Membership means an agent can see the channel. It does not decide whether the agent wakes for every message. The gateway offers new channel messages to member agents, then each agent's own `channelPolicy` decides whether a visible message becomes a turn.

Default membership is resolved at runtime for a few channel classes:

- `home` includes the configured default agents from setup; when a channel is created without stored membership, Shrimpy falls back to the default agent or first configured agent.
- `dm~agent-a~agent-b` includes those two agents when they exist.
- surface channels may inherit a surface default agent from surface config.

Use:

```bash
shrimpy channels create <name>
shrimpy channels members <name>
shrimpy channels join <name> --agent <id>
shrimpy channels leave <name> --agent <id>
shrimpy channels dm <agent-a> <agent-b>
```

## Agent Channel Policy

Wake policy is agent-owned config under `agents[].channelPolicy`, not channel membership. The default policy is:

```json
{
  "mode": "all"
}
```

Modes:

- `all` wakes for all visible messages after sender filters.
- `mentions` wakes for messages addressed to the agent or containing a single `@agent` mention.
- `addressed` wakes only for messages with `origin.addressedAgentId` equal to this agent id.
- `none` ignores visible channel messages.

Policy can narrow by sender kind, stable `actorIds`, stable `userIds`, and channel pattern:

```json
{
  "id": "shrimpy",
  "channelPolicy": {
    "mode": "none",
    "channels": {
      "hangout": {
        "mode": "all",
        "senders": ["human"],
        "userIds": ["cool-dude"]
      }
    }
  }
}
```

That example lets the agent be a member of `hangout`, where multiple agents and senders may publish, but wake only for visible human messages from the stable user `cool-dude`. If a producer does not stamp `userId`, use the stable `actorId` instead, for example `human:cool-dude`.

Runtime guards worth knowing:

- an agent is not re-offered its own agent-authored channel messages
- a message addressed to another agent is ignored even if this agent can see the channel
- `mode: "none"` wins over addressing and mentions

Inspect and test policy with:

```bash
shrimpy agent channel-policy <id> --channel <name>
shrimpy agent channel-policy explain <id> --channel <name> --sender human --text "@shrimpy hello"
shrimpy agent channel-policy set <id> --channel hangout --mode all --senders human --user-ids cool-dude
```

## Addressing

`origin.addressedAgentId` is a message fact, not delivery authorization. It can come from a surface thread state, CLI injection, or watch target metadata.

This supports a one-visible-account pattern:

- the user sees one bot/account
- the surface tracks the currently addressed internal agent for that thread
- follow-up messages carry the addressed-agent metadata
- channel membership stays stable
- each visible agent evaluates that metadata through its own policy

Commands:

```bash
shrimpy channels post <channel> --agent <id> <text>
shrimpy surface show <surface> <thread-id>
shrimpy surface set-agent <surface> <thread-id> <agent>
shrimpy surface clear-agent <surface> <thread-id>
```

For routed surface threads, `surface set-agent` joins the selected agent to the concrete channel when needed and logs a `surface_addressing` status entry. `surface clear-agent` logs the clear event too. These entries make handoffs inspectable without waking agents as work.

## Reading And Search

Channels are inspectable through the CLI:

```bash
shrimpy channels
shrimpy channels show <name>
shrimpy channels read <name>
shrimpy channels search <name> [query]
shrimpy channels tail <name>
```

`channels search` can filter by message kind, sender kind, transport, actor id, content type, addressed agent, watch id, and source kind. `channels show` summarizes membership, manifest kind, transport binding, outbound delivery receipts, message kind counts, recent request-like messages, and traceable source records.

With `--json`, inspected messages in search results, `lastMessage`, `activity.recentRequests`, and `activity.sourceRecords` use one shape. Transport, run id, and source channel live on `origin`; trace-specific fields are `sourceId`, `targetChannel`, and `inspectCommands`.

## Publication And Egress

Gateway channel sessions do not automatically publish assistant text to a channel. Agent-visible responses use active-channel helpers:

- `reply(text)`
- `ask(text)`
- `notify(text, opts)`
- `report(summary)`

Those helpers append an agent message to the active channel. The gateway outbox delivers only outbound-eligible channel records externally when the channel manifest has a transport binding: agent text/media, command-watch text emissions, and operation-status acknowledgements. Message-watch instruction text, arbitrary system text, control records, system records, and informational statuses remain channel history for CLI inspection. Direct local `tui` and `run` sessions do not have an active publication channel, so these helpers are not registered there.

`send_message(channel="...", text="...")` is the explicit lower-level routing tool. It can publish to any channel the agent intentionally names, including agent DMs. Agent DM channel names are canonical sorted names like `dm~agent-a~agent-b` and are internal channels unless they are deliberately bound to a transport. `user:<id>` is accepted as a send-time alias for the user's last active chat surface; the message is logged to the resolved concrete channel, not to a `user:<id>` channel file.

Use `shrimpy channels bind <channel> <adapter>/<instance>/<thread>` to attach a named Shrimpy channel such as `home` or `daily-practice` to an external transport. `unbind` removes the transport binding without renaming the channel or changing its history.

`shrimpy channels post user:<id> <text>` uses the same alias resolver for operator-injected human messages. Inspect current alias targets with `shrimpy users presence`.

## Watches

A message watch writes a normal channel message. Delivery is not special-cased: the target agent wakes only if it has visibility into the channel and a `channelPolicy` that wakes for watch messages.

Watch text is trigger material for the agent, not output for the user. What the user sees comes from the agent's own `reply`, `ask`, `notify`, `report`, or `send_message` call afterward.

Backlog replay skips watch-origin messages, so a watch wakes an agent only when the delivery loop sees the message live. Ordinary channel messages replay normally. This splits restart behavior into two cases:

- **Gateway was down when a watch came due.** The run survives. The watch clock persists next-run times and fires it on the next start; see [runtime.md](runtime.md).
- **Gateway crashed after the watch message was written.** The wake is lost. Skipping replay keeps instructions tied to a past moment from running late, and that applies to a message written moments before the crash too. The message stays in channel history and in `channels read` and `channels search` output.

Inspect watch delivery with `shrimpy watches show <agent-id>/<watch-id>` and `shrimpy channels search <channel> --kind watch`.
