# 🦐 SURFACE-003: Chat Agent Switching Bug

Status: todo
Priority: P1
Area: Surfaces

## Why
Chat channels should let a user switch the active or addressed agent without losing the conversation context or accidentally routing the next message to the wrong agent. The current behavior around agent switching from a chat surface is buggy enough that a user cannot reliably steer a channel between agents once a conversation is already underway.

This matters because chat surfaces are the main low-friction control path for Shrimpy. If the visible chat can say "talk to this other agent now," Shrimpy needs to update the route deterministically and make the result inspectable from logs and CLI commands.

## Repro
- Start a chat-backed channel with the default agent active.
- From the chat surface, request or command a switch to another configured agent.
- Send a follow-up message intended for the newly selected agent.
- Expected: the channel route records the new active or addressed agent, and the follow-up is handled by that agent.
- Actual: the switch is not applied consistently, is applied only transiently, or the follow-up is still routed to the previous/default agent.

## Build
- Identify the current chat-surface path for selecting, addressing, or switching agents.
- Make agent switching from chat update the same channel route state used by inbound message routing.
- Ensure the next user message in that chat channel resolves to the selected agent.
- Make the switch visible through existing channel inspection or route diagnostics.
- Add a focused regression test around switching agents from a chat channel and sending a follow-up message.

## Boundaries
- Do not add a second agent-selection control plane for chat surfaces.
- Do not encode agent switching only in prompt text or session memory.
- Do not mutate historical channel messages to represent route changes.
- Do not add legacy aliases, compatibility shims, or migration paths.

## Implementation Notes
- Likely files: `src/surfaces/telegram/surface.ts`, `src/channels/service.ts`, `src/channels/bus.ts`, and route/session helpers under `src/sessions/`.
- Check whether the bug is in command parsing, addressed-agent state persistence, route lookup, or the handoff from surface adapter to channel bus before changing the public command shape.
- Prefer a small shared chat-surface helper if Telegram and future chat adapters should use the same switching semantics.

## Done
- A user can switch the active or addressed agent from a chat-backed channel.
- The next inbound chat message is routed to the newly selected agent.
- Channel route or inspection output makes the selected agent visible.
- Regression coverage prevents the routing from silently falling back to the previous/default agent.
