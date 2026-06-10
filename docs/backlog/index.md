# 🦐 Backlog

Active engineering notes for `shrimpy`. Completed work belongs in git history and stable docs.

Status `draft` means the maintainer is not sure about the item yet. Status `review` means an implementation is ready for maintainer review but not yet closed out.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [VAULT-001](vault-001-default-workspace-collections.md) | todo | P2 | Workspace | none | Default workspace collection conventions |
| [VAULT-002](vault-002-main-agent-capture-research.md) | todo | P2 | Workspace | [VAULT-001](vault-001-default-workspace-collections.md), [CODE-002](code-002-agentic-worker-sessions.md) | Main agent capture and research workflow |
| [SEARCH-001](search-001-web-search-provider-wrapper.md) | todo | P2 | Search | none | Web search tool provider wrapper |
| [MEM-002](mem-002-session-transcript-search.md) | todo | P2 | Memory | none | Session transcript search |
| [TUI-004](tui-004-agent-session-navigator.md) | draft | P2 | TUI | none | Interactive `/agent` navigator for agents and sessions |
| [TUI-005](tui-005-model-switch-message-renderer.md) | todo | P2 | TUI | none | Native model-switch custom message rendering |
| [CODE-001](code-001.md) | todo | P2 | Coding Agents | none | External coding-agent availability inspection |
| [CODE-002](code-002-agentic-worker-sessions.md) | draft | P1 | Coding Agents | [CODE-001](code-001.md) | Agentic worker sessions for inspectable coding-agent delegation |
| [MECH-001](mech-001-skill-opportunity-watch.md) | todo | P2 | Mechanic | [APP-001](app-001.md) | Mechanic usage and context hygiene assessment watch |
| [APP-001](app-001.md) | todo | P2 | Apps | none | App and config pattern examples |
| [CAREER-001](career-001-resume-agent-workflow.md) | todo | P2 | Apps | [VAULT-001](vault-001-default-workspace-collections.md) | Career agent resume workflow |
| [SECURITY-001](security-001-agent-sandboxing-security-strategy.md) | todo | P2 | Security | none | Local agent sandboxing |
| [SECURITY-002](security-002-default-security-audit-agent.md) | todo | P1 | Security | none | Default security audit agent and watch |
| [CHAN-001](chan-001-typed-egress-outbox.md) | todo | P1 | Channels | [CHAN-002](chan-002-message-kind-discriminants.md) | Typed egress outbox with delivery receipts |
| [CHAN-002](chan-002-message-kind-discriminants.md) | todo | P1 | Channels | none | Message kind discriminants in the channel protocol |
| [CHAN-003](chan-003-channel-name-validation.md) | todo | P1 | Channels | none | Channel name validation at boundaries |
| [CHAN-004](chan-004-channel-manifests-bindings.md) | todo | P2 | Channels | [CHAN-003](chan-003-channel-name-validation.md) | Channel manifests and transport bindings |
| [SESSION-001](session-001-unified-session-planner.md) | todo | P2 | Sessions | none | Unified session planner and turn-as-value dispatch |
| [GATEWAY-001](gateway-001-dispatch-hardening.md) | todo | P2 | Gateway | none | Dispatch hardening: dedupe, ordering, loop guard |
| [GATEWAY-002](gateway-002-turn-control-and-queue-visibility.md) | todo | P2 | Gateway | none | Turn stop control and queue visibility |
| [SURFACE-001](surface-001-telegram-typing-activity.md) | draft | P2 | Surfaces | none | Telegram typing activity |
| [SURFACE-002](surface-002-chat-delivery-attribution.md) | todo | P2 | Surfaces | [CHAN-001](chan-001-typed-egress-outbox.md) | Chat delivery attribution |
| [SURFACE-003](surface-003-chat-operation-status.md) | todo | P2 | Surfaces | [CHAN-001](chan-001-typed-egress-outbox.md), [CHAN-002](chan-002-message-kind-discriminants.md) | Chat operation status updates |
| [SURFACE-004](surface-004-discord-dm-chat-adapter.md) | todo | P2 | Surfaces | none | Discord DM chat adapter |
| [SURFACE-006](surface-006-chat-command-parity.md) | todo | P2 | Surfaces | [CHAN-001](chan-001-typed-egress-outbox.md) | Chat command parity |
| [SURFACE-007](surface-007-user-reachability.md) | todo | P2 | Surfaces | none | User reachability over last active chat surface |
| [SURFACE-008](surface-008-addressed-agent-switch-semantics.md) | todo | P1 | Surfaces | none | Addressed-agent switch semantics |

## Later

Deferred notes that are intentionally outside the active backlog.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [CTX-008](later/ctx-008-runtime-context-producers.md) | todo | P2 | Context | none | Runtime context producers as CLI commands |
| [CTX-009](later/ctx-009-context-trace-debug-view.md) | todo | P2 | Context | [CTX-008](later/ctx-008-runtime-context-producers.md) | First-class context trace/debug view |
| [AGENT-001](later/agent-001-nested-agents.md) | todo | P3 | Agents | [APP-001](app-001.md), [CTX-008](later/ctx-008-runtime-context-producers.md) | Nested parent-managed agents |
| [MEM-001](later/mem-001-session-title-summarizer.md) | todo | P3 | Memory | [TUI-004](tui-004-agent-session-navigator.md) | Efficient generated session titles |
| [WORKSPACE-002](later/workspace-002-tiered-checkpoint-retention.md) | todo | P3 | Workspace | workspace checkpoint tracking | Tiered workspace checkpoint retention |
