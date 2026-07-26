---
status: draft
priority: P2
area: Security
depends_on:
  - SECURITY-002
  - SURFACE-006
---

# 🦐 SECURITY-003: Public Chat Limited Sessions

## Why

Shrimpy eventually needs agents in group chats and public rooms. A transport-thread allowlist is not enough: the room may be accepted while some people speaking in it have no Shrimpy permissions. Those messages must not enter the agent's trusted session with its normal tools, memory pressure, and command surface.

Public-chat authorization should be one source-specific consumer of generic session admission, not the owner of the profile system.

## Current State

- Telegram authorizes whole chats through `allowedChatIds` before channel publication and model wake.
- Surface user mappings and `state/users.json` provide stable identity, not permission grants.
- Agent `channelPolicy` decides wake or ignore using sender, identity, addressing, mentions, and channel facts.
- Trusted and untrusted people in one accepted room would currently share the same default channel session if both wake the agent.
- Surface-local chat commands are gated by transport acceptance rather than a shared Shrimpy command permission result.

## Direction

After channel visibility and attention are resolved, classify the accepted human sender into one of three outcomes:

- `default` for an owner or trusted sender;
- `limited-public` for a reply-capable sender with no administrative authority;
- `blocked` for a sender that may remain in the transport or channel audit trail but must not wake a model or run commands.

The classifier returns a generic SECURITY-002 admission decision. Trusted and limited senders in the same room receive separate session identities, transcripts, queues, tools, and command permissions while continuing to share the room's channel log.

## Build

- Add durable sender grants using stable Shrimpy `userId` and `actorId` values plus surface-origin facts, never display names.
- Keep accepted transport threads and sender grants distinct. A surface allowlist answers whether the conversation may enter Shrimpy; sender admission answers what an accepted participant may do.
- Resolve sender trust after `channelPolicy` attention and before session selection.
- Resolve unknown, unmapped, malformed, or unverifiable senders to blocked command permission. Never use `limited-public` as an identity-failure fallback.
- Define `limited-public` as an exact reply-capable profile with only active-channel publication helpers needed by the workflow, likely `reply` and `ask` initially.
- Gate remote commands through the same admission result and the SURFACE-006 permission matrix. A positively admitted limited sender may receive read-only `/help` and a deliberately minimal `/status`; blocked or unverifiable senders run nothing, while lifecycle, model, thinking, settings, addressing, membership, and configuration commands require trusted permission.
- Add an inspection command that explains visibility, wake, sender classification, selected profile, command permission, active session key, and effective tools for a representative message.
- Decide whether limited public context is shared per room or isolated per sender before implementation. Do not encode the choice into profile ids.

## UX Implications

An agent can participate in an accepted public room without giving every participant the owner's session context or tools. Trusted and limited users can receive replies from the same visible agent, while inspection clearly explains their different authority. Addressing or mentioning an agent never elevates permission.

## Boundaries

- Do not put sender grants into `channelPolicy` or surface-specific wake code.
- Do not expose filesystem, shell, worker, browser-control, arbitrary routing, arbitrary channel-reading, notification, package, or configuration tools to `limited-public`.
- Do not let limited users reset, restore, stop, retune, reconfigure, or switch the addressed agent.
- Do not rely on room membership, mutable profile names, mentions, or display names as Shrimpy authorization.
- Do not add path-bounded file tools merely because a public profile could theoretically use them.
- Do not add surface-specific permission systems that cannot be explained by Shrimpy CLI inspection.

## Touches

- `src/config/` for durable sender grants
- `src/surfaces/shared/` and surface adapters for accepted-thread versus sender-permission plumbing
- the SECURITY-002 admission resolver
- shared remote command authorization from SURFACE-006
- session and channel-policy inspection commands
- `docs/reference/security.md`, `docs/reference/channels.md`, `docs/reference/sessions.md`, and `docs/reference/surfaces.md`

## Done

- Trusted and limited senders in one accepted room use separate profile sessions.
- A limited sender can intentionally reply only to the active room and cannot invoke broader tools or state-changing commands.
- Blocked senders do not wake a model or publish session-control messages.
- Inspection explains transport acceptance, attention, sender trust, session admission, command permission, and tools as separate decisions.
- Tests cover mixed sender routing, transcript separation, command denial, addressing without elevation, active-channel-only publication, and fail-closed identity handling.
