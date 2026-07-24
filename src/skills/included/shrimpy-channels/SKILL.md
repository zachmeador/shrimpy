---
name: shrimpy-channels
description: Use when choosing where Shrimpy messages go, why an agent did or did not see or wake on a channel, or how chat surfaces connect to channels.
---

# Shrimpy Channels

Use this skill when an agent needs to choose, inspect, or fix message routing. If the user asks for recurring work, use `shrimpy-watches` for the schedule after choosing the destination channel.

Use the paths in `context/WORKSPACE.md`. For detail, use:

- `reference/channels.md` — channel logs, membership, wake policy, addressed messages.
- `reference/surfaces.md` — chat surface adapters and external delivery bindings.
- `reference/cli.md` — current `shrimpy channels` and `shrimpy surface` commands.

## Decide

- For an immediate answer in the current conversation, use `reply`; do not create or bind a channel.
- For scheduled or recurring work, choose both the channel where the owner agent wakes and the user-facing delivery destination. They may be different.
- Prefer a dedicated bot or surface instance when an agent regularly talks with the user. For an occasional report from a background or support agent, use the user's established primary chat instead of creating a bot solely for that report; the surface identifies the non-default sender.
- For agent participation in an existing room or log, join the agent and check channel policy.
- For external delivery, use an existing bound channel when one fits. Create or bind a channel only when no suitable route exists.
- For internal trace only, use a simple workflow channel name and leave it unbound unless the user asked for outside delivery.

## Scheduled Message Pattern

1. Choose an execution channel where the owner agent should wake. If the user asked for the result in the same conversation and the owner agent already belongs there, the current channel can serve as both execution and delivery.
2. For an occasional cross-agent report, prefer an internal execution channel and a separate established user destination. Inspect `shrimpy users presence` for a stable `user:<id>` route or use a concrete bound channel the user chose.
3. Confirm the owner agent can receive work on the execution channel with `shrimpy channels members <channel>` and `shrimpy agent channel-policy <agent> --channel <channel>`.
4. If the agent is not a member, join it with `shrimpy channels join <channel> --agent <agent> --json`.
5. Use `shrimpy-watches` to create the schedule. Tell the agent to publish exactly one final user-facing message with `reply` when execution and delivery share a channel, or with `send_message` to the explicit destination when they differ.
6. After a safe test run, inspect the channel and watch history before telling the user it is done.

## Inspect Or Fix

1. Read the channel and manifest before changing it: `shrimpy channels show <channel>` and `shrimpy channels read <channel> --limit 20`.
2. Check who can see the channel: `shrimpy channels members <channel>`.
3. Check whether a message would wake the agent: `shrimpy agent channel-policy explain <agent> --channel <channel> --sender human --text "..." --json`.
4. For outside delivery, inspect configured surfaces and existing bindings before adding a new route.
5. Use CLI commands for joins, binds, unbinds, and surface assignment. Avoid hand-editing routing state.

## Commands

```bash
shrimpy channels
shrimpy channels show <channel>
shrimpy channels members <channel>
shrimpy channels read <channel> --limit 20
shrimpy channels search <channel> "<query>" --limit 20
shrimpy channels create <channel>
shrimpy channels join <channel> --agent <id> --json
shrimpy channels post <channel> --agent <id> "<message>"
shrimpy channels dm <agent-a> <agent-b>
shrimpy channels bind <channel> <adapter>/<instance>/<thread>
shrimpy channels unbind <channel>
shrimpy surface
shrimpy surface show <surface> <thread-id>
shrimpy surface set-agent <surface> <thread-id> <agent> --json
shrimpy users presence
```

## Guardrails

- Channels route and log messages. Sessions, commands, and watch messages carry task instructions.
- Do not make up channel names that look like generated chat adapter names. Use the current channel, an existing channel from `shrimpy channels`, or a route created by the surface/channel CLI.
- Do not bind external delivery just to organize internal work.
- Do not assume channel membership means the agent wakes; check policy.
- Do not assume a channel post reaches an outside chat; check that the channel has an external binding and that the message is allowed to send outward.
- Do not present an occasional cross-agent delivery as if it came from the surface's default agent; preserve the real agent sender and let the surface apply attribution.
