# 🦐 MCP Events and Shrimpy's Triggers

Researched on 2026-10-04 by a read-only scout, for the question: should Shrimpy's triggers follow the conventions on OpenAI's [MCP Events page](https://developers.openai.com/plugins/build/mcp-events)? Triggers are phase 4 of the [plan](../REDESIGN/PLAN.md#4-triggers-and-helpers) and nothing is built yet.

The claims in the first two sections about the OpenAI page and the working group's repo were read a second time against those two sources. Everything else rests on the scout's reading of the sources it links.

## Answer

Don't align now. The convention covers one thing Shrimpy's triggers don't have, events pushed by an outside app, and none of what phase 4 builds: times, intervals and command checks. The one delivery mode ChatGPT supports needs a public HTTPS endpoint, and Shrimpy's agents take nothing inbound. The design is a working group's draft, not part of the MCP specification, and Pi's MCP client doesn't speak the protocol version it needs.

Two things are worth taking from it today, and neither needs MCP:

- **What a trigger brings in is data, not instructions.** OpenAI's page, the draft and Claude Code's channels all say so. It applies to a command check's output now: old Shrimpy pasted a command's output into a message that its skill called an instruction to the agent.
- **An occurrence carries an ID from its source and a payload kept apart from the trigger's own prompt.** The plan's stable occurrence IDs and source namespaces already allow it.

Revisit when all three hold: events are in an accepted proposal or a spec revision, `pi-mcp` speaks protocol `2026-07-28`, and there is a specific server whose events an agent should react to.

## The design

OpenAI's page is a guide for plugin builders. It says how ChatGPT subscribes to events on an MCP server and receives them as signed webhooks.

- **Scope.** Webhook delivery and callback verification only. Polling, streaming and the draft's control notifications are not supported. It requires MCP protocol version `2026-07-28`.
- **Declaring.** The server lists an `events` capability in its `server/discover` result and implements `events/list`, `events/subscribe` and `events/unsubscribe`. Each event type has a name, a description, its delivery modes, a schema for the subscription's arguments and a schema for the payload.
- **Subscribing.** The subscriber sends the event's name, its arguments, a callback URL with a secret, a cursor and an optional lifetime. The server checks the user's access, verifies the callback with a signed challenge, and answers with an ID and a time to refresh by. Subscribing again with the same arguments updates the same subscription.
- **Delivery.** One POST per event with `eventId`, `name`, `timestamp`, `data` and `cursor`, signed with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) headers. A 2xx only acknowledges it. ChatGPT may merge nearby events into one run.
- **Callbacks.** HTTPS only. Private, local and other non-public addresses are blocked, and redirects aren't followed.
- **Failure.** The sender retries with backoff and the same event ID, so the receiver has to tolerate duplicates. Events can arrive out of order. A receiver that was offline resumes from its cursor where the event type keeps history, and loses the events where it doesn't.
- **Authority.** The subscription belongs to a principal. The server re-checks access while it lasts and stops delivering when access is revoked.
- **Payloads.** Keep them small and offer a tool to read the rest. Treat text a user wrote as data, and put no instructions for the model in a payload.

## Whose convention it is

