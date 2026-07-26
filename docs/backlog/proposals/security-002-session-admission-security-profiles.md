---
status: draft
priority: P2
area: Security
depends_on: []
---

# 🦐 SECURITY-002: Session Admission And Security Profiles

## Why

Shrimpy currently resolves tools at agent scope and sends every gateway channel turn to the agent's default channel session. That is too coarse for public senders, autonomous watches, constrained local-model work, and future sandboxed sessions. The same agent may reasonably handle different turns with different transcripts and materially different authority.

The reusable boundary is session admission: after Shrimpy decides that a message or explicit request deserves attention, but before it selects, opens, or resumes a Pi session, it must decide which session identity and named security profile will handle the turn.

This is not channel policy. Channel membership is visibility, `channelPolicy` is attention, session admission selects the runtime variant, and the resolved security profile constrains capability.

## Current State

- Every `SessionKey` already contains `profileId`; non-default profiles have separate canonical ids, storage, transcripts, manifests, and ownership records.
- `profileId` currently has no capability semantics. Gateway channel dispatch always constructs the `default` profile.
- `SessionResolver` resolves one agent-level tool policy and passes a denylist to Pi. It does not construct a closed active-tool allowlist.
- `SessionPool` keys lanes by channel rather than full session identity.
- Pi custom and extension tools can be active unless Shrimpy supplies an exact active-tool set, so disabling a few known tools is not a closed security profile.
- Channel messages carry typed origin and sender facts, including watch provenance, but those facts do not yet participate in session selection.

## Direction

Introduce one generic admission decision before session lookup:

```ts
type SessionAdmissionDecision =
  | {
      action: "dispatch";
      key: SessionKey;
      profileId: string;
      reason: string;
      commandPermission: "full" | "read-only" | "none";
      modelPolicy?: string;
    }
  | {
      action: "ignore" | "block";
      reason: string;
    };
```

The exact type may change during implementation, but its responsibilities should not: select a complete session identity, explain why, and fail before session open when authority cannot be resolved.

Define named `SessionSecurityProfile` policy separately from `SessionKey`. The profile id identifies and separates a session; the resolved profile supplies an exact active-tool allowlist, command permission, optional bounded-resource policy, and inspection facts. Model selection remains an adjacent session decision rather than evidence of security.

## Build

- Add named session-security-profile configuration with a conservative `default` resolution and explicit non-default definitions.
- Treat the agent's existing tool configuration as its maximum capability ceiling. A session profile may narrow that authority but cannot reactivate a tool the agent excludes or register a capability the agent does not possess.
- Validate profile definitions and agent/profile compatibility when configuration loads. Prefer a clear invalid configuration over silently intersecting a surprising policy.
- Resolve admission before constructing a `SessionOpenPlan`, opening a transcript, restoring a saved model, or building tools. Unknown, invalid, or unauthorized profile requests fail closed and never fall back to `default`.
- Pass Pi an exact active-tool allowlist for non-default security profiles. Register only the Shrimpy tools selected by the resolved profile and fail closed if an expected replacement or fixed-operation tool cannot be constructed.
- Key gateway session lanes by the full canonical `SessionKey`, not channel alone. Profile-specific turns must not share a plan, Pi session, transcript, ownership record, queue, or lifecycle operation with `default`.
- Keep source-specific classification outside `channelPolicy`. Human trust, watch provenance, explicit CLI selection, and future worker policy may each feed the generic admission resolver without changing attention rules.
- Do not trust a profile name carried by arbitrary message data as authority. Admission must derive or validate it against authoritative Shrimpy configuration and authenticated producer facts.
- Record the profile id, selection reason, command permission, effective active-tool names, model policy, and bounded-resource summary in session inspection metadata and turn context. Prompt facts explain the boundary but do not enforce it.
- Add CLI inspection for named profiles and representative resolution, with a shape such as `shrimpy sessions profiles`, `shrimpy sessions profile <id>`, and an admission explanation command once the first source-specific consumer exists.
- Keep historical inspection intelligible when a named profile later changes by recording the effective policy summary used for each opened session or turn.

## UX Implications

Users can inspect a session and answer which profile selected it, why that profile applied, which model policy was used, and exactly which tools and bounded resources were active. Restricted and default turns never share a transcript merely because they target the same channel. Invalid profile configuration stops the affected dispatch with an actionable error instead of quietly granting default authority.

Ordinary trusted sessions remain behaviorally unchanged until a caller explicitly or authoritatively selects another profile.

## Boundaries

- Do not grow `channelPolicy` into an authorization or tool-policy system. It remains the answer to whether an agent wakes for a visible message.
- Do not encode source identity, watch ids, sender ids, model names, filesystem roots, or policy versions into ad hoc profile-id strings.
- Do not make prompt instructions, skills, tool descriptions, or model choice the enforcement boundary.
- Do not implement public-user grants, watch-specific routing, or path-bounded file operations inside this foundation. Those are separate consumers or capabilities.
- Do not call this OS sandboxing. SECURITY-001 owns process, syscall, device, network, and host filesystem containment.
- Do not silently preserve a broader open session when its requested profile changes or becomes invalid.
- Do not add legacy profile aliases or default-fallback compatibility paths.

## Touches

- `src/config/` for named profile configuration and validation
- `src/sessions/identity.ts`, `src/sessions/resolver.ts`, `src/sessions/spec.ts`, and session inspection metadata
- `src/sessions/pool.ts` for full-key lanes
- `src/tools/policy.ts`, runtime tool construction, and Pi active-tool selection
- `src/agents/channel-runtime.ts` or a sibling session-admission boundary
- `src/context/turn/` for inspectable, non-enforcing profile facts
- `docs/reference/security.md`, `docs/reference/sessions.md`, `docs/reference/tools.md`, and `docs/reference/configuration.md`

## Done

- A non-default profile resolves before session open to a distinct canonical session identity and exact active-tool set.
- The agent configuration is an enforceable maximum capability ceiling.
- Unknown, invalid, or unauthorized profiles fail closed without opening or reusing `default`.
- Gateway lanes and lifecycle operations distinguish full session keys rather than channel alone.
- Inspection shows the selection reason and effective capability summary.
- Source-specific consumers can request admission without adding authorization behavior to `channelPolicy`.
- Tests cover configuration validation, capability ceilings, unexpected extension/custom tools, profile separation, fail-closed resolution, full-key lane behavior, and inspection metadata.
