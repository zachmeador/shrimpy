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

Important runtime guards:

- an agent is not re-offered its own agent-authored channel messages
- a message addressed to another agent is ignored even if this agent can see the channel
- addressing and mentions do not route around membership
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

## Reading And Search

Channels are inspectable through the CLI:

```bash
shrimpy channels
shrimpy channels show <name>
shrimpy channels read <name>
shrimpy channels search <name> [query]
shrimpy channels tail <name>
```

`channels search` can filter by message kind, sender kind, transport, actor id, content type, addressed agent, watch id, and source kind. `channels show` summarizes membership, message kind counts, recent request-like messages, and traceable source records.

## Publication And Egress

Gateway channel sessions do not automatically publish assistant text to a channel. Agent-visible responses use active-channel helpers:

- `reply(text)`
- `ask(text)`
- `notify(text, opts)`
- `report(summary)`

Those helpers log an agent message to the active channel and then deliver externally only when a surface adapter route matches the channel. Direct local `tui` and `run` sessions do not have an active publication channel, so these helpers are not registered there.

`send_message(channel="...", text="...")` is the explicit lower-level routing tool. It can publish to any channel the agent intentionally names, including agent DMs. Agent DM channel names are canonical sorted names like `dm~agent-a~agent-b` and are internal channels unless an adapter is deliberately configured for them.

## Watches

Message watches emit ordinary watch-authored channel messages. The target channel records the watch work, and the owner/target agent still needs both channel visibility and an agent channel policy that wakes for the watch message. Command watches can also emit channel messages when their `emit.policy` matches the command observation.

Inspect watch delivery with:

```bash
shrimpy watches
shrimpy watches show <agent-id>/<watch-id>
shrimpy watches history <agent-id>/<watch-id>
shrimpy channels search <channel> --kind watch
```

## Boundaries

- Channels are append-only shared logs.
- Sessions are private working contexts.
- Membership is visibility, not wake policy.
- Agent channel policy owns wake and response behavior.
- Addressing is policy input, not a membership bypass.
- Surface adapters translate external transport messages into typed channel messages and translate published channel messages back out.
