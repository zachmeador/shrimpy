---
status: todo
priority: P2
area: Surfaces
depends_on: []
---

# 🦐 SURFACE-006: Remote Chat Commands

## Why

Remote chat users need a small operational view of the conversation they are currently using. Telegram already supports session reset/restore/stop, thinking changes, status, and help, but its `/status` output only shows routing basics and its command implementation is Telegram-local.

The goal is not TUI parity. A remote chat should expose the few facts and controls that help a user understand or recover the current chat, while detailed workspace, context, skill, model-auth, and diagnostic inspection stays in the CLI and TUI.

## UX Implications

Authorized remote users can inspect and control their current session but cannot switch its addressed agent from inside Telegram or another chat adapter. A person being present in an accepted transport thread does not by itself authorize commands. Blocked or unmapped senders execute no command, while a positively admitted limited sender may use only the small read-only subset explicitly granted to that profile.

Operators can still choose an adapter instance's `defaultAgentId` during setup or configuration and can use `shrimpy surface set-agent` or `clear-agent` for explicit per-thread overrides. Occasional cross-agent outbound messages remain attributed to their actual sender without changing either configuration.

## Authorization Contract

The shared command service must receive an authorization decision; it must not infer permission from the fact that an adapter recognized a command string or accepted the surrounding room.

Use a small permission vocabulary compatible with session admission:

- `none` — execute no remote command and publish no session control;
- `read-only` — execute only an explicit public-safe subset, initially at most `/help` and a deliberately minimal `/status`;
- `full` — execute the supported read-only and state-changing commands for the current session.

`read-only` is still an affirmative grant. An unknown, unmapped, blocked, malformed, or unverifiable sender receives `none`, not the limited profile by default. Transport allowlists, room membership, mentions, addressing, mutable display names, and command spelling are not command authorization.

The first owner-only adapters may derive `full` from their existing required user allowlists. The service boundary should nevertheless require a typed authorization input so SECURITY-006 admission can later supply the resolved Shrimpy command permission without replacing command semantics or adding a second permission system.

## Build

- Define one small adapter-neutral remote command service for `/new`, `/clear`, `/restore`, `/stop`, `/thinking`, `/status`, and `/help`.
- Keep transport parsing thin: each adapter recognizes its command syntax, constructs a shared command context containing stable authenticated sender identity and an explicit command permission, and sends the returned surface-local text or typed channel control/status message.
- Authorize before invoking status collectors, reading session state, mutating anything, or publishing a typed control message. A denied request must not partially execute while constructing its response.
- Centralize the command-to-required-permission table in the shared service. Adapters may further restrict their supported command set but may not independently elevate a sender.
- Keep denial behavior conservative and adapter-appropriate: either ignore the request or return a generic unauthorized response without confirming private session, agent, model, queue, or routing facts.
- Preserve authenticated actor and user provenance on state-changing control messages so downstream inspection can explain who requested the action. Do not accept caller-supplied display identity as evidence.
- Replace Telegram's routing-only `/status` with one concise overview containing:
  - surface/thread and Shrimpy channel
  - addressed and default agent
  - current thinking level and effective model when they can be read accurately for the active channel session
  - gateway/session lane state such as idle, running, queued, or recently failed
  - short CLI pointers for deeper inspection
- Keep `/status` as one overview in the first pass. Do not copy the TUI's workspace, watches, agents, channels, context, skills, model, and doctor section registry into chat.
- Keep `/help` limited to commands actually supported by that adapter.
- Reuse focused runtime collectors where the CLI or TUI already exposes the same fact. Render chat text separately so local and remote surfaces can choose different detail and disclosure.
- Keep output within one normal transport message when practical; trim optional detail before splitting into multiple messages.

## Boundaries

- Do not make remote chat a TUI clone or promise section-by-section parity.
- Do not expose filesystem paths, configured agent roots, skill inventories, prompt/context contents, auth/model state paths, tokens, provider internals, or private session summaries.
- Do not shell out to the `shrimpy` CLI from a surface handler. Shared collectors sit below CLI and surface renderers.
- Do not publish read-only `/status` or `/help` output into channel history as agent-authored text.
- Keep state-changing session commands as typed control messages with their existing durable operation-status acknowledgement path.
- Do not execute any handler, collector, or control publication for permission `none`.
- Do not treat an accepted room, authorized bot installation, known transport account, channel membership, mention, or addressed agent as sufficient command authority.
- Do not let adapters define broader meanings for `read-only` or `full`; the shared service owns the permission matrix and adapters may only narrow it.
- Do not return private operational facts in denial messages or use different denial details as an identity/session-existence oracle.
- Do not expose addressed-agent switching as a remote chat command. Adapter defaults and per-thread overrides remain operator-controlled through setup, configuration, and `shrimpy surface set-agent` or `clear-agent`; agent/session navigation stays local to the TUI.
- Keep occasional cross-agent delivery as an explicit, attributed outbound send to a bound channel. It does not change the configured default agent, a per-thread override, or channel membership.
- Do not introduce interactive settings or model selectors in chat. A later argument-driven command needs its own concrete use case and safety policy.
- Keep sender authorization and session-profile selection below the shared command service; remote command parsing must not become a second permission system.
- Do not add legacy shims or migration paths.

## Shape

The shared seam is command semantics, permission requirements, and focused status data, not one universal renderer. Telegram and Discord can share command handlers while applying their own escaping, Markdown, length, menu-registration, and conservative denial behavior.

Authorized read-only commands return surface-local output without waking an agent. Authorized state-changing commands publish the same typed channel control records used today, so the gateway remains the owner of session lifecycle changes and durable acknowledgements. Permission `none` reaches neither path.

## Implementation Notes

- Current Telegram command handling lives in `src/surfaces/telegram/commands.ts`.
- Current TUI status assembly lives in `src/tui/status.ts`. Reuse the focused collectors beneath it where they already expose the needed facts rather than importing its TUI-oriented section registry or renderer.
- Gateway lane state is already inspectable through runtime-state and gateway-status services. If active model or thinking state cannot be obtained accurately without opening or mutating a session, omit it from the first overview.
- The existing CLI commands remain the deep inspection contract: `shrimpy status`, `shrimpy gateway status`, `shrimpy surface show`, `shrimpy sessions list`, and `shrimpy sessions compaction`.
- Add tests for the `none`/`read-only`/`full` matrix, fail-closed missing identity or permission, shared command routing, Telegram parsing/rendering, concise status disclosure, denial disclosure, unsupported-command help, transport message-size behavior, and the split between read-only output and logged controls.

## Done

- Telegram `/status` gives a concise, accurate view of the current remote chat and gateway/session state.
- Telegram `/help` lists only the supported remote command set.
- Shared command semantics can be reused by the Discord adapter without importing Telegram code.
- Remote status output omits local-only and sensitive operational detail.
- Unknown, unmapped, blocked, and unverifiable senders cannot execute read-only or state-changing commands.
- A positively admitted limited sender can execute only the explicitly granted read-only subset, and permission checks happen before any collector, mutation, or control publication.
- State-changing command records retain authenticated requester provenance for inspection.
- Read-only commands do not prompt agents or enter channel history; state-changing commands retain their typed control/status path.
- Tests cover shared routing, the complete permission matrix, fail-closed authorization, Telegram formatting, disclosure boundaries, and failure cases.
