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
- For a scheduled or recurring message, choose the destination channel first, then create a watch that runs the task and sends one final user-facing message there.
- For agent participation in an existing room or log, join the agent and check channel policy.
- For external delivery, use an existing bound channel when one fits. Create or bind a channel only when no suitable route exists.
- For internal trace only, use a simple workflow channel name and leave it unbound unless the user asked for outside delivery.

## Scheduled Message Pattern

1. If the user says to message them here or in the same chat, use the request's current channel. If the current channel is unclear, inspect existing channels before choosing.
2. Confirm the owner agent can receive work on that channel with `shrimpy channels members <channel>` and `shrimpy agent channel-policy <agent> --channel <channel>`.
3. If the agent is not a member, join it with `shrimpy channels join <channel> --agent <agent> --json`.
4. Use `shrimpy-watches` to create the schedule. The watch message should tell the agent what to do and to send exactly one final user-facing message to the target channel.
5. After a safe test run, inspect the channel and watch history before telling the user it is done.

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
```

## Guardrails

- Channels route and log messages. Sessions, commands, and watch messages carry task instructions.
- Do not make up channel names that look like generated chat adapter names. Use the current channel, an existing channel from `shrimpy channels`, or a route created by the surface/channel CLI.
- Do not bind external delivery just to organize internal work.
- Do not assume channel membership means the agent wakes; check policy.
- Do not assume a channel post reaches an outside chat; check that the channel has an external binding and that the message is allowed to send outward.
