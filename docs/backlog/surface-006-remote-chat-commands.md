# 🦐 SURFACE-006: Remote Chat Commands

Status: todo
Priority: P2
Area: Surfaces
Depends On: none

## Why

Remote chat users need a small operational view of the conversation they are currently using. Telegram already supports session reset/restore/stop, thinking changes, addressed-agent switching, status, and help, but its `/status` output only shows routing basics and its command implementation is Telegram-local.

The goal is not TUI parity. A remote chat should expose the few facts and controls that help a user understand or recover the current chat, while detailed workspace, context, skill, model-auth, and diagnostic inspection stays in the CLI and TUI.

## Build

- Define one small adapter-neutral remote command service for `/new`, `/clear`, `/restore`, `/stop`, `/thinking`, `/agent`, `/status`, and `/help`.
- Keep transport parsing thin: each adapter recognizes its command syntax, constructs a shared command context, and sends the returned surface-local text or typed channel control/status message.
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
- Do not introduce interactive settings or model selectors in chat. A later argument-driven command needs its own concrete use case and safety policy.
- Do not add legacy shims or migration paths.

## Shape

The shared seam is command semantics and focused status data, not one universal renderer. Telegram and Discord can share command handlers while applying their own escaping, Markdown, length, and menu-registration rules.

Read-only commands return surface-local output without waking an agent. State-changing commands publish the same typed channel control records used today, so the gateway remains the owner of session lifecycle changes and durable acknowledgements.

## Implementation Notes

- Current Telegram command handling lives in `src/surfaces/telegram/commands.ts`.
- Current TUI status collection is mixed with rendering in `src/tui/shrimpy-command-surface.ts`; extract only collectors needed by the remote overview rather than moving its section registry wholesale.
- Gateway lane state is already inspectable through runtime-state and gateway-status services. If active model or thinking state cannot be obtained accurately without opening or mutating a session, omit it from the first overview.
- The existing CLI commands remain the deep inspection contract: `shrimpy status`, `shrimpy gateway status`, `shrimpy surface show`, `shrimpy sessions list`, and `shrimpy sessions compaction`.
- Add tests for shared command routing, Telegram parsing/rendering, concise status disclosure, unsupported-command help, transport message-size behavior, and the split between read-only output and logged controls.

## Done

- Telegram `/status` gives a concise, accurate view of the current remote chat and gateway/session state.
- Telegram `/help` lists only the supported remote command set.
- Shared command semantics can be reused by the Discord adapter without importing Telegram code.
- Remote status output omits local-only and sensitive operational detail.
- Read-only commands do not prompt agents or enter channel history; state-changing commands retain their typed control/status path.
- Tests cover shared routing, Telegram formatting, disclosure boundaries, and failure cases.
