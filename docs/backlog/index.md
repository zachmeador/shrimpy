# 🦐 Backlog

Active engineering notes for `shrimpy`. Completed work belongs in git history and stable docs.

Status `draft` means the maintainer is not sure about the item yet. Status `review` means an implementation is ready for maintainer review but not yet closed out.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [WATCH-001](watch-001-per-agent-watch-reload-isolation.md) | draft | P2 | Watches | none | Isolate watch loading and reload failures to the owning agent |
| [SECURITY-001](security-001-agent-sandboxing-security-strategy.md) | todo | P2 | Security | none | Local agent sandboxing |
| [SECURITY-002](security-002-public-chat-limited-sessions.md) | draft | P2 | Security | none | Public chat limited sessions |
| [SURFACE-004](surface-004-discord-dm-chat-adapter.md) | todo | P2 | Surfaces | [SURFACE-006](surface-006-remote-chat-commands.md) | Discord DM chat adapter |
| [SURFACE-006](surface-006-remote-chat-commands.md) | todo | P2 | Surfaces | none | Small remote chat command and status service |
| [SURFACE-008](surface-008-buzz-chat-adapter.md) | todo | P2 | Surfaces | none | Buzz chat adapter with mechanic-owned setup |

## Proposals

Candidate problem definitions and solution sketches that are worth preserving but not yet accepted as backlog work.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [CTX-008](proposals/ctx-008-runtime-context-producers.md) | draft | P2 | Context | none | Runtime context producers as CLI commands |
| [CTX-009](proposals/ctx-009-context-trace-debug-view.md) | draft | P2 | Context | [CTX-008](proposals/ctx-008-runtime-context-producers.md) | First-class context trace/debug view |
| [CTX-012](proposals/ctx-012-product-agent-instruction-catalog.md) | draft | P2 | Context | none | Central catalog for Shrimpy-authored model instructions |
| [AGENT-002](proposals/agent-002-parent-owned-tidepools.md) | draft | P3 | Agents | [CTX-008](proposals/ctx-008-runtime-context-producers.md) | One-level child-agent tidepools owned by top-level agents |
| [AGENT-003](proposals/agent-003-shareable-agent-packages.md) | draft | P3 | Agents | none | Shareable agent definitions with safe package lifecycle |
| [CODE-003](proposals/code-003-claude-code-worker-adapter.md) | draft | P3 | Coding Agents | none | Claude Code worker adapter |
| [CODE-004](proposals/code-004-agent-worker-tools.md) | draft | P3 | Coding Agents | none | Agent worker tools |
| [MEM-001](proposals/mem-001-session-title-summarizer.md) | draft | P3 | Memory | TUI-004 | Validate and optionally generate canonical Pi session names |
| [RUNTIME-001](proposals/runtime-001-optional-spend-controller.md) | draft | P3 | Runtime | none | Optional spend controller for external agent wallets |
| [SEARCH-003](proposals/search-003-workspace-search-embeddings.md) | draft | P3 | Search | workspace search | Optional local embeddings for workspace search |
| [SURFACE-007](proposals/surface-007-web-chat-surface.md) | draft | P3 | Surfaces | none | Deferred owner-local web chat surface |
| [TUI-011](proposals/tui-011-terminal-title-agent-label.md) | draft | P3 | TUI | upstream Pi title hook | Terminal title identifies the active agent without a private patch |
| [WORKSPACE-002](proposals/workspace-002-tiered-checkpoint-retention.md) | draft | P3 | Workspace | workspace checkpoint tracking | Tiered workspace checkpoint retention |
