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

- For an immediate answer, use ordinary assistant text in local TUI/run sessions and `reply` in an active channel conversation. No new channel or binding is needed.
- For scheduled or recurring work, choose both the channel where the owner agent wakes and the user-facing delivery destination. They may be different.
- Prefer a dedicated bot or surface instance when an agent regularly talks with the user. For an occasional report from a background or support agent, use the user's established primary chat instead of creating a bot solely for that report; the surface identifies the non-default sender.
- For agent participation in an existing room or log, join the agent and check channel policy.
- For external delivery, use an existing bound channel when one fits. Create or bind a channel only when no suitable route exists.
- For internal trace only, use a simple workflow channel name and leave it unbound unless the user asked for outside delivery.

## Scheduled Message Pattern

Use `shrimpy-watches` to choose an execution channel, verify the owner's membership and wake policy, create the schedule, and test delivery. For occasional cross-agent reports, inspect `shrimpy users presence` for an established `user:<id>` destination. The execution channel and user-facing destination may differ.

## Inspect Or Fix

1. Read the channel and manifest before changing it: `shrimpy channels show <channel>` and `shrimpy channels read <channel> --limit 20`.
2. Check who can see the channel: `shrimpy channels members <channel>`.
3. Check whether a message would wake the agent: `shrimpy agent channel-policy explain <agent> --channel <channel> --sender human --text "..." --json`.
4. For outside delivery, inspect configured surfaces and existing bindings before adding a new route.
5. Use CLI commands for joins, binds, unbinds, and surface assignment. Avoid hand-editing routing state.

Use `shrimpy channels --help` and `shrimpy surface --help` for command discovery and exact options.

## Guardrails

- Channels route and log messages. Sessions, commands, and watch messages carry task instructions.
- Do not make up channel names that look like generated chat adapter names. Use the current channel, an existing channel from `shrimpy channels`, or a route created by the surface/channel CLI.
- Do not bind external delivery just to organize internal work.
- Do not assume channel membership means the agent wakes; check policy.
- Do not assume a channel post reaches an outside chat; check that the channel has an external binding and that the message is allowed to send outward.
- Do not present an occasional cross-agent delivery as if it came from the surface's default agent; preserve the real agent sender and let the surface apply attribution.