- **A draft.** The page builds on a [design sketch](https://github.com/modelcontextprotocol/experimental-ext-triggers-events/blob/main/docs/design-sketch-proposal.md) in the MCP Triggers and Events working group's [incubation repo](https://github.com/modelcontextprotocol/experimental-ext-triggers-events), whose README says its contents are exploratory and not official MCP specifications. The group is led by Clare Liguori (AWS) and Peter Alexander (Anthropic). The sketch has three delivery modes, none mandatory: poll, push and webhook. ChatGPT implements the webhook one.
- **Not in the spec.** [MCP `2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28/changelog) has no events. It has `subscriptions/listen` for list changes and resource updates over an open stream, with no replay. Events have no proposal number yet ([conformance PR 504](https://github.com/modelcontextprotocol/conformance/pull/504), 2026-09-15; [TypeScript SDK issue 2945](https://github.com/modelcontextprotocol/typescript-sdk/issues/2945), 2026-10-02). The [roadmap](https://modelcontextprotocol.io/development/roadmap) lists server-initiated events as a priority.
- **Still moving.** Where the capability is declared is disputed ([PR 7](https://github.com/modelcontextprotocol/experimental-ext-triggers-events/pull/7), closed unmerged on 2026-09-28), and a long-polling mode is proposed ([PR 5](https://github.com/modelcontextprotocol/experimental-ext-triggers-events/pull/5)).
- **Who implements it.** ChatGPT is the only production client the scout found. Neither official SDK supports it yet ([Python issue 3640](https://github.com/modelcontextprotocol/python-sdk/issues/3640)). A few servers do, each offering webhooks only. The closest comparable is [Everruns](https://github.com/everruns/everruns/blob/main/knowledge/integrations/mcp-events.md), an open-source durable agent harness that added event triggers and outbound session events behind an experimental flag on 2026-09-30 and 2026-10-01.
- **A different convention exists.** Claude Code's [channels](https://code.claude.com/docs/en/channels-reference) let an MCP server push a notification into an open session, where the model sees it in a tag. Its reference says a channel that doesn't check senders is a way to inject instructions.

## What Pi's maintainers have said

Nothing about this design was found. What was found is about MCP tools:

- [Mario Zechner, 2025-11-02](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/): his objections were the context cost of large tool lists and tools that don't compose.
- [Pi PR 10040](https://github.com/earendil-works/pi/pull/10040), merged 2026-09-29: the team has mixed feelings about MCP, finds some uses of it responsible, and adds it as optional.
- [Earendil, "You Said No MCP!"](https://earendil.com/posts/you-said-no-mcp/), 2026-09-29: MCP changed, composition is still its weak point, and they chose to join and shape it.
- [Mario on Hacker News, 2026-10-01](https://news.ycombinator.com/item?id=49926840): a recent spec update made MCP much less bad, and with codemode it is acceptable.

So the change of heart is real and recent, and it concerns tools. The scout couldn't search X, Bluesky, Mastodon, Discord or podcasts, so a remark about events there would have been missed.

In the code: `pi-mcp` 1.0.0 is a client for protocol `2025-11-25` and rejects other versions. Pi's conformance notes say `2026-07-28` isn't implemented. A request to support it ([issue 10416](https://github.com/earendil-works/pi/issues/10416), 2026-10-03) was closed by a bot with no maintainer reply. `pi-durable` has no cron, trigger, webhook or subscription feature.

## How it fits Shrimpy

| | Shrimpy's plan | MCP events |
|---|---|---|
| What is defined | A trigger: a schedule or a check, an action and a target thread | An event type on a server, and a subscription to it |
| One firing | An occurrence with a stable trigger and occurrence ID | An event with an ID the source gives it |
| Schedules | Cron and intervals | None |
| Command checks | Run a command and act on its output | None in what ChatGPT supports |
| What wakes an agent | The trigger fires into a thread, and the agent's wake policy applies | Left to the application |
| Duplicates | A request ID's first use wins | The receiver ignores an event ID it has seen |
| While offline | A stopped agent runs no triggers | Replay from a cursor, where the source keeps history |
| Inbound endpoint | None, by design | A public HTTPS receiver |

The overlap is one row: a firing with a stable ID and a payload.

## What aligning could mean

- **Words and shapes only.** Give an occurrence an ID from its source, a timestamp and a data payload. Cheap, and the plan mostly has it. A cron tick is still not an event in MCP's sense.
- **Agents take events from MCP servers.** This needs a client for `2026-07-28`, which Pi doesn't have, and a public HTTPS receiver. A gateway reachable only over Tailscale wouldn't do as the callback: servers are told to block addresses that aren't public, and Tailscale's range is one of them. It also needs a secret and a cursor per subscription that survive restarts, a refresh loop, and signature checks. It would be the first path by which a stranger's text reaches an agent that has a shell.
- **Shrimpy offers its own events.** This needs an MCP server role with OAuth, outbound delivery to callbacks, a subscription store and access re-checks. No need for it has been stated: Shrimpy's own clients already subscribe through Pi's protocol.

**Where it would go.** In the plan's words a trigger is a time, an interval or a check. An event from an outside app is none of those. It is closer to a message from an outside app, which is a chat provider's job: the chat server already owns webhooks, sender mapping and burst merging, can run on a machine with a public address, and leaves the agent with nothing inbound. The agent's wake policy would decide what to do with it, as it does for chat. If outside events are ever wanted, that is where to start.

## Risks

- **A moving draft.** Three delivery modes, a disputed capability location, and early defects on ChatGPT's side ([codex issue 49665](https://github.com/openai/codex/issues/49665), [50714](https://github.com/openai/codex/issues/50714)).
- **One client.** The authorship is shared across vendors, but only ChatGPT consumes it in production, and only a subset.
- **Injection.** An event's data can carry text an attacker wrote, and so can whatever the agent fetches next. The draft says receiving an event grants no authority to act.
- **Subscriptions outlive attention.** A subscription is a record a server keeps under a user's token. A forgotten one keeps delivering until it expires or is ended.

## Open questions

- Is there a specific app whose events an agent should react to? If so, would a command check that polls it do?
- Is "agents take nothing inbound" firm? It decides whether webhook sources are ever possible without a relay.
- The plan's triggers row promises one coalesced overdue run and also says a restart doesn't backfill. Old Shrimpy ran a missed watch once at the next start. Phase 4 has to say which is meant.

## Unverified

- Where the remark that Pi's developers like this design came from.
- OpenAI's own announcement: its DevDay pages were behind a challenge the scout didn't try to pass. The launch date of 2026-09-29 and the word "proposed" come from a [vendor's blog](https://workos.com/blog/mcp-events-chatgpt-subscription-revocation).
- How ChatGPT hands an event to the model.
- Whether `pi-mcp` could be made to speak the newer protocol: its handshake was read, not tested.
- The servers that say they implement events: their docs were read, and none was run.
