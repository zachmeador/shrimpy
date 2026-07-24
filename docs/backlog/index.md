# 🦐 Backlog

Active engineering notes for `shrimpy`. Completed work belongs in git history and stable docs.

Status `draft` means the maintainer is not sure about the item yet. Status `review` means an implementation is ready for maintainer review but not yet closed out.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [TUI-004](tui-004-agent-session-navigator.md) | review | P2 | TUI | none | Pi-style `/agents` navigator for active local sessions |
| [CTX-011](ctx-011-workspace-knowledge-breadcrumbs.md) | todo | P2 | Context | workspace search | Workspace knowledge breadcrumbs in turn context |
| [CTX-012](ctx-012-exact-context-command-parity.md) | todo | P2 | Context | [CTX-013](ctx-013-separate-stable-context-and-turn-producers.md) | Exact provider-facing context from `shrimpy context` |
| [CTX-013](ctx-013-separate-stable-context-and-turn-producers.md) | draft | P2 | Context | none | Separate stable context resources from automatic turn producers |
| [WATCH-001](watch-001-per-agent-watch-reload-isolation.md) | draft | P2 | Watches | none | Isolate watch loading and reload failures to the owning agent |
| [CHANNEL-001](channel-001-watch-message-backlog-contract.md) | draft | P2 | Channels | none | Decide and expose watch-message replay behavior across gateway restarts |
| [SECURITY-001](security-001-agent-sandboxing-security-strategy.md) | todo | P2 | Security | none | Local agent sandboxing |
| [SECURITY-002](security-002-public-chat-limited-sessions.md) | draft | P2 | Security | none | Public chat limited sessions |
| [SETUP-004](setup-004-safe-environment-update.md) | draft | P1 | Setup | none | Safe Shrimpy environment update that preserves mechanic model access |
| [SURFACE-002](surface-002-chat-delivery-attribution.md) | todo | P2 | Surfaces | none | Chat delivery attribution |
| [SURFACE-003](surface-003-chat-operation-status.md) | todo | P2 | Surfaces | none | Terminal chat compaction failure status |
| [SURFACE-004](surface-004-discord-dm-chat-adapter.md) | todo | P2 | Surfaces | [SURFACE-006](surface-006-remote-chat-commands.md) | Discord DM chat adapter |
| [SURFACE-006](surface-006-remote-chat-commands.md) | todo | P2 | Surfaces | none | Small remote chat command and status service |

## Later

Deferred notes that are intentionally outside the active backlog.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [CTX-008](later/ctx-008-runtime-context-producers.md) | todo | P2 | Context | none | Runtime context producers as CLI commands |
| [CTX-009](later/ctx-009-context-trace-debug-view.md) | todo | P2 | Context | [CTX-008](later/ctx-008-runtime-context-producers.md) | First-class context trace/debug view |
| [AGENT-001](later/agent-001-nested-agents.md) | todo | P3 | Agents | [CTX-008](later/ctx-008-runtime-context-producers.md) | Nested parent-managed agents |
| [CODE-003](later/code-003-claude-code-worker-adapter.md) | todo | P3 | Coding Agents | none | Claude Code worker adapter |
| [CODE-004](later/code-004-agent-worker-tools.md) | todo | P3 | Coding Agents | none | Agent worker tools |
| [MEM-001](later/mem-001-session-title-summarizer.md) | draft | P3 | Memory | [TUI-004](tui-004-agent-session-navigator.md) | Validate and optionally generate canonical Pi session names |
| [RUNTIME-001](later/runtime-001-optional-spend-controller.md) | draft | P3 | Runtime | none | Optional spend controller for external agent wallets |
| [SEARCH-003](later/search-003-workspace-search-embeddings.md) | todo | P3 | Search | workspace search | Optional local embeddings for workspace search |
| [SURFACE-007](later/surface-007-web-chat-surface.md) | draft | P3 | Surfaces | none | Deferred owner-local web chat surface |
| [TUI-011](later/tui-011-terminal-title-agent-label.md) | draft | P3 | TUI | upstream Pi title hook | Terminal title identifies the active agent without a private patch |
| [WORKSPACE-002](later/workspace-002-tiered-checkpoint-retention.md) | todo | P3 | Workspace | workspace checkpoint tracking | Tiered workspace checkpoint retention |
