---
status: draft
priority: P3
area: Surfaces
depends_on:
  - SURFACE-010
---

# 🦐 SURFACE-008: Buzz ACP Harness Integration

## Why

Buzz remains a plausible primary human chat UX for Shrimpy, but its integration boundary has moved materially since this proposal was first written. Buzz v0.5.0 added Bring Your Own Harness support for arbitrary ACP-speaking agents, v0.5.1 made custom harnesses configurable from the agent dialogs, and v0.5.2 aligned CLI mention delivery with Desktop. The maintained `buzz-acp` harness now owns the low-level Nostr and chat-runtime work that the original proposal expected Shrimpy to implement.

The revised direction is to expose a selected Shrimpy agent through [SURFACE-010](surface-010-acp-agent-server.md) and register that command as a Buzz custom harness. Buzz should own relay connectivity, Nostr identity, channel discovery, membership, author gates, mention subscriptions, per-channel queues, reconnect/replay, and agent presentation. Shrimpy should own its agent profile, model runtime, context, tools, ACP sessions, and transcripts.

See [buzz-shrimpy-environment.md](../../research/buzz-shrimpy-environment.md) for the earlier deployment and protocol research. Its native Nostr adapter recommendation predates Buzz's generic ACP runtime seam and should not be treated as the current implementation plan.

## Current State

- Shrimpy has no ACP server, so Buzz cannot launch it as a custom ACP harness yet.
- Pi 0.83.0 provides an embeddable `AgentSession` API and a Pi-specific JSONL RPC mode, but no built-in ACP mode. A standalone Pi ACP adapter would bypass Shrimpy's agent profiles and session ownership.
- Buzz's `buzz-acp` can spawn any ACP agent command over stdio. It handles `initialize`, creates one ACP session per active Buzz channel, sends prompts and mid-turn input, cancels or rotates sessions, and expects the agent to reply through the Buzz CLI or configured Buzz tool boundary.
- Buzz Desktop can register a custom harness command and arguments without a Buzz source change. Its managed agent flow supplies the relay identity and runtime environment.

## UX Implications

The user installs or connects Buzz, then chooses Shrimpy as the runtime for a Buzz agent and selects an existing Shrimpy agent id. A mention in an admitted Buzz room starts or continues a Shrimpy-backed ACP session for that room. The Shrimpy agent replies in the same Buzz room or thread through the Buzz-provided CLI/tool environment.

Buzz remains the visible chat history and the place where the user manages room membership, mentions, cancel/rotate controls, and agent presentation. Shrimpy retains its normal session transcript for the work it performed, but the first version does not mirror every Buzz message into a second Shrimpy workspace channel. The user should not have to configure relay URLs, Nostr event kinds, replay cursors, or signing keys in Shrimpy.

The default interaction should preserve Buzz's conservative owner-only author gate and mention-only delivery. Broader author allowlists, always-on subscriptions, heartbeats, and parallel harness processes remain explicit Buzz configuration rather than implicit Shrimpy behavior.

## Build

