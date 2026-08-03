---
status: draft
priority: P2
area: Security
depends_on:
  - SURFACE-006
---

# 🦐 SECURITY-006: Session Authority

Replaces SECURITY-002, SECURITY-003, SECURITY-004, SECURITY-005, and WATCH-002.

## Why

Channels are Shrimpy's intentional scoping unit: they are cheap, a workspace accumulates many of them, and most are dedicated to a narrow purpose. An agent's session for a channel is the natural home for that purpose's continuity — including autonomous watch turns, which share that continuity deliberately. What is missing is authority: an agent has one effective tool policy everywhere it runs, so its sessions in a scratch channel, a public room, and its owner's private channel all carry identical full power.

The prior security notes treated the channel-session coupling as an accident and built parallel identity machinery around it: named security profiles, profile ids fused into session identity, watch-owned sessions, per-sender public sessions. This note keeps the coupling — it is the design — and adds the missing half: per-channel policy owned by each agent, enforced by the runner.

Four rules carry the design:

1. **Channels scope; each agent owns its policy.** An agent may declare a `SessionPolicy` for its session in a specific channel. The channel name keys the agent's own configuration; rooms, messages, membership, and other agents never grant or impose authority. In a room full of agents, every agent's per-channel policy is independently its own — a restricted agent and a powerful one share rooms freely. Want a different context or different permissions? Make another channel.
2. **Policy is inline and recorded.** One `SessionPolicy` schema, carried by the owning agent's configuration (or an explicit run's flags), resolved before session open, recorded in the session manifest at open. No named profile registry, no profile ids, no policy versioning.
3. **Enforcement lives in the runner.** A resolved policy configures how the session executes. The in-process runner is the honestly-named default; policies that claim containment (`fileAccess`) run only under the sandboxed subprocess runner and fail closed until it exists.
4. **The TUI is the owner's hands.** Foreground TUI sessions carry no `SessionPolicy` and never pass through admission. Policy attaches only to gateway-mediated turns and to CLI runs that explicitly request one.

## Current State

- `SessionKey` is `{agentId, namespace, name, profileId}`; `profileId` separates storage but has no capability semantics and nothing non-default constructs it.
- `SessionResolver` applies one agent-level tool policy; Pi receives a denylist (`excludedToolNames`), so custom and extension tools can be active unless exhaustively excluded.
- Agent tool policy is global: there is no way to narrow an agent's authority for one channel, so watch turns and public rooms get the agent's full power along with the channel's continuity.
- `SessionPool` keys lanes by channel name rather than full session identity.
- Command watches execute shell directly in the gateway process — the largest live authority hole in the system.
- Workers already spawn detached child processes that host a session (`src/workers/runner.ts`): the child boots a full `AppRuntime` with workspace credentials and runs a `worker/<id>` session through the same foreground path the CLI uses, returning results through files with no IPC. The `codex` backend passes `sandbox_mode="danger-full-access"`. Workers are an unsandboxed proto-subprocess-runner with a parallel spawn path of their own.
- Transport acceptance (for example Telegram `allowedChatIds`) admits whole rooms; surface user mappings and `state/users.json` provide stable identity but no permission semantics.
- Sessions execute inside whichever trusted process opened them: the gateway daemon for channel and watch turns, the CLI process for foreground TUI sessions. A session's syscalls carry its host process's full authority.

## Direction

### SessionPolicy schema

One schema, used everywhere a session's authority is described:

```ts
interface SessionPolicy {
  tools: string[];                    // exact active-tool allowlist, always
  fileAccess?: { roots: { path: string; access: "read" | "read-write" }[] };
  commandPermission: "full" | "read-only" | "none";
}
```

The agent's own configuration defines its **default policy**, expressed in this same schema as a computed permissive allowlist (current builtins plus daemon tools minus `disabledTools`). That default is also the agent's **capability ceiling**: every other policy resolved for the agent must be a subset, validated with set math when configuration loads. Invalid configuration fails loudly at load, never at dispatch.

There is no registry. The agent's config may declare per-channel policy blocks that override its default for its session in that channel; an explicit CLI run may pass a policy inline. A per-channel block may also select a model policy — a sibling field, adjacent to but never inside `SessionPolicy`.

### Identity

Drop `profileId` from `SessionKey`, session ids, and storage paths. No new namespaces: `local`, `channel`, and `worker` remain, and continuity stays channel-per-agent. Isolation is achieved by channel choice, not by session-identity machinery — a narrow job that should not share continuity with a conversation gets its own channel.

Every key remains agent-scoped: `agentId` is the first field, so four agents in one channel are four separate `channel/<name>` sessions with separate transcripts, models, tools, and policies. Agents never share a session by sharing a room; the channel is the shared log, and each agent's `channelPolicy` decides independently whether a message wakes it.

### Agents and ceilings

An agent that should be limited *everywhere* needs no per-channel machinery: its own configuration is its default policy and its ceiling, so a narrow agent config (few tools, no Bash, cheap model) is the whole mechanism. Per-channel blocks narrow *below* the ceiling for specific rooms. A mixed channel with one powerful agent and several limited ones is the ordinary case, not a special one: each agent wakes into its own session under its own policy, and no message between them transfers authority in either direction.

