---
status: draft
priority: P2
area: Security
depends_on: []
---

# 🦐 SECURITY-005: Session-Scoped Authority Architecture

## Why

Shrimpy currently gives an agent one effective tool policy and sends every accepted gateway channel turn into that agent's default session for the channel. This is simple, but it makes the channel an accidental selector for both conversational continuity and runtime authority.

The security backlog is moving toward a different product shape: the same persistent agent should be able to talk with its owner, participate in a public room, run an autonomous watch, use a small local model, perform a bounded project task, or run a read-only audit without every one of those contexts inheriting the same transcript and full agent power.

The possible unifying architecture is session-scoped authority. After channel visibility and agent attention are decided, but before Shrimpy opens or resumes a Pi session, one admission decision selects the complete session identity and a named security profile. The session then receives its own continuity, model policy, exact tool surface, command permission, optional bounded resources, and eventual OS containment.

This is intentionally still a draft. The direction smells cleaner than treating public chat, watches, constrained tools, and native sandboxing as adjacent special cases, but it should be evaluated as an architectural center before the existing security proposals are rewritten around it.

## Product Intent

The goal is not to make models, prompts, skills, or external content trustworthy. The goal is to make the authority behind every agent turn narrow, explicit, inspectable, and difficult to widen accidentally.

Shrimpy should support:

- one durable agent identity across trusted, public, autonomous, local-model, maintenance, and coding contexts;
- separate session continuity when those contexts have materially different authority or contamination risk;
- enforcement outside the model rather than reliance on prompt obedience;
- a small set of named, understandable profiles rather than a general enterprise permission system;
- useful application-level restriction before native process sandboxing exists;
- one policy vocabulary that can later drive both constrained tools and OS sandbox backends;
- honest inspection that distinguishes reduced model tools from actual host containment.

The user-facing promise is not that an agent will make good decisions. It is that Shrimpy can explain why a turn ran, which session received it, what that session could do, and where the real enforcement boundaries were.

## Primitive Boundaries

The proposed split is:

| Primitive | Responsibility |
|---|---|
| Agent | Persistent identity, instructions, memory, defaults, and maximum capability ceiling |
| Channel | Visible room, routing path, and durable event log |
| Session | Private transcript and conversational continuity |
| Security profile | Named restriction on what one session may do |
| Admission | Selects the complete session identity and profile for an accepted turn |
| Runner | Executes the session and applies tool-level and eventual OS-level enforcement |

This preserves the existing law that channels route and record while sessions think. A channel does not own authority merely because messages pass through it. Two turns visible in the same room may enter different sessions with different profiles.

## Current Shape

Shrimpy already has several strong seams:

- Every `SessionKey` contains agent id, namespace, name, and `profileId`.
- Different profile ids already receive different canonical ids, storage directories, manifests, transcripts, and ownership records.
- `SessionResolver` is the shared path for constructing session descriptors, models, prompts, tools, and turn context.
- Channel membership decides visibility and agent `channelPolicy` decides attention.
- Typed channel messages carry sender and origin facts, including watch provenance.
- Shrimpy daemon tools are constructed centrally and can expose fixed operations without Bash.
- Session manifests, metadata, ownership, lifecycle commands, and gateway lane state already provide places for inspection.

The current coupling is:

```text
channel message
  -> membership
  -> channelPolicy wake
  -> AgentChannelRuntime dispatches by channel name
  -> SessionPool selects channel/<channel>@default
  -> SessionResolver applies one agent-level tool policy
  -> Pi session runs inside the current host process
```

Consequences:

- `profileId` separates storage but has no capability semantics.
- Gateway dispatch always constructs the `default` profile before any source-specific authority decision.
- `SessionPool` keys its lanes, queues, cached plans, live sessions, and lifecycle operations by channel rather than complete session identity.
- Restricted and trusted turns cannot use different sessions while sharing a channel.
- Agent `disabledTools` produces a denylist rather than a closed non-default capability set.
- Message watches inherit the ordinary target-channel session.
- Transport acceptance and channel attention do not distinguish a trusted owner from a limited participant in the same accepted room.
- Pi sessions and the long-running gateway share the host authority of the Shrimpy process.

## Desired Shape

The proposed flow is:

```text
surface / watch / CLI / future worker
  -> authenticated or authoritative producer facts
  -> durable channel event when applicable
  -> channel visibility
  -> agent attention
  -> session admission
  -> complete SessionKey + resolved security profile + adjacent model policy
  -> full-key session lane
  -> Pi runner with exact tools and optional containment
  -> intentional channel or transcript delivery
```

Admission returns one of three broad outcomes:

- `dispatch` with a complete session target and explanation;
- `ignore` when no turn should occur;
- `block` when the request reached an authorization boundary and must fail closed.

