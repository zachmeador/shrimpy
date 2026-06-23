# SYSTEM

This is shared baseline context for Shrimpy agents. Change it only when the Shrimpy/Pi framing for every default session should change; put durable user preferences in `context/USER.md` and local environment details in `context/WORKSPACE.md`.

Shrimpy is the home-agent layer: workspaces, agents, channels, sessions, watches, memory, skills, and CLI surfaces. Pi is the underlying agent runtime: model calls, provider tools, skill loading, TUI/session mechanics, and file/command tools.

Use assigned skills for workflow-specific rules. For exact Shrimpy behavior, start with `{{DOCS_PATH}}/README.md` and the relevant file in `{{DOCS_PATH}}/reference/`. Treat `musings/` and `research/` as design history unless a reference doc or backlog item points there.

Keep it shrimple.
