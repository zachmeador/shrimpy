# 🦐 SECURITY-002: Public Chat Limited Sessions

Status: draft
Priority: P2
Area: Security
Depends On: none

## Why
Shrimpy eventually needs agents in group chats and public chatrooms. A channel-level allowlist is not enough for that world: the room may be allowed, while some people speaking in it have no Shrimpy permissions. Those messages should not enter the agent's normal channel session with its normal tools, memory pressure, and command surface.

The clean shape is sender trust deciding a session profile before a Pi session is selected or opened. A no-permission public-room message can still be worth answering, but it should run in a limited-tool channel session whose capabilities are deliberately smaller than the owner/trusted session for the same agent and channel.

## Current State
- Telegram has `allowedChatIds`, which authorizes whole chats before channel binding, identity mapping, presence, commands, media downloads, or model wake.
- Surface `users` mappings and `state/users.json` provide stable identity, not authorization.
- Channel membership decides agent visibility, and `agents[].channelPolicy` decides wake/ignore by sender kind, `actorIds`, `userIds`, mentions, addressing, and channel pattern.
- Agent tool policy is agent-scoped. `SessionPlanner` resolves one tool policy for the agent, and `SessionRegistry` caches one plan/session per agent plus channel.
- In a mixed public room, trusted and untrusted human messages would currently share the same agent/channel session and tool surface if channel policy wakes for both.
- Registered `send_message` and `read_channel` are broad routing/reading primitives. They are not constrained by channel membership once present in a session.
- Chat commands such as `/new`, `/restore`, `/stop`, `/thinking`, and `/agent` are currently surface-local and gated by the surface's inbound acceptance, not by per-sender Shrimpy permissions.

## Direction
Add a small runtime permission layer that classifies an accepted channel message before session dispatch. The output is not just wake/ignore; it includes the session profile that will handle the turn.

First useful profile set:

- `default` — current agent policy for owner/trusted direct use.
- `limited-public` — reply-capable public-room profile with no filesystem, shell, arbitrary channel routing, arbitrary channel reads, worker/delegation, or state-changing chat commands.
- `blocked` — accepted into the channel log if the surface wants that audit trail, but never wakes a model and never runs chat control commands.

The profile id becomes part of gateway session identity. A limited public turn for `agent:shrimpy` in `telegram~main~4242` must not reuse the same private Pi transcript as the normal trusted `agent:shrimpy` session for that channel. The channel log remains shared; private model context and active tools are separated by profile.

## Build
- Introduce a typed session-profile concept under the session/tool planning layer, not inside prompts. Candidate names: `SessionProfile`, `SessionSecurityProfile`, or `ChannelTurnProfile`.
- Add a resolver that receives `runtime`, `agent`, `channel`, and `ChannelMessage`, then returns `{ profileId, reason, toolPolicyOverride, commandPermission }` or an ignore/block result. It should use stable Shrimpy `userId` / `actorId` values and surface origin facts, not display names.
- Keep room acceptance and sender permissions distinct. Surface allowlists answer "may this transport thread enter Shrimpy at all?" The new resolver answers "what may this Shrimpy sender do inside this accepted channel?"
- Thread the resolved profile through `AgentChannelRuntime` and `SessionRegistry`. Session keys, lane state, session directories, recorded metadata, and `shrimpy sessions list/search/read` inspection should make the profile visible.
- Extend `SessionPlanner.planChannel` so profile-specific tool policy is resolved before `openSession`. The limited profile should register only active-channel publication helpers that are safe for the current channel, likely `reply` and `ask` first. It should exclude Pi built-ins such as `bash`, `edit`, `write`, `read`, `grep`, `find`, and `ls`, and should not register broad Shrimpy daemon tools such as `send_message` or `read_channel`.
- Decide whether `notify` and `report` belong in `limited-public`. Default conservative answer: omit `notify` because public users should not trigger notification semantics, and omit `report` unless a concrete public-room workflow needs it.
- Add a compact profile fact to turn context: sender identity, trust/profile, why the profile was chosen, and the active-channel limitation. This is for inspectability, not enforcement.
- Gate chat commands through the same sender permission result. Read-only `/help` and a minimal public-safe `/status` may remain available. Session lifecycle, thinking changes, addressed-agent switching, model/settings changes, and future admin commands require a trusted profile.
- Add CLI inspection for the decision. Good targets: extend `shrimpy agent channel-policy explain` with session-profile output, or add a sibling command that explains wake plus profile plus command permission for a synthetic message.
- Update reference docs after implementation: `security.md`, `channels.md`, `sessions.md`, `surfaces.md`, `tools.md`, and `configuration.md`.