The exact TypeScript shape is not the architectural decision. The durable responsibility is to choose the runtime variant before session lookup and to explain the choice.

## Shared Safe Context

This proposal does not introduce per-profile prompt-context permissions.

Shrimpy should keep a simpler invariant:

> Prompt-loaded workspace and agent context is safe for every session of that agent to see and repeat.

Shared `SOUL.md`, workspace context, agent context, and ordinary advertised skills preserve one coherent agent identity across trusted, public, and autonomous sessions. Sensitive material should not be placed in prompt-loaded context. It belongs in credentials, vaults, private files, transcripts, external systems, or another resource that requires an explicit capability.

Session separation still matters because hostile public conversation, weak-model mistakes, and autonomous watch instructions should not persist into a later higher-authority owner session. The separation protects continuity and authority from contamination; it is not intended to create separate prompt identities within one agent.

## Agent Ceiling And Session Profiles

The agent's existing configuration should remain its maximum capability ceiling. A session profile can narrow that ceiling but cannot:

- reactivate a tool excluded by the agent;
- register a capability the agent does not possess;
- widen file, channel, network, secret, browser, git, or command authority beyond the agent's ceiling;
- gain authority from a name or policy object carried in message content.

Profiles should stay few and legible. Possible examples are:

- `default`;
- `limited-public`;
- `watch-readonly`;
- `project-write`;
- `coding-scratch`;
- `audit-readonly`.

A resolved profile may eventually describe:

- exact active tool names;
- remote command permission;
- readable and writable roots;
- permitted fixed Shrimpy operations;
- publication destinations;
- network mode;
- git behavior;
- secret access;
- browser or device access;
- sandbox backend and promotion behavior.

The first implementation does not need every field. The important choice is that later enforcement layers extend the same profile rather than creating unrelated profile systems.

The default profile should preserve ordinary trusted behavior unless the maintainer deliberately changes it. Non-default restricted profiles should use a closed capability construction: only selected tools and bounded replacements are active.

## Authority Does Not Travel Through Messages

Channel messages can preserve provenance for routing and inspection, but arbitrary message fields do not grant authority.

A watch-origin message may identify a watch, run, requested model policy, or intended profile. Admission must reload and validate the authoritative watch definition and runtime facts before honoring them. The source watch cannot elevate another agent.

A surface-origin message may carry stable user and transport identifiers. Admission must resolve permission from authenticated surface facts and durable Shrimpy configuration, never from display names, mentions, mutable room labels, or a profile string supplied by the sender.

An explicit local CLI request can select a non-default profile only through a validated command path. Unknown or invalid profiles fail before session open and never fall back to `default`.

## Session Identity And Lane Isolation

A dispatched turn must be keyed by its complete canonical `SessionKey`, not by channel alone.

Different session identities must not share:

- a Pi session;
- transcript;
- queue;
- cached `SessionOpenPlan`;
- ownership record;
- model state;
- tool plan;
- lifecycle target.

The channel remains part of delivery and activity state for channel-bound sessions, but it is no longer the session-pool identity.

Named profile definitions may change over time. Shrimpy should not silently keep using a broader live session after its requested profile becomes invalid or materially changes. The exact reopen/version behavior remains an open decision, but session metadata must record the effective policy summary used when the session opened so historical authority stays understandable.

## Exact Tools And Fixed Operations

Restricted profiles should be constructed from an allowlist rather than by subtracting a few known dangerous tools.

The runtime path should become:

```text
resolved profile
  -> selected Shrimpy daemon tools
  -> bounded replacement tools
  -> selected fixed-operation wrappers
  -> exact Pi active-tool set
```

If a required bounded replacement cannot be constructed, the unrestricted Pi built-in must remain inactive.

Restricted sessions should prefer small typed operations over Bash or a general Shrimpy CLI wrapper. Examples include:

- reply only to the active channel;
- read one permitted channel;
- inspect one watch;
- write a report under one output root;
- obtain a project diff;
- request a later brokered git operation.

The relevant authority is the scope behind the tool, not only its name. `reply` means publication to the active channel, while `send_message` permits arbitrary routing and therefore belongs in a broader profile.

## One Policy Vocabulary, Multiple Enforcement Layers

Application-level tools and native sandboxing should consume the same resolved profile vocabulary.

For example:

```text
read roots: /project/reference
write roots: /project/output
network: blocked
git: none
```

At the model-tool layer, this can construct bounded file operations and omit Bash. At the OS layer, the same policy can later become Seatbelt rules, `bubblewrap` mounts, or another runner configuration.

The two enforcement layers remain distinct:

- constrained tools limit what the model can invoke through the Shrimpy/Pi tool surface;
- an OS sandbox limits the authority of the process and its children.

