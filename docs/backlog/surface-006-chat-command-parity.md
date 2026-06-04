# 🦐 SURFACE-006: Chat Command Parity

Status: todo
Priority: P2
Area: Surfaces
Depends On: [SURFACE-005](surface-005-chat-surface-delivery-semantics.md)

## Why
Chat surfaces should expose roughly the same useful inspection and control affordances as the Shrimpy TUI where the workflow makes sense. Today the TUI `/status` command has rich sections for workspace, gateway, watches, agents, channels, context, skills, model, and diagnostics, while Telegram `/status` only reports routing basics such as current agent, default agent, channel, chat id, and known agents.

That leaves remote chat users without the operational picture they already get in the local TUI, especially when diagnosing gateway health, watch runs, channel state, active model, or agent configuration.

## Build
- Start with chat `/status [section]` parity for the TUI status sections: overview, workspace, gateway, watches, agents, channels, context, skills, model, and doctor.
- Reuse one shared status data/service layer so TUI, CLI, and chat surfaces do not drift into separate status implementations.
- Keep Telegram as the first adapter, but make the command rendering and status section selection adapter-neutral for future chat surfaces.
- Update chat `/help` to show status sections and any chat-supported TUI-equivalent commands.
- Audit existing TUI commands and decide their chat shape:
  - `/status` should become read-only sectioned output.
  - `/thinking` already has a chat form and should stay aligned with TUI thinking options.
  - `/model` may need a non-interactive chat form for viewing or switching the session model if that is safe.
  - `/settings` should not be copied as an interactive selector unless there is a chat-native, argument-driven settings workflow.
  - `/shrimpy` and `/help` should present the same Shrimpy-owned command inventory in surface-appropriate wording.
- Make long status sections message-size aware: concise by default, split only when needed, and include CLI inspection commands for deeper detail.
- Add `--json` or CLI-backed helpers where needed so chat status output is testable and agent-friendly.

## Boundaries
- Do not turn chat surfaces into a clone of the TUI.
- Do not expose secrets, prompt bodies, private session summaries, auth tokens, or provider internals in chat status output.
- Do not publish read-only command output into channel logs as agent-authored conversation.
- Do not require Telegram-specific code to know about every Shrimpy status subsystem.
- Do not add legacy shims or migration paths.

## Shape
Treat chat commands as surface-local command invocations that call shared Shrimpy inspection/control services. The TUI can render richer local blocks; chat adapters render compact Markdown/plain text with the same facts, section names, and command semantics where practical.

The first implementation should make `/status` and `/status <section>` useful from Telegram without prompting an agent. Later chat adapters should be able to reuse the same command registry and renderer with only transport-specific formatting and message-length handling.

## Implementation Notes
- Current TUI status sections live in `src/tui/shrimpy-command-surface.ts`.
- Current Telegram commands live in `src/surfaces/telegram/commands.ts`; Telegram `/status` is intentionally small today and should be replaced by the shared sectioned status path.
- Prefer extracting status collection/formatting from the TUI command surface instead of importing TUI components into chat code.
- Keep relationship with [SURFACE-005](surface-005-chat-surface-delivery-semantics.md): command output should remain typed surface-local output, not agent text.
- Tests should cover `/status`, section aliases or usage errors, Telegram formatting, message-size behavior, and parity with the shared status section registry.

## Done
- Telegram `/status` shows a useful overview comparable to TUI `/status`.
- Telegram supports `/status <section>` for the same status sections the TUI advertises, unless a section is explicitly marked local-only with a clear reason.
- Chat `/help` advertises the supported Shrimpy command set and status sections.
- Shared status services prevent TUI and chat status facts from diverging.
- Read-only chat command output does not prompt agents or appear as agent-authored channel conversation.
- Tests cover status section routing, formatting, and command-help parity.
