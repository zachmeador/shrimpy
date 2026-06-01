# 🦐 Backlog

Active engineering notes for `shrimpy`. Completed work belongs in git history and stable docs.

| ID | Status | Priority | Area | Depends On | Note |
|---|---|---|---|---|---|
| [VAULT-001](vault-001-default-workspace-collections.md) | todo | P2 | Workspace | none | Default workspace collection conventions |
| [VAULT-002](vault-002-main-agent-capture-research.md) | todo | P2 | Workspace | [VAULT-001](vault-001-default-workspace-collections.md), [CODE-002](code-002-agentic-worker-sessions.md) | Main agent capture and research workflow |
| [CHANNEL-001](channel-001.md) | todo | P1 | Channels | none | Richer channel inspection |
| [CHANNEL-002](channel-002-attention-routed-channel-events.md) | draft | P1 | Channels | none | Attention-routed channel events |
| [SCHED-002](sched-002-schedule-inspection-surfaces.md) | todo | P1 | Schedules | none | Schedule inspection surfaces |
| [SCHED-003](sched-003-scheduled-channel-messages.md) | draft | P1 | Schedules | [CHANNEL-002](channel-002-attention-routed-channel-events.md) | Scheduled channel messages through existing agent attention |
| [SCHED-004](sched-004-one-time-scheduled-channel-messages.md) | draft | P1 | Schedules | [SCHED-003](sched-003-scheduled-channel-messages.md) | One-time scheduled channel messages |
| [BROWSER-001](browser-001-default-browser-tool.md) | todo | P2 | Browser | none | Default browser automation tool |
| [TUI-004](tui-004-agent-session-navigator.md) | draft | P2 | TUI | none | Interactive `/agent` navigator for agents and sessions |
| [CLI-001](cli-001-cleaner-command-structure.md) | draft | P2 | CLI | none | Cleaner command structure |
| [CODE-001](code-001.md) | todo | P2 | Coding Agents | none | External coding-agent availability inspection |
| [CODE-002](code-002-agentic-worker-sessions.md) | draft | P1 | Coding Agents | [CODE-001](code-001.md) | Agentic worker sessions for inspectable coding-agent delegation |
| [ADMIN-001](admin-001.md) | todo | P2 | Admin Agent | none | Bundled admin agent |
| [MECH-001](mech-001-scheduled-skill-opportunity-assessments.md) | todo | P2 | Mechanic | [ADMIN-001](admin-001.md), [SCHED-002](sched-002-schedule-inspection-surfaces.md), [SCHED-003](sched-003-scheduled-channel-messages.md), [APP-001](app-001.md) | Scheduled skill opportunity assessments |
| [APP-001](app-001.md) | todo | P2 | Apps | [ONBOARD-001](onboard-001.md) | App and config pattern examples |
| [CAREER-001](career-001-resume-agent-workflow.md) | todo | P2 | Apps | [BROWSER-001](browser-001-default-browser-tool.md), [VAULT-001](vault-001-default-workspace-collections.md) | Career agent resume workflow |
| [SKILL-001](skill-001-web-fetch-action-patterns.md) | todo | P2 | Skills | [BROWSER-001](browser-001-default-browser-tool.md), [VAULT-001](vault-001-default-workspace-collections.md) | Web fetch action skill patterns |
| [DOCTOR-001](doctor-001.md) | todo | P2 | Doctor | [ADMIN-001](admin-001.md) | Admin repair/doctor session |
| [ONBOARD-001](onboard-001.md) | todo | P2 | Onboarding | [ADMIN-001](admin-001.md) | Guided new user onboarding session |
| [SETUP-001](setup-001-macos-friendly-install-docs.md) | todo | P2 | Setup | none | macOS-friendly setup and install docs |
| [SECURITY-001](security-001-agent-sandboxing-security-strategy.md) | todo | P2 | Security | [SETUP-001](setup-001-macos-friendly-install-docs.md) | Agent sandboxing and local security strategy |
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