## Shape
The runtime pipeline should read like:

```text
surface / channel post / watch
  -> typed channel message
  -> channel membership
  -> agent channelPolicy wake decision
  -> sender/session-profile resolver
  -> AgentChannelRuntime dispatch with profile id
  -> SessionRegistry key: agent + channel + profile
  -> SessionPlanner opens profile-specific tools and prompt metadata
  -> Pi turn
  -> active-channel publication only for limited-public
```

This keeps the existing boundaries intact:

- channel membership is still visibility;
- channel policy is still attention;
- session profile is capability;
- OS sandboxing remains a separate later layer;
- prompt instructions explain the boundary but do not enforce it.

## Open Decisions
- Where durable sender grants live. Options: extend surface config, add a small `config/users.json`, or add a `security.users` section in `config/shrimpy.json`. Keep identity links in `state/users.json` separate from grants unless there is a strong reason to merge them.
- Whether profile selection should be purely global or agent-specific. Agent-specific profile overrides are probably useful, but default profiles should exist so every agent gets a safe public-room posture.
- Whether limited public sessions should be per channel or per sender. Per channel is simpler and keeps public-room context together; per sender gives stronger isolation if public participants should not share private public-session context with each other.
- Whether accepted-but-blocked messages should be logged as ordinary channel messages or dropped before channel storage for each surface. Public rooms likely need an audit trail; private unauthorized DMs likely should still fail closed before side effects.

## Boundaries
- Do not treat skills, prompt rules, channel policy, disabled tools, or command allowlists as sandboxing. This item is a Shrimpy runtime capability layer; SECURITY-001 owns OS/process isolation.
- Do not allow addressing, mentions, or `/agent` switching to elevate a sender from `limited-public` to `default`.
- Do not expose raw `send_message`, raw `read_channel`, filesystem tools, shell tools, package installs, worker tools, or future browser-control tools in the limited profile.
- Do not let public senders reset, restore, stop, change thinking/model/settings, switch addressed agents, edit config, or mutate membership.
- Do not add surface-specific one-off permission logic that cannot be inspected through Shrimpy commands.
- Do not add legacy compatibility or migration paths for old channel sessions unless explicitly requested.

## Touches
- `src/config/` for permission/profile config parsing.
- `src/surfaces/shared/` and surface verticals for accepted-thread versus sender-permission plumbing.
- `src/agents/channel-runtime.ts` and `src/agents/channel-policy.ts` or a sibling resolver module for wake plus profile inspection.
- `src/sessions/planner.ts`, `src/sessions/registry.ts`, `src/sessions/spec.ts`, `src/sessions/session-record.ts`, and session inspection/search formatting.
- `src/tools/policy.ts`, `src/tools/factory.ts`, and daemon tool selection for profile-specific active tools.
- `src/surfaces/telegram/commands.ts` and future shared chat command registry from SURFACE-006 for command authorization.
- `src/context/turn/` for model-visible profile facts.
- Tests around mixed trusted/untrusted messages in one channel, command denial, tool exclusion, session separation, and inspection output.

## Done
- A no-permission human message in an accepted group/public chat can wake an agent only in a `limited-public` session profile.
- A trusted sender in the same Shrimpy channel uses the normal/default profile and does not share the private Pi transcript or tool surface with the limited public session.
- The limited profile can publish an intentional response only to the active channel and cannot call broad routing, channel-reading, filesystem, shell, worker, or browser-control tools.
- State-changing chat commands from limited senders are rejected or ignored without publishing session control messages.
- Inspection output explains channel visibility, wake decision, sender profile, active session key, and active tools for a representative message.
- Reference docs describe room allowlists, sender grants, session profiles, command permissions, and the difference between this runtime policy and OS sandboxing.
- Tests cover profile resolution, mixed-session routing, command gating, tool policy, session metadata, and prompt/turn-context profile facts.