### Admission

One small function before session open for gateway-mediated turns:

```ts
type AdmissionDecision =
  | { action: "dispatch"; key: SessionKey; policy: SessionPolicy; reason: string }
  | { action: "ignore"; reason: string }   // nothing to run; quiet
  | { action: "block"; reason: string };   // an authorization boundary was hit; loud and inspectable
```

After `channelPolicy` attention, admission resolves the agent's policy for the channel — the per-channel block if present, the default otherwise — and fails closed when configuration is invalid; nothing falls back to the default policy on error. Durable sender grants keyed by stable `userId`/`actorId` decide whether a sender may wake the agent at all versus being blocked; unknown, unmapped, or unverifiable senders block. Authority never travels through message content — not sender display names, not room labels, not policy strings carried in message data.

`SessionPool` lanes, queues, cached plans, and lifecycle operations key by the full `SessionKey`. The manifest records the resolved policy at every open. A live lane pins its opening policy; if configuration changes so that admission resolves a materially different policy for the same key, the turn fails with an actionable error naming the session to stop or clear — no silent reuse, no silent reopen.

### Runner

`SessionOpenPlan + SessionPolicy → runner backend → Pi session`.

Backend one is `in-process`, the current behavior made explicit: the session runs inside the process that opened it, with that process's authority. It remains the permanent default for ordinary trusted work. It **refuses** any policy that claims `fileAccess`, because a session hosted inside the gateway or CLI cannot have that claim enforced — refusing beats politely pretending.

Backend two is a `subprocess` runner: a fresh child process, sandboxed at launch, hosting the Pi session and speaking to the gateway over stdio RPC. Its containment is generated directly from the policy — on macOS a Seatbelt profile (`deny default`, `allow file-read*`/`file-write*` subpaths per root), on Linux a bubblewrap mount namespace or Landlock ruleset with the same shape. The kernel resolves paths at syscall time, so symlink escapes, traversal, and check-to-use races are the kernel's problem, and children of the session (including Bash, where the policy allows it) inherit the same boundary.

The stdio RPC carries everything that crosses the trust boundary: channel delivery, and model provider calls brokered by the gateway. Brokering model traffic means provider credentials never enter the child process. Session storage, workspace config, and credentials all stay on the gateway side of the RPC boundary; the child's filesystem view is its cwd plus the policy's `fileAccess` roots and nothing else.

Network egress policy is out of scope. Web capability comes from the tool allowlist: a session without Bash or web-capable tools has no web capability, and that is enough. A network field can join `SessionPolicy` later if a concrete workflow needs egress control on a session that legitimately holds network-capable tools.

The subprocess runner absorbs the worker spawn machinery rather than growing beside it. The existing worker child already proves most of the shape — spawn a child, run one session turn, return results through files, no streaming RPC — so the runner starts from that pattern and adds containment. Workers keep their lifecycle, turns, and records as a consumer of the runner, not as a second way to spawn sessions.

For external worker backends (`codex`, later `claude`), the runner maps `SessionPolicy` onto the backend's native sandbox flags instead of wrapping the backend in Seatbelt: one policy vocabulary, per-backend enforcement. The current `sandbox_mode="danger-full-access"` default is replaced by this mapping.

Command watches become this runner's first non-model consumer: a policy with no tools and a command, replacing their current unrestricted shell path.

### Bounded file access

`fileAccess` is enforced by the subprocess runner's sandbox, and only there. There are no replacement or path-checking file tools: sessions use the ordinary Pi tools, and out-of-bounds operations hit kernel denials. The model learns its boundary from context, not tool behavior — the recorded roots are stated in the session's turn context, and Shrimpy may annotate a surfaced denial error with those roots so the model self-corrects instead of flailing. That is explanation, never enforcement. A policy with `fileAccess` must not be described as enforced until it runs under a containing backend. The tool-level enforcement design in [shrimpy-constrained-tool-profile.md](../../research/shrimpy-constrained-tool-profile.md) is superseded by kernel enforcement.

### Consumers

**Foreground TUI.** Exempt by construction. No policy machinery in the path at all; works with the gateway off; behaves exactly as today. Nobody secures the owner's terminal against the owner.

**Watches.** Unchanged in shape: a message watch publishes to its target channel and wakes the handling agent's channel session, sharing that channel's continuity deliberately. Isolation and restriction come from channel choice — a narrow autonomous job gets its own channel, and each handling agent's per-channel policy and model policy make that session exactly as capable as the job needs. No watch session namespace, no per-watch session config. Command watches are unrelated to this path; they move onto the subprocess runner.

**Public chat.** A public room maps to a channel, and the agent's per-channel policy for it is narrow — for example `reply` and `ask` only, `commandPermission: "read-only"` against the SURFACE-006 matrix. Everyone in the room, owner included, talks to the same limited session; privileged work belongs in another channel. Sender grants decide who may wake the agent versus being blocked, and per-sender command permission stays with SURFACE-006. For privileged presence inside a public room, use two agents: a restricted one that talks to everyone and a powerful one whose `channelPolicy` wakes only for the owner. Attention and per-agent policy compose; no per-sender sessions exist.