- Depend on a tested `shrimpy acp --agent <id>` entrypoint from SURFACE-010. Keep the selected Shrimpy agent fixed for the lifetime of the ACP process; Buzz channel sessions may not switch it through prompt content or client metadata.
- Add a mechanic-owned setup path that detects a compatible released Buzz installation, verifies `buzz-acp` and `buzz` CLI availability, registers or explains the Shrimpy custom harness definition, selects the Shrimpy agent id, and performs a mention/reply round trip. Prefer Buzz Desktop's inline custom-harness UI when it is available instead of editing app data directly.
- Use Buzz's custom runtime command and instance arguments to launch Shrimpy directly, for example command `shrimpy` with arguments `acp`, `--agent`, and the selected id. Do not insert Pi's RPC mode or the community `pi-acp` adapter between Buzz and Shrimpy.
- Let Buzz provision and retain the Nostr identity, relay authentication, channel memberships, author gate, mention filter, replay state, queue, session rotation, and process supervision. Do not copy those values into `config/shrimpy.json` or Shrimpy state.
- Preserve the Buzz-supplied runtime environment for the tools used by the ACP session so the agent can call the configured `buzz` CLI or Buzz tool server. Redact the environment from Shrimpy logs, diagnostics, transcripts, and error messages.
- Treat Buzz-provided base, workspace, channel, and message context as external session input below Shrimpy's system, profile, and authority rules. Buzz presentation metadata must not replace the selected agent's `SOUL.md`, model policy, tools, or workspace boundaries.
- Validate the smallest supported Buzz contract against a pinned released version: custom harness discovery, ACP initialization, channel-scoped `session/new`, text `session/prompt`, streamed updates, normal completion, cancellation, session rotation, child restart, and same-thread outbound publication.
- Exercise Buzz's default owner-only and mention-only gates plus one explicit allowlist configuration. Authorization rejected by Buzz must never reach Shrimpy; ACP admission and Shrimpy tool authority remain independently enforced by SURFACE-010.
- Document the supported Buzz version, the custom-harness setup, the ownership boundary, and the fact that Buzz is the authoritative chat log when the integration is implemented.

## Boundaries

- Do not add a `buzz` `ChatSurfaceModule` in the first version.
- Do not implement a Nostr WebSocket client, NIP-42 or NIP-98 authentication, event signing, HTTP replay, event-kind parsing, cursor storage, or duplicate suppression in Shrimpy. Those belong to Buzz and `buzz-acp` on this path.
- Do not store a Buzz Nostr private key, owner authorization tag, relay token, channel allowlist, or replay cursor in the Shrimpy workspace.
- Do not make Buzz protocol crates, SDKs, or `buzz-cli` runtime libraries part of Shrimpy. Buzz remains an external, versioned product dependency.
- Do not duplicate Buzz's author gate or room membership model as a second Shrimpy-specific Buzz authorization system. Shrimpy must still enforce its own ACP admission and tool authority.
- Do not let a Buzz agent definition redefine the selected Shrimpy agent's durable persona, model policy, skills, or tools. Buzz-specific context is scoped to the ACP session.
- Do not mirror Buzz traffic into Shrimpy channels until there is a separate product reason to maintain two chat logs and a clear deduplication contract.
- Do not broaden this item into generic ACP client support, Buzz canvases, workflows, git hosting, search, memory, feeds, media, huddles, or direct Nostr interoperability.
- Do not add legacy native-adapter config aliases, migration paths, or compatibility shims for the superseded proposal.

## Touches

- `src/commands/` for the ACP entrypoint supplied by SURFACE-010
- `src/skills/included/` for mechanic-guided Buzz connection and verification
- `docs/reference/` for the settled external integration contract
- Buzz Desktop custom harness configuration and the external `buzz-acp`/`buzz` executables

## Done

- A compatible Buzz release can launch `shrimpy acp --agent <id>` as a custom harness without a Shrimpy Nostr client or a Buzz source patch.
- An admitted mention creates or resumes the correct channel-scoped Shrimpy ACP session and reaches the selected Shrimpy agent exactly once.
- Follow-up and mid-turn Buzz messages obey Buzz's queue/steer behavior, while `!cancel` and `!rotate` map to cancellation and a fresh Shrimpy session without corrupting the prior transcript.
- The agent can reply through the Buzz-provided CLI/tool boundary, and the response appears in the correct Buzz room or thread under the Buzz-managed identity.
- Disallowed authors and unmentioned messages under the default gate never reach Shrimpy.
- Buzz or ACP child restarts recover according to Buzz's documented harness behavior without Shrimpy maintaining a second relay replay cursor.
- Shrimpy diagnostics expose useful ACP/session failures without logging Buzz credentials, authorization material, environment values, or message contents.
- Tests cover custom command construction, fixed agent selection, external-context precedence, environment redaction, multi-channel ACP session separation, cancellation/rotation, restart behavior, and a real Buzz mention/reply smoke test against the pinned release.