Inspection must show both and must not label an unsandboxed process safe merely because its active tools are narrow.

## Runner Boundary

The long-term process shape should distinguish the trusted gateway from an agent execution runner.

The gateway needs infrastructure authority for surface credentials, channel storage, watch scheduling, configuration, session lifecycle, admission, runner launch, and inspection. An individual Pi session should not automatically inherit all of that authority.

The intended abstraction is:

```text
SessionOpenPlan + resolved profile
  -> runner backend
  -> Pi session
```

The first backend may be an honest `none` or `in-process` adapter using current behavior. Later backends can apply native or VM-backed containment without changing the product meaning of profiles and sessions.

This proposal does not require an out-of-process runner before session admission, exact tool profiles, watches, or bounded file operations can ship. It does require avoiding new architecture that assumes the gateway process itself is the permanent agent security boundary.

## Source-Specific Consumers

### Public Chat

Public chat becomes one admission policy:

- transport acceptance decides whether the room enters Shrimpy;
- channel membership decides visibility;
- `channelPolicy` decides attention;
- sender admission classifies the accepted human as trusted, limited, or blocked;
- the selected profile determines the resulting session authority.

Trusted and limited participants can share a channel log while using separate sessions and command permissions. Whether limited continuity is shared by room or separated per sender is a conversation-design choice, not a profile-id encoding trick.

### Message Watches

Message watches should eventually use watch-owned sessions:

```text
watch fires
  -> channel event records the occurrence
  -> admission verifies the authoritative watch and owner
  -> watch/<watch-id>@<profile> runs
  -> intentional output is published to the target channel
```

The channel remains the visible event and delivery path. It no longer causes the watch to inherit a human channel transcript.

The absence of an explicit watch session block should eventually select a documented default watch profile rather than preserve permanent dual semantics.

### Command Watches

Command watches bypass model-session admission because they execute a command directly. They need an explicit process-security story and should eventually use the same constrained job-runner vocabulary rather than remain a separate unrestricted shell path.

This gap may deserve its own follow-up proposal after the session-scoped direction is accepted.

### Future Workers And Explicit Runs

Workers, one-shot runs, and coding delegates can use the same admission/profile path without becoming new security frameworks. Their source-specific policy selects a session target and profile; the shared resolver and runner enforce it.

## UX Implications

Users can inspect a session or representative incoming event and answer:

- Was the transport or producer accepted?
- Could this agent see the event?
- Why did the agent wake?
- Which admission rule applied?
- Which complete session received the turn?
- Which named profile and model policy were selected?
- Which exact tools, paths, commands, and publication destinations were active?
- Was an OS sandbox active, and which backend enforced it?
- Why was a request ignored or blocked?

Likely CLI surfaces include profile listing and inspection, admission explanation for a representative source, full session-key lifecycle commands, and effective path or capability checks. Exact command names remain open.

Ordinary trusted sessions should remain behaviorally unchanged under `default`. A constrained turn must never silently fall back to trusted behavior when its profile, provenance, bounded operation, model policy, or runner cannot be resolved.

Prompt-loaded agent and workspace context remains shared and must be treated as non-sensitive. The proposal should not create extra context configuration or change the visible personality of an agent merely because a restricted profile is active.

## How This Differs From The Current Architecture

The architectural transition is:

```text
current:
  agent-scoped authority + channel-selected session

proposed:
  agent capability ceiling + admission-selected session authority
```

Concretely:

- `AgentChannelRuntime` changes from direct channel dispatch into attention followed by admission.
- `SessionPool` changes from channel-keyed lanes to complete-session-keyed lanes.
- `SessionResolver` changes from one captured agent tool policy to a per-session resolved profile bounded by the agent ceiling.
- non-default sessions receive exact active-tool sets rather than only exclusions.
- watch, public, worker, and explicit-run policy become consumers of one admission boundary.
- a runner abstraction gives future native sandboxing a stable home outside channel and profile-selection logic.
- inspection explains the entire route rather than exposing membership, wake policy, sessions, and tools as separate facts the user must mentally combine.

Channels, shared safe prompt context, Pi session mechanics, surface verticals, append-only logs, session manifests, ownership, and the CLI-first product boundary remain intact.

## Relationship To Existing Backlog

