# 🦐 BROWSER-001: agent-browser Skill Guidance

Status: in-progress
Priority: P2
Area: Browser
Depends On: none

## Why
Agents need a local browser capability, but `agent-browser` already has a broad command surface and an official skill system. Mirroring that command set as `shrimpy browser ...` would make Shrimpy a stale proxy.

The settled v1 direction is: Shrimpy does not wrap browser commands. Shrimpy provides workspace guidance for Bash-capable agents to detect and use an existing `agent-browser` install directly, and the mechanic helps users set it up in user space when requested.

## Build
- Add a default workspace `agent-browser` skill with Shrimpy-compatible frontmatter.
- The skill points agents to `agent-browser skills get core --full` so guidance matches the installed CLI version.
- The skill tells agents to call `agent-browser` directly and to use the snapshot/ref workflow from the official skill.
- The skill treats missing `agent-browser` as capability unavailable, not as a Shrimpy failure.
- Fresh setup includes a `profile/SYSTEM.md` breadcrumb that says there is no `shrimpy browser` wrapper.
- The mechanic setup skill asks whether browser automation should be available and checks `command -v agent-browser` when the user opts in.
- Setup validation requires the workspace `agent-browser` skill.

## Boundaries
- Do not add a `shrimpy browser` namespace for v1.
- Do not add `agent-browser`, Chrome, Playwright, MCP servers, or cloud browser clients to Shrimpy's base dependency set.
- Do not run `sudo`, `agent-browser install --with-deps`, `agent-browser doctor --fix`, or global installs into `/usr` unless the user explicitly approves that exact privileged action.
- Do not attach to the user's real browser or use the user's normal browser profile by default.
- Do not save credentials, browser state, or auth profiles without explicit user intent and clear scope.
- Do not introduce Browser Use, Stagehand, Webwright, or another browser-agent loop as the default.

## Done
- Fresh setup seeds `skills/agent-browser/SKILL.md`.
- The normal `shrimpy` agent and mechanic both see the workspace `agent-browser` skill.
- `profile/SYSTEM.md` includes a browser automation breadcrumb.
- The mechanic setup skill includes browser availability/setup guidance.
- Skill validation passes with the new default skill.
