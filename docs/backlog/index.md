# 🦐 Backlog

`docs/backlog/*.md` is the deliberately small now/soon engineering queue. Everything not explicitly scheduled belongs in `docs/backlog/proposals/`, even when its direction is mature or accepted. Completed work belongs in git history and stable docs.

Status `draft` means the product or implementation direction remains unsettled. Status `todo` means the direction is accepted enough to implement. Status `review` means an implementation is ready for maintainer review but not yet closed out. Status does not schedule an item; placement does.

## Now / Soon

No items are currently scheduled.

## Proposals

Unscheduled problem definitions and solution sketches worth preserving. Some are exploratory drafts; others are accepted directions waiting to be scheduled.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [WEB-001](proposals/web-001-record-rendering-and-folding.md) | todo | P1 | Web | none | Session and channel record rendering fixes with class-level folding |
| [WEB-002](proposals/web-002-two-row-inspector-header.md) | todo | P2 | Web | [WEB-001](proposals/web-001-record-rendering-and-folding.md) | Two-row inspector header splitting node info from reading controls |
| [WEB-003](proposals/web-003-tree-navigation-density.md) | draft | P2 | Web | none | Tree row density, filtering, and persisted expansion |
| [SECURITY-002](proposals/security-002-session-admission-security-profiles.md) | draft | P2 | Security | none | Generic session admission and named security profiles |
| [SECURITY-003](proposals/security-003-public-chat-limited-sessions.md) | draft | P2 | Security | [SECURITY-002](proposals/security-002-session-admission-security-profiles.md), [SURFACE-006](proposals/surface-006-remote-chat-commands.md) | Public chat sender admission and limited sessions |
| [SECURITY-004](proposals/security-004-path-bounded-file-tools.md) | draft | P2 | Security | [SECURITY-002](proposals/security-002-session-admission-security-profiles.md) | Path-bounded replacement file tools for constrained profiles |
| [SECURITY-005](proposals/security-005-session-scoped-authority-architecture.md) | draft | P2 | Security | none | Session-scoped authority architecture across admission, profiles, and runners |
| [WATCH-002](proposals/watch-002-watch-session-profiles.md) | draft | P2 | Watches | [SECURITY-002](proposals/security-002-session-admission-security-profiles.md) | Watch-owned sessions with named profiles and model policy |
| [SURFACE-004](proposals/surface-004-discord-dm-chat-adapter.md) | todo | P2 | Surfaces | [SURFACE-006](proposals/surface-006-remote-chat-commands.md) | Discord DM chat adapter |
| [SURFACE-006](proposals/surface-006-remote-chat-commands.md) | todo | P2 | Surfaces | none | Small remote chat command and status service |
| [SURFACE-008](proposals/surface-008-buzz-chat-adapter.md) | todo | P2 | Surfaces | none | Buzz chat adapter with mechanic-owned setup |
| [SURFACE-009](proposals/surface-009-telegram-managed-bot-skill.md) | draft | P2 | Surfaces | none | Skill-guided Telegram managed bots for agents |
| [WEB-004](proposals/web-004-node-viewers-and-legibility.md) | draft | P3 | Web | none | Specialized node viewers and transcript legibility pass |
| [PLATFORM-001](proposals/platform-001-native-windows-host-support.md) | draft | P3 | Platform | none | Native Windows host support |
| [CTX-008](proposals/ctx-008-runtime-context-producers.md) | draft | P3 | Context | none | Runtime context producers as CLI commands |
| [AGENT-002](proposals/agent-002-parent-owned-tidepools.md) | draft | P3 | Agents | [CTX-008](proposals/ctx-008-runtime-context-producers.md) | One-level child-agent tidepools owned by top-level agents |
| [AGENT-003](proposals/agent-003-shareable-agent-packages.md) | draft | P3 | Agents | none | Shareable agent definitions with safe package lifecycle |
| [CODE-003](proposals/code-003-claude-code-worker-adapter.md) | draft | P3 | Coding Agents | none | Claude Code worker adapter |
| [MEM-001](proposals/mem-001-session-title-summarizer.md) | draft | P3 | Memory | TUI-004 | Validate and optionally generate canonical Pi session names |
| [RUNTIME-001](proposals/runtime-001-optional-spend-controller.md) | draft | P3 | Runtime | none | Optional spend controller for external agent wallets |
| [SESSION-001](proposals/session-001-generation-throughput-metrics.md) | draft | P3 | Sessions | none | Provider-reported generation throughput in session JSONL |
| [SEARCH-003](proposals/search-003-workspace-search-embeddings.md) | draft | P3 | Search | workspace search | Optional local embeddings for workspace search |
| [SURFACE-007](proposals/surface-007-web-chat-surface.md) | draft | P3 | Surfaces | none | Deferred owner-local web chat surface |
| [WORKSPACE-002](proposals/workspace-002-tiered-checkpoint-retention.md) | draft | P3 | Workspace | workspace checkpoint tracking | Tiered workspace checkpoint retention |
