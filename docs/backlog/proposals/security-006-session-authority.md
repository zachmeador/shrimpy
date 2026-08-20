---
status: draft
priority: P2
area: Security
depends_on: []
---

# 🦐 SECURITY-006: Session Authority

Replaces SECURITY-002, SECURITY-003, SECURITY-004, SECURITY-005, and WATCH-002.

## Why

Channels are Shrimpy's intentional scoping unit. They are cheap, a workspace can have many, and most serve one narrow purpose. An agent's session for a channel carries that purpose's context, including autonomous watch turns.

What is missing is authority. Today, an agent has one effective tool policy everywhere it runs, so a scratch channel, public room, and private owner channel all receive the same power.

Earlier security notes treated the channel-session relationship as accidental and added parallel identity machinery: named security profiles, profile IDs in session identity, watch-owned sessions, and per-sender public sessions. This proposal keeps channel sessions and adds the missing half: each agent owns a per-channel policy that the runner enforces.

Four rules carry the design:

1. **Channels provide scope; agents own policy.** An agent may declare a `SessionPolicy` for its session in a channel. The channel name selects that agent's configuration, but rooms, messages, membership, and other agents never grant or impose authority. Agents with different power can share a room because each runs in its own session under its own policy. Different context or permissions require a different channel.
2. **Policy is inline and recorded.** The agent configuration or explicit run flags carry one `SessionPolicy` schema. Shrimpy resolves it before opening the session and records it in the session manifest. There is no named profile registry, profile ID, or policy versioning system.
3. **The runner enforces policy.** The in-process runner remains the default for trusted work. A policy that claims filesystem containment runs only in a sandboxed subprocess and fails closed until that runner exists.
4. **The TUI remains the owner's hands.** Foreground TUI sessions carry no `SessionPolicy` and skip admission. Policy applies only to gateway-mediated turns and CLI runs that explicitly request one.

## Current state

- `SessionKey` is `{agentId, namespace, name, profileId}`; `profileId` separates storage but has no capability semantics and nothing non-default constructs it.
- `SessionResolver` applies one agent-level tool policy; Pi receives a denylist (`excludedToolNames`), so custom and extension tools can be active unless exhaustively excluded.
- Agent tool policy is global: there is no way to narrow an agent's authority for one channel, so watch turns and public rooms get the agent's full power along with the channel's continuity.
- `SessionPool` keys lanes by channel name rather than full session identity.
- Command watches execute shell directly in the gateway process. This is the largest current authority gap.
- Workers already spawn detached child processes that host sessions (`src/workers/runner.ts`). Each child boots a full `AppRuntime` with workspace credentials, runs a `worker/<id>` session through the foreground path, and returns results through files without IPC. The `codex` backend passes `sandbox_mode="danger-full-access"`. This is an unsandboxed early form of the subprocess runner with a separate spawn path.
- Transport acceptance (for example Telegram `allowedChatIds`) admits whole rooms; surface user mappings and `state/users.json` provide stable identity but no permission semantics.
- Sessions execute inside whichever trusted process opened them: the gateway daemon for channel and watch turns, the CLI process for foreground TUI sessions. A session's syscalls carry its host process's full authority.

## Design

### `SessionPolicy` schema

One schema, used everywhere a session's authority is described:

```ts
interface SessionPolicy {
  tools: string[];                    // exact active-tool allowlist, always
  fileAccess?: { roots: { path: string; access: "read" | "read-write" }[] };
  commandPermission: "full" | "read-only" | "none";
}
```

The agent configuration defines its **default policy** with the same schema. Shrimpy computes its permissive allowlist from current built-ins and daemon tools, minus `disabledTools`.

The default policy is also the agent's **capability ceiling**. Every policy resolved for that agent must be a subset. Shrimpy validates this when configuration loads and reports invalid configuration there, not later during dispatch.

There is no registry. The agent's config may declare per-channel policy blocks that override its default for its session in that channel; an explicit CLI run may pass a policy inline. A per-channel block may also select a model policy — a sibling field, adjacent to but never inside `SessionPolicy`.

### Identity

Drop `profileId` from `SessionKey`, session IDs, and storage paths. Keep the existing `local`, `channel`, and `worker` namespaces. Continuity remains per agent and channel. A narrow job that should not share a conversation's context gets its own channel.

Every key remains agent-scoped: `agentId` is the first field, so four agents in one channel are four separate `channel/<name>` sessions with separate transcripts, models, tools, and policies. Agents never share a session by sharing a room; the channel is the shared log, and each agent's `channelPolicy` decides independently whether a message wakes it.

### Agents and ceilings

An agent that should be limited everywhere needs no per-channel policy. Its default policy is also its ceiling, so a narrow configuration—few tools, no Bash, and a cheap model—is enough. Per-channel blocks can narrow authority further for specific rooms.