- Concrete native or VM-backed runner proposals should be created only after this direction settles the runner boundary. Their sandbox policy vocabulary should extend the same resolved session profile rather than create an independent profile system.
- [SECURITY-002](security-002-session-admission-security-profiles.md) is the closest existing foundation. If this direction is accepted, SECURITY-002 should absorb the settled admission, full-key pool, exact-tool, inspection, and runner-seam decisions rather than both notes becoming separate implementation layers.
- [SECURITY-003](security-003-public-chat-limited-sessions.md) remains a source-specific admission consumer.
- [SECURITY-004](security-004-path-bounded-file-tools.md) remains an optional capability implementation for constrained profiles and later defense in depth with OS sandbox roots.
- [WATCH-002](watch-002-watch-session-profiles.md) remains the watch-owned session consumer.
- SURFACE-006 remains the owner of the remote command UX, while admission provides the effective command permission.

This note should not itself become an additional runtime subsystem alongside SECURITY-002. Its purpose is to decide whether session-scoped authority is the architectural center and, if accepted, reshape the concrete notes accordingly.

## Open Decisions

- Is session-scoped authority the right central abstraction, or is agent-scoped authority with a smaller number of special constrained runs preferable?
- Where should named profiles live, and which portions are workspace-wide versus agent-specific?
- Which fields belong in the first profile schema rather than later sandbox work?
- Should every non-default profile always use a closed active-tool set?
- When a named profile changes, should an existing session reopen automatically, require explicit confirmation, or use an internal policy generation?
- Should the eventual session pool own all gateway namespaces, including watch and worker lanes, through one interface?
- Should limited public continuity default to one session per room or one per sender?
- What default watch profile preserves simple setup without returning to the human channel session?
- How early should the in-process runner be named as a backend in code and inspection?
- Should command-watch containment be the first consumer of the runner abstraction or a later follow-up?
- Which high-risk operations should remain unavailable to restricted profiles versus become fixed or brokered operations?

## Boundaries

- Do not turn `channelPolicy` into authorization. It remains attention policy.
- Do not make channels own security profiles or session authority.
- Do not treat display names, mentions, room acceptance, message profile strings, or model choice as permission.
- Do not introduce per-profile prompt-context permissions. Prompt-loaded context must remain safe for all sessions of the agent.
- Do not call tool allowlists, fixed operations, remote command policy, or separate transcripts OS sandboxing.
- Do not build a general RBAC, ACL, policy-expression, or approval framework without a concrete Shrimpy workflow that requires it.
- Do not expose Bash, arbitrary subprocess execution, or a free-form Shrimpy CLI wrapper as a substitute for bounded capabilities.
- Do not create separate public-chat, watch, worker, and coding security runtimes.
- Do not require native sandboxing before useful non-default profiles can exist.
- Do not add legacy aliases, fallback profiles, or dual routing paths merely to preserve the current accidental channel-session coupling.

## Possible Implementation Sequence

If accepted, a practical sequence is:

1. Define named profile configuration, agent ceilings, validation, and inspection.
2. Add one session-admission result before session lookup.
3. Key gateway lanes and lifecycle operations by complete `SessionKey`.
4. Construct exact active-tool sets for non-default profiles.
5. Make watch-owned sessions the first source-specific consumer.
6. Add public sender admission and shared remote-command permission.
7. Add path-bounded file operations for profiles that need them.
8. Make the existing in-process session execution an explicit runner backend.
9. Add native or VM-backed containment using the same profile vocabulary.
10. Bring command watches and higher-risk fixed or brokered operations onto the runner boundary.

This ordering is provisional. In particular, a small runner seam may belong earlier if implementing full-key lanes makes the future process boundary clearer.

## Touches

- `src/config/` for profile definitions, validation, agent ceilings, and source grants
- `src/agents/channel-runtime.ts` for admission before dispatch
- `src/sessions/identity.ts` for additional namespaces
- `src/sessions/resolver.ts` and `src/sessions/spec.ts` for per-session resolved policy
- `src/sessions/pool.ts` for full-key lanes
- `src/sessions/open.ts` and future runner adapters
- `src/tools/policy.ts`, daemon-tool construction, and bounded replacements
- `src/watches/` for watch session selection and eventual command-runner policy
- `src/surfaces/shared/` and surface commands for authenticated sender facts and command permission
- gateway runtime status and session inspection metadata
- `docs/reference/architecture.md`, `docs/reference/security.md`, `docs/reference/sessions.md`, `docs/reference/runtime.md`, `docs/reference/tools.md`, and `docs/reference/configuration.md`

## Done

This architecture-decision proposal is resolved when:

- the maintainer explicitly accepts, rejects, or substantially replaces session-scoped authority as the security center;
- the shared-safe-context invariant is confirmed or replaced with another explicit product rule;
- the ownership boundaries of agent, channel, session, profile, admission, and runner are settled;
- accepted decisions are folded into SECURITY-002–004, WATCH-002, and any necessary follow-up proposals;
- overlapping implementation requirements are removed rather than maintained in competing notes;
- this umbrella planning note and its index row are deleted once the durable direction lives in the concrete backlog and stable design documentation.