**Workers.** Workers become the subprocess runner's first session consumer, and worker runs are **sandboxed by default** once the runner exists — an unsandboxed worker requires explicit configuration, inverting today's default. A worker's policy resolves through the same admission path; the `worker/<id>` session, lifecycle, turns, and records are unchanged.

**Explicit runs.** A CLI run may opt into a validated inline policy through the same admission path. Opting in means the refusal rule applies: a requested `fileAccess` policy errors until a containing runner can honor it.

## UX Implications

Inspecting any gateway-mediated session answers: which channel and agent produced it, the exact tools, roots, and command permission recorded at open, whether a per-channel block or the agent default supplied them, and which runner backend enforced them. `shrimpy sessions show` gains the recorded policy; `shrimpy channels` and agent inspection surface per-channel blocks; a policy check command explains a representative decision without touching anything.

Ordinary trusted work is unchanged: the TUI, default channel sessions, and existing watches behave exactly as today until a per-channel block says otherwise. Until the subprocess runner exists, configuring a policy with `fileAccess` fails at validation with a clear "needs containment" error instead of running pseudo-bounded. A turn whose policy cannot be resolved fails with a visible reason instead of quietly running under the default.

In a room full of agents, inspection can explain per message why each agent woke or stayed quiet and which policy its session ran under — so wacky multi-agent rooms stay debuggable without anyone sharing anyone else's authority.

## Open Decisions

Deliberately few; the rest of the note states decided positions.

- The credential story for detached children. The worker evidence narrows the old RPC unknown considerably: file-based results are enough, no streaming protocol is needed. What remains is that brokered model calls require a live parent, while today's worker children are detached and can outlive the CLI that spawned them. Either sandboxed workers require a running gateway to broker credentials and model traffic, or detached children keep credentials and settle for a filesystem-only sandbox as the weaker-but-honest default.

## Boundaries

- No named profile registry, no RBAC, no policy-expression language, no approval framework.
- Foreground TUI sessions never pass through admission and never carry policy.
- `channelPolicy` remains attention only. Channel names key an agent's own configuration; rooms, messages, membership, and display names never grant authority.
- No per-sender sessions or per-sender policy inside a channel; different needs get different channels or different agents.
- Restricted policies never expose Bash, arbitrary subprocess execution, or a free-form Shrimpy CLI wrapper unless the sandbox is the boundary containing them.
- No tool-level path checking, advisory or otherwise; only the subprocess runner may claim containment, and only for what it actually contains.
- No legacy shims for `profileId` in keys, ids, or storage paths; the segment is removed, not aliased.
- Prompt-loaded workspace and agent context stays shared and non-sensitive across all sessions of an agent; no per-policy prompt permissions.

## Sequence

1. `SessionPolicy` schema, agent default-policy-as-allowlist, per-channel policy blocks, ceiling validation at config load.
2. Remove `profileId` from `SessionKey`; key pool lanes by full key.
3. Admission function before gateway session open; manifest records resolved policy; pinned-policy conflict handling.
4. Name the in-process runner backend and its refusal rule.
5. Subprocess runner: sandboxed child process hosting a Pi session, Seatbelt/bubblewrap profile generation from policy, results through files, absorbing the worker spawn path.
6. Workers as runner consumers, sandboxed by default; external backends map policy to native sandbox flags.
7. Public room sender grants and SURFACE-006 command gating.
8. Move command watches onto the subprocess runner.

## Touches

- `src/config/` for the policy schema, agent default policy, per-channel blocks, sender grants, and load-time validation
- `src/sessions/identity.ts`, `spec.ts`, `resolver.ts`, `manifest.ts`, `open.ts`, `pool.ts`
- `src/tools/policy.ts` for allowlist construction
- `src/agents/channel-runtime.ts` for admission before dispatch
- `src/surfaces/shared/` for authenticated sender facts and command permission
- `src/workers/` for the runner-consumer refactor and backend sandbox-flag mapping
- a new runner module for backend selection, sandbox profile generation, and the subprocess host
- `docs/reference/security.md`, `sessions.md`, `tools.md`, `runtime.md`, `configuration.md`

## Done

- Every gateway-mediated session's authority is an exact recorded allowlist, including default sessions; the TUI path is untouched.
- An agent's authority can differ per channel, bounded by its ceiling and visible in inspection, without any new session-identity machinery.
- Admission resolves policy before session open; failures are closed and explained.
- A `fileAccess` policy is enforced by kernel sandboxing in a subprocess runner, or refused; no pseudo-bounded middle state exists.
- Command watches no longer execute unrestricted shell in the gateway process.
- Worker runs are sandboxed by default, there is one child-session spawn path, and no external backend runs with sandboxing disabled unless explicitly configured.
- Inspection distinguishes in-process tool narrowing from subprocess containment.
- Tests cover ceiling validation, per-channel policy resolution, full-key lanes, fail-closed admission, pinned-policy conflicts, sandbox profile generation, blocked senders, and mixed-agent rooms.