Mixed-authority channels need no special handling. Each agent wakes into its own session under its own policy, and messages never transfer authority between agents.

### Admission

One small function before session open for gateway-mediated turns:

```ts
type AdmissionDecision =
  | { action: "dispatch"; key: SessionKey; policy: SessionPolicy; reason: string }
  | { action: "ignore"; reason: string }   // nothing to run; quiet
  | { action: "block"; reason: string };   // an authorization boundary was hit; loud and inspectable
```

Admission runs after `channelPolicy` attention. It resolves the agent's per-channel policy when present and uses the default otherwise. Invalid configuration fails closed; an error never falls back to the default policy.

Durable sender grants keyed by stable `userId` or `actorId` decide whether a sender may wake the agent. Unknown, unmapped, or unverifiable senders are blocked. Message content—including display names, room labels, and policy strings—never carries authority.

`SessionPool` lanes, queues, cached plans, and lifecycle operations use the full `SessionKey`. The manifest records the resolved policy whenever a session opens. A live lane keeps that opening policy. If configuration later resolves a materially different policy for the same key, the turn fails with an actionable error that names the session to stop or clear. Shrimpy never reuses or reopens it silently.

### Runner

`SessionOpenPlan + SessionPolicy → runner backend → Pi session`.

The `in-process` backend makes current behavior explicit: the session runs with the authority of the gateway or CLI process that opened it. This remains the default for trusted work. It refuses any policy with `fileAccess` because it cannot enforce filesystem containment.

The `subprocess` backend starts a fresh sandboxed child process that hosts the Pi session and talks to the gateway over stdio RPC. It builds containment directly from the policy:

- On macOS, use a Seatbelt profile with `deny default` and per-root `allow file-read*` or `allow file-write*` rules.
- On Linux, use a bubblewrap mount namespace or Landlock ruleset with the same shape.

The kernel resolves paths at syscall time, covering symlink escapes, traversal, and time-of-check/time-of-use races. Child processes, including Bash when allowed, inherit the same boundary.

The stdio RPC carries channel delivery and model-provider calls across the trust boundary. The gateway brokers model traffic so provider credentials never enter the child. Session storage, workspace configuration, and credentials stay on the gateway side. The child sees only its working directory and the policy's `fileAccess` roots.

Network egress policy is out of scope. For now, the tool allowlist controls web capability: a session without Bash or web-capable tools cannot reach the web. Add a network field to `SessionPolicy` only when a concrete workflow needs egress control for an otherwise network-capable session.

The subprocess runner replaces the separate worker spawn path. The existing worker child already demonstrates the basic shape: spawn a child, run one session turn, and return results through files without streaming RPC. The shared runner adds containment; workers keep their lifecycle, turns, and records as a consumer.

For external worker backends such as `codex` and a future `claude` adapter, the runner maps `SessionPolicy` to native sandbox flags. One policy vocabulary drives backend-specific enforcement and replaces the current `sandbox_mode="danger-full-access"` default.

Command watches become this runner's first non-model consumer: a policy with no tools and a command, replacing their current unrestricted shell path.

### Bounded file access

Only the subprocess sandbox enforces `fileAccess`. Sessions keep the ordinary Pi tools; out-of-bounds operations receive kernel denials instead of passing through replacement or path-checking tools.

Turn context lists the recorded roots, and Shrimpy may annotate a denial with them so the model can correct its next action. This explains the boundary but does not enforce it. Shrimpy must not describe `fileAccess` as enforced until a containing backend runs the session. Kernel enforcement supersedes the tool-level design in [shrimpy-constrained-tool-profile.md](../../research/shrimpy-constrained-tool-profile.md).

### Consumers

**Foreground TUI.** The TUI remains outside the policy path, works without the gateway, and behaves as it does today. Session policy does not try to restrict the owner's own terminal.

**Watches.** A message watch still publishes to its target channel and wakes the handling agent's channel session. A narrow autonomous job gets its own channel, where the agent's policy and model policy provide only the needed capability. There is no watch-session namespace or per-watch session configuration. Command watches use the subprocess runner instead.

**Public chat.** A public room maps to a channel with a narrow agent policy—for example, only `reply` and `ask`, plus `commandPermission: "read-only"`. Everyone in the room, including the owner, talks to the same limited session. Privileged work belongs in another channel. Sender grants decide who may wake the agent, while the remote command service keeps per-sender command permissions.

When a public room needs privileged presence, use two agents: a restricted agent that talks to everyone and a powerful agent whose `channelPolicy` wakes only for the owner. Attention and per-agent policy compose without per-sender sessions.

**Workers.** Workers become the subprocess runner's first session consumer and are sandboxed by default. Unsandboxed workers require explicit configuration. Their policies use the same admission path, while the `worker/<id>` session, lifecycle, turns, and records remain unchanged.

