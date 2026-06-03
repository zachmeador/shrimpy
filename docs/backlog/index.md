# 🦐 Backlog

Active engineering notes for `shrimpy`. Completed work belongs in git history and stable docs.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [VAULT-001](vault-001-default-workspace-collections.md) | todo | P2 | Workspace | none | Default workspace collection conventions |
| [VAULT-002](vault-002-main-agent-capture-research.md) | todo | P2 | Workspace | [VAULT-001](vault-001-default-workspace-collections.md), [CODE-002](code-002-agentic-worker-sessions.md) | Main agent capture and research workflow |
| [BROWSER-001](browser-001-default-browser-tool.md) | todo | P2 | Browser | none | Default browser automation tool |
| [SEARCH-001](search-001-web-search-provider-wrapper.md) | todo | P2 | Search | none | Web search tool provider wrapper |
| [MODEL-001](model-001-user-configurable-model-policy.md) | draft | P1 | Models | none | User-configurable model policy |
| [CLI-001](cli-001-calm-front-door-command-surface.md) | todo | P2 | CLI | none | Calm front-door command surface |
| [TUI-004](tui-004-agent-session-navigator.md) | draft | P2 | TUI | none | Interactive `/agent` navigator for agents and sessions |
| [TUI-005](tui-005-model-switch-message-renderer.md) | todo | P2 | TUI | none | Native model-switch custom message rendering |
| [CODE-001](code-001.md) | todo | P2 | Coding Agents | none | External coding-agent availability inspection |
| [CODE-002](code-002-agentic-worker-sessions.md) | draft | P1 | Coding Agents | [CODE-001](code-001.md), [MODEL-001](model-001-user-configurable-model-policy.md) | Agentic worker sessions for inspectable coding-agent delegation |
| [ADMIN-001](admin-001.md) | todo | P2 | Admin Agent | [MODEL-001](model-001-user-configurable-model-policy.md) | Bundled admin agent |
| [MECH-001](mech-001-skill-opportunity-watch.md) | todo | P2 | Mechanic | [ADMIN-001](admin-001.md), [APP-001](app-001.md) | Mechanic skill opportunity watch |
| [MECH-002](mech-002-direct-mechanic-tui-command.md) | todo | P1 | Mechanic | [ADMIN-001](admin-001.md), [MODEL-001](model-001-user-configurable-model-policy.md) | Direct mechanic TUI command |
| [APP-001](app-001.md) | todo | P2 | Apps | [ONBOARD-001](onboard-001.md) | App and config pattern examples |
| [CAREER-001](career-001-resume-agent-workflow.md) | todo | P2 | Apps | [BROWSER-001](browser-001-default-browser-tool.md), [VAULT-001](vault-001-default-workspace-collections.md) | Career agent resume workflow |
| [SKILL-001](skill-001-web-fetch-action-patterns.md) | todo | P2 | Skills | [BROWSER-001](browser-001-default-browser-tool.md), [VAULT-001](vault-001-default-workspace-collections.md) | Web fetch action skill patterns |
| [SETUP-001](setup-001-macos-friendly-install-docs.md) | todo | P2 | Setup | none | macOS-friendly setup and install docs |
| [SETUP-002](setup-002-provider-model-policy-bootstrap.md) | todo | P1 | Setup | [MODEL-001](model-001-user-configurable-model-policy.md) | Provider and model policy bootstrap |
| [ONBOARD-001](onboard-001.md) | todo | P2 | Onboarding | [ADMIN-001](admin-001.md), [MODEL-001](model-001-user-configurable-model-policy.md), [SETUP-002](setup-002-provider-model-policy-bootstrap.md), [MECH-002](mech-002-direct-mechanic-tui-command.md) | Guided new user onboarding session |
| [SECURITY-001](security-001-agent-sandboxing-security-strategy.md) | todo | P2 | Security | [SETUP-001](setup-001-macos-friendly-install-docs.md) | Local agent sandboxing |
| [SECURITY-002](security-002-default-security-audit-agent.md) | todo | P1 | Security | none | Default security audit agent and watch |
| [SURFACE-001](surface-001-telegram-typing-activity.md) | todo | P2 | Surfaces | none | Telegram typing activity |
| [SURFACE-002](surface-002-chat-delivery-attribution.md) | todo | P2 | Surfaces | none | Chat delivery attribution |
| [SURFACE-003](surface-003-chat-operation-status.md) | todo | P2 | Surfaces | none | Chat operation status updates |
| [SURFACE-004](surface-004-discord-dm-chat-adapter.md) | todo | P2 | Surfaces | none | Discord DM chat adapter |

## Later

Deferred notes that are intentionally outside the active backlog.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [CTX-008](later/ctx-008-runtime-context-producers.md) | todo | P2 | Context | none | Runtime context producers as CLI commands |
| [CTX-009](later/ctx-009-context-trace-debug-view.md) | todo | P2 | Context | [CTX-008](later/ctx-008-runtime-context-producers.md) | First-class context trace/debug view |
| [MEM-001](later/mem-001-session-title-summarizer.md) | todo | P3 | Memory | [MODEL-001](model-001-user-configurable-model-policy.md), [TUI-004](tui-004-agent-session-navigator.md) | Efficient generated session titles |
