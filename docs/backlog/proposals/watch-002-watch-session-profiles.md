---
status: draft
priority: P2
area: Watches
depends_on:
  - SECURITY-002
---

# 🦐 WATCH-002: Watch Session Profiles

## Why

Message watches currently publish into a channel and wake the owning agent's ordinary channel session. That is useful routing, but it makes an autonomous watch inherit the channel session's transcript, model, and full agent tool surface.

A watch should be able to request a named restricted session profile and a suitable model policy without turning the channel into a permission container. This makes narrow autonomous work safer and makes small local models practical when enforcement lives outside the model.

## Current State

- A message watch publishes a typed channel message with watch id, run id, owner, trigger, action, and target-channel provenance.
- Channel membership controls visibility and agent `channelPolicy` decides whether the message wakes an agent.
- `AgentChannelRuntime` currently dispatches every accepted message into a `channel/<channel>` default-profile lane.
- The channel is both the watch's routing/logging path and, accidentally, the current session-identity selector.
- Multiple watches targeting one channel can therefore share transcript and model state with each other and with humans using that channel.

## Direction

Keep the channel handoff, but separate delivery from execution:

```text
watch fires
  -> publish message and trusted watch/run provenance to target channel
  -> membership and channelPolicy decide visibility and attention
  -> session admission reloads and validates the authoritative watch definition
  -> dispatch to watch/<watch-id>@<profile>
  -> run with the watch's model policy and resolved exact capabilities
  -> deliver intentional output to the target channel
```

The channel remains the visible event log and delivery route. A watch-owned session carries the watch's transcript, instructions, profile, model, and lifecycle.

## Build

- Add a `watch` session namespace and a stable `watch/<resolved-watch-id>@<profile>` key owned by the handling agent.
- Key runtime lanes by that complete session identity through SECURITY-002.
- Add an optional session block to message-watch configuration with a named profile and model policy. Keep capability policy and model policy separately inspectable even when configured together.
- Resolve a watch's requested profile from the authoritative `watches.json` definition identified by trusted watch/run provenance. A profile string copied into arbitrary channel-message data is informational only and grants no authority.
- Honor a watch-requested profile only for the watch owner's own session. A cross-agent addressed message must pass the destination agent's independent admission rules and cannot carry the source watch's authority into that agent.
- Validate that the selected profile is allowed by the owner agent's capability ceiling and that the model policy resolves before enabling the watch.
- Unknown profiles, missing provenance, stale or mismatched watch definitions, and invalid model policies fail closed without using `default`.
- Make a configured watch model policy authoritative for its watch session rather than allowing a previously saved transcript model to override it.
- Keep channel lifecycle commands scoped to their channel session. Inspect, clear, stop, or retune a watch session through canonical `shrimpy sessions` or `shrimpy watches` commands that name the watch.
- Show watch id, session id, profile, model, active tools, bounded file roots, lane state, and last admission failure in `shrimpy watches show`, history, session inspection, and gateway status where appropriate.
- When SECURITY-004 is available, allow the selected profile to provide path-bounded file tools without adding watch-specific filesystem policy.

## UX Implications

An operator can configure an autonomous watch to use a small local model with only the tools and paths it needs, inspect that effective authority before enabling it, and review a transcript dedicated to that watch. The watch still appears in its target channel and can publish its intended result there, but it does not silently share the human channel session's context or permissions.

Existing watch configuration remains simple when no non-default model or profile is needed. Inspection should make the resulting default explicit rather than leaving it implicit.

## Open Decisions

- Whether every message watch should move to a watch-owned session once this lands, or whether only watches with an explicit session block do so initially. Prefer one eventual model rather than permanent dual semantics.
- Whether the optional configuration key is named `session`, `execution`, or another small term that does not imply the channel owns the policy.
- Whether a watch profile may intentionally opt into recent target-channel context, and how that context is bounded without reusing the channel transcript.

## Boundaries

- Do not add profile or tool behavior to `channelPolicy`; it remains attention policy.
- Do not pass raw permission objects through channel messages or trust user-authored provenance.
- Do not encode watch ids, model policies, file roots, or policy versions into profile-id strings.
- Do not create watch-specific tool enforcement, path validation, or model runtimes. Reuse session admission, security profiles, model resolution, and bounded tools.
- Do not apply session profiles to command watches; they execute commands directly and require their own explicit process-security story.
- Do not describe a restricted watch profile as OS sandboxing.
- Do not let an emitting watch elevate another agent.

## Touches

- `src/watches/schema.ts`, build helpers, validation, inspection, and history
- `src/channels/protocol.ts` for inspectable watch session intent if needed
- SECURITY-002 admission and full-key session pool
- `src/sessions/identity.ts` and session lifecycle/inspection for the `watch` namespace
- gateway watch and channel runtimes
- `docs/reference/runtime.md`, `docs/reference/sessions.md`, `docs/reference/security.md`, and `docs/reference/configuration.md`

## Done

- A message watch can select a validated session profile and model policy before session open.
- The resulting turn uses a watch-owned canonical session and cannot reuse the default channel transcript or tool plan.
- Channel attention remains controlled only by membership and `channelPolicy`.
- Raw or forged message profile claims cannot grant authority.
- Cross-agent watch messages cannot elevate the destination agent.
- Inspection explains the full watch-to-channel-to-admission-to-session path and the effective tools, roots, and model.
- Tests cover profile and model resolution, full-key lane separation, authoritative provenance lookup, stale definitions, cross-agent denial, lifecycle targeting, and fail-closed fallback behavior.
