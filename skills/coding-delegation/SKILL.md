---
name: coding-delegation
description: Prepare, dispatch, or supervise delegated coding work for Codex, Claude Code, Shrimpy/Pi, or another coding agent.
---

# Coding Delegation

Use this skill when a user wants Shrimpy to turn an idea, bug, app request, or code change into delegated coding work. Delegation is optional: if the task is small and Shrimpy has enough context and tools, do the work directly.

## UX Intent

Shrimpy should be a good first pass for project ideas and coding tasks. The user can describe the goal to Shrimpy, Shrimpy can clarify and summarize, then Shrimpy can hand the build to a capable coding worker when worker controls exist. After that, the user can keep iterating through Shrimpy or open the project directory in Codex, Claude Code, or another editor/agent.

## When To Delegate

Delegate when the task is large enough that a focused coding worker is useful, when the user explicitly asks to use Codex/Claude Code/another agent, when the project needs a first build from a product idea, or when parallel implementation would materially help.

Do the work directly when the change is small, local, low risk, and Shrimpy can complete and verify it without hiding useful state from the user.

## Handoff Packet

Every delegated coding task should include:

- A clear statement that this is a coding task passed from a user through Shrimpy.
- The original user request, or a compact recent conversation tail if the surrounding context matters.
- Shrimpy's summary of the goal, assumptions, constraints, and current project state.
- The target project directory and any relevant files, commands, branches, or environment notes.
- Concrete done criteria and expected artifacts.
- Safety boundaries: preserve user changes, avoid destructive actions, and ask before merge, publish, delete, reset, or broad rewrites.
- How the worker should report back: changed files, commands run, verification results, blockers, and remaining risks.

## Prompt Shape

Start worker prompts with the user provenance and Shrimpy summary before implementation detail:

```text
This is a coding task delegated from a Shrimpy user conversation.

Original request:
<user request or relevant conversation tail>

Shrimpy summary:
<goal, constraints, current state, assumptions, done criteria>

Project:
<cwd, relevant files, commands, branch/worktree notes>

Operating contract:
Work autonomously until the goal is complete or blocked. Preserve unrelated user changes. Do not merge, publish, delete, reset, or make broad rewrites without explicit approval. Report changed files, verification, blockers, and residual risk.
```

## Supervision

When worker/session controls exist, keep the worker inspectable. Track status, logs, and a compact summary. Send user feedback back to the same worker session when possible so the coding context survives follow-up.

When worker/session controls do not exist, do not pretend they do. Prepare the handoff packet, use any available direct command only if it is reliable, and tell the user what was or was not dispatched.

## Review Loop

Worker completion is not the same as user acceptance. Shrimpy should inspect the result, summarize what changed, surface verification and risks, and help the user decide whether to continue, revise, accept, or open the project directory in a coding agent.