**Explicit runs.** A CLI run may request a validated inline policy through the same admission path. A requested `fileAccess` policy fails until a containing runner can enforce it.

## UX Implications

- `shrimpy sessions show` displays the agent, channel, recorded tools, file roots, command permission, policy source, and runner backend for a gateway-mediated session.
- `shrimpy channels` and agent inspection show per-channel policy blocks.
- A read-only policy-check command explains how Shrimpy would resolve a representative request.
- The TUI and default channel sessions behave as they do today until the user configures a narrower policy.
- A policy that requests `fileAccess` fails with a clear containment error until a subprocess runner can enforce it.
- A turn with invalid or unresolved policy fails visibly instead of falling back to broader authority.
- In a multi-agent room, inspection explains why each agent woke or stayed quiet and which policy governed its session.

### Regressions to avoid

- The TUI must not require gateway availability or pass through session admission.
- Invalid configuration must never fall back to the default policy.
- A live session must not silently adopt a materially different policy after configuration changes.
- Tool narrowing must not be presented as filesystem containment.
- Messages, room names, display names, and membership must never grant authority.

## Open decision

### Credentials for detached children

File-based results are enough; workers do not need a streaming protocol. The unresolved question is model access. Brokered model calls require a live parent, but today's detached workers can outlive the CLI that spawned them.

Choose between two honest options:

- Require a running gateway to broker credentials and model traffic for sandboxed workers.
- Let detached workers keep credentials and provide filesystem-only sandboxing as the weaker default.

## Boundaries

- No named profile registry, no RBAC, no policy-expression language, no approval framework.
- Foreground TUI sessions never pass through admission and never carry policy.
- `channelPolicy` remains attention only. Channel names key an agent's own configuration; rooms, messages, membership, and display names never grant authority.
- No per-sender sessions or per-sender policy inside a channel; different needs get different channels or different agents.
- Restricted policies never expose Bash, arbitrary subprocess execution, or a free-form Shrimpy CLI wrapper unless the sandbox is the boundary containing them.
- No tool-level path checking, advisory or otherwise; only the subprocess runner may claim containment, and only for what it actually contains.
- No legacy shims for `profileId` in keys, IDs, or storage paths; remove the segment instead of aliasing it.
- Prompt-loaded workspace and agent context stay shared and non-sensitive across all sessions of an agent; there are no per-policy prompt permissions.

## Build sequence

1. `SessionPolicy` schema, agent default-policy-as-allowlist, per-channel policy blocks, ceiling validation at config load.
2. Remove `profileId` from `SessionKey`; key pool lanes by full key.
3. Admission function before gateway session open; manifest records resolved policy; pinned-policy conflict handling.
4. Name the in-process runner backend and its refusal rule.
5. Subprocess runner: sandboxed child process hosting a Pi session, Seatbelt/bubblewrap profile generation from policy, results through files, absorbing the worker spawn path.
6. Workers as runner consumers, sandboxed by default; external backends map policy to native sandbox flags.
7. Public room sender grants and remote command gating.
8. Move command watches onto the subprocess runner.

## Touches

- `src/config/` for the policy schema, agent default policy, per-channel blocks, sender grants, and load-time validation.
- `src/sessions/identity.ts`, `spec.ts`, `resolver.ts`, `manifest.ts`, `open.ts`, and `pool.ts`.
- `src/tools/policy.ts` for allowlist construction.
- `src/agents/channel-runtime.ts` for admission before dispatch.
- `src/surfaces/shared/` for authenticated sender facts and command permission.
- `src/workers/` for the runner-consumer refactor and backend sandbox-flag mapping.
- A new runner module for backend selection, sandbox profile generation, and the subprocess host.
- `docs/reference/security.md`, `sessions.md`, `tools.md`, `runtime.md`, and `configuration.md`.

## Done

- Every gateway-mediated session's authority is an exact recorded allowlist, including default sessions; the TUI path is untouched.
- An agent's authority can differ per channel, bounded by its ceiling and visible in inspection, without any new session-identity machinery.
- Admission resolves policy before session open; failures are closed and explained.
- A `fileAccess` policy is enforced by kernel sandboxing in a subprocess runner, or refused; no pseudo-bounded middle state exists.
- Command watches no longer execute unrestricted shell in the gateway process.
- Worker runs are sandboxed by default, there is one child-session spawn path, and no external backend runs with sandboxing disabled unless explicitly configured.
- Inspection distinguishes in-process tool narrowing from subprocess containment.
- Tests cover ceiling validation, per-channel policy resolution, full-key lanes, fail-closed admission, pinned-policy conflicts, sandbox profile generation, blocked senders, and mixed-agent rooms.
