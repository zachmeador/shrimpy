# 🦐 Backlog

Active engineering notes for `shrimpy`. Completed work belongs in git history and stable docs.

Status `draft` means the maintainer is not sure about the item yet. Status `review` means an implementation is ready for maintainer review but not yet closed out.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [VAULT-001](vault-001-default-workspace-collections.md) | todo | P2 | Workspace | none | Default workspace collection conventions |
| [VAULT-002](vault-002-main-agent-capture-research.md) | todo | P2 | Workspace | [VAULT-001](vault-001-default-workspace-collections.md) | Main agent capture and research workflow |
| [SEARCH-001](search-001-web-lookup-capability.md) | todo | P2 | Search | none | Optional web lookup capability |
| [SEARCH-002](search-002-workspace-knowledge-search.md) | review | P2 | Search | none | Local workspace knowledge search |
| [MEM-002](mem-002-session-transcript-search.md) | review | P2 | Memory | none | Session transcript search |
| [TUI-004](tui-004-agent-session-navigator.md) | draft | P2 | TUI | none | Interactive `/agent` navigator for agents and sessions |
| [TUI-005](tui-005-model-switch-message-renderer.md) | todo | P2 | TUI | none | Native model-switch custom message rendering |
| [TUI-006](tui-006-expanded-tool-call-inspection.md) | todo | P2 | TUI | none | Expanded tool call inspection |
| [TUI-007](tui-007-pi-patch-surface-reduction.md) | todo | P2 | TUI | none | Shrink unsanctioned Pi TUI patch surface |
| [TUI-008](tui-008-resume-preview-context-stripping.md) | todo | P2 | TUI | none | Strip turn-context envelopes from `/resume` previews |
| [CTX-010](ctx-010-agent-watch-turn-context.md) | review | P2 | Context | none | Agent watch inventory in turn context |
| [CTX-011](ctx-011-workspace-knowledge-breadcrumbs.md) | todo | P2 | Context | [SEARCH-002](search-002-workspace-knowledge-search.md) | Workspace knowledge breadcrumbs in turn context |
| [CLI-001](cli-001-bounded-agent-output.md) | review | P2 | CLI | none | Bounded agent-facing CLI output |
| [APP-001](app-001.md) | todo | P2 | Apps | none | App and config pattern examples |
| [CAREER-001](career-001-resume-agent-workflow.md) | todo | P2 | Apps | [VAULT-001](vault-001-default-workspace-collections.md) | Career agent resume workflow |
| [SKILL-001](skill-001-pattern-reference-skill.md) | draft | P2 | Skills | none | All-agents pattern reference skill replacing mechanic ideas |
| [SECURITY-001](security-001-agent-sandboxing-security-strategy.md) | todo | P2 | Security | none | Local agent sandboxing |
| [SESSION-002](session-002-shared-session-model-resolver.md) | todo | P2 | Sessions | none | Single model resolver behind session open and models resolve |
| [SESSION-003](session-003-verified-gateway-session-lifecycle.md) | todo | P2 | Sessions | none | Gateway session lifecycle commands confirm and verify outcomes |
| [SETUP-002](setup-002-setup-entry-seams.md) | todo | P2 | Setup | none | Setup entry cwd/exit-code consistency and dead setup code removal |
| [SETUP-003](setup-003-opt-in-watch-seeding.md) | todo | P2 | Setup | none | Opt-in watch seeding with per-watch explanations |
| [SETUP-004](setup-004-safe-environment-update.md) | draft | P1 | Setup | none | Safe Shrimpy environment update that preserves mechanic model access |
| [SURFACE-002](surface-002-chat-delivery-attribution.md) | todo | P2 | Surfaces | none | Chat delivery attribution |
| [SURFACE-003](surface-003-chat-operation-status.md) | todo | P2 | Surfaces | none | Chat operation status updates |
| [SURFACE-004](surface-004-discord-dm-chat-adapter.md) | todo | P2 | Surfaces | none | Discord DM chat adapter |
| [SURFACE-006](surface-006-chat-command-parity.md) | todo | P2 | Surfaces | none | Chat command parity |
| [SURFACE-007](surface-007-react-web-chat.md) | todo | P2 | Surfaces | none | React web chat surface |

## Later

Deferred notes that are intentionally outside the active backlog.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [CTX-008](later/ctx-008-runtime-context-producers.md) | todo | P2 | Context | none | Runtime context producers as CLI commands |
| [CTX-009](later/ctx-009-context-trace-debug-view.md) | todo | P2 | Context | [CTX-008](later/ctx-008-runtime-context-producers.md) | First-class context trace/debug view |
| [AGENT-001](later/agent-001-nested-agents.md) | todo | P3 | Agents | [APP-001](app-001.md), [CTX-008](later/ctx-008-runtime-context-producers.md) | Nested parent-managed agents |
| [CODE-003](later/code-003-claude-code-worker-adapter.md) | todo | P3 | Coding Agents | none | Claude Code worker adapter |
| [CODE-004](later/code-004-agent-worker-tools.md) | todo | P3 | Coding Agents | none | Agent worker tools |
| [MEM-001](later/mem-001-session-title-summarizer.md) | todo | P3 | Memory | [TUI-004](tui-004-agent-session-navigator.md) | Efficient generated session titles |
| [SEARCH-003](later/search-003-workspace-search-embeddings.md) | todo | P3 | Search | [SEARCH-002](search-002-workspace-knowledge-search.md) | Optional local embeddings for workspace search |
| [WORKSPACE-002](later/workspace-002-tiered-checkpoint-retention.md) | todo | P3 | Workspace | workspace checkpoint tracking | Tiered workspace checkpoint retention |
