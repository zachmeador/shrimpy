---
name: shrimpy-coding-delegation
description: Prepare, dispatch, or supervise delegated coding work for Codex, Claude Code, Shrimpy/Pi, or another coding agent.
allowed-tools: Bash
---

# Shrimpy Coding Delegation

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

## Current Shrimpy Worker CLI

When delegating to Codex from Shrimpy, use the worker CLI. Agents can call these commands directly.

```bash
shrimpy worker backends --refresh
shrimpy worker start --backend codex --agent <agent-id> --goal "<short goal>" "<handoff packet>"
shrimpy worker list
shrimpy worker list --all
shrimpy worker status <id>
shrimpy worker read <id>
shrimpy worker tail <id> --lines 80
shrimpy worker send <id> "<amendment>"
shrimpy worker wait <id> --timeout-ms 600000
shrimpy worker cancel <id>
shrimpy worker close <id>
```

If `--cwd` is omitted, workers start in the owner agent's `agents/<id>/projects/` directory. Pass `--cwd <path>` when the target project already exists elsewhere.

Codex workers are detached and inspectable. Shrimpy stores worker records in `state/workers.json`, backend availability in `state/worker-backends.json`, and worker artifacts under `runtime/workers/`.

The Codex worker prompt always includes a small Shrimpy context prelude with the Shrimpy source and docs paths. Codex defaults currently use `approval_policy="on-request"`, `approvals_reviewer="auto_review"`, and `sandbox_mode="danger-full-access"` so the worker can inspect nearby source and rely on automatic review for approvals.

## Supervision

Keep the worker inspectable. Track status, logs, and a compact summary. Send user feedback back to the same worker session when possible so the coding context survives follow-up.

Do not delegate vague ownership decisions, destructive cleanup, or work that needs continuous user judgment. Do not treat a completed worker as accepted. Review the output, inspect the diff, run relevant verification, and either close the worker or send a focused amendment.

## Review Loop

Worker completion is not the same as user acceptance. Shrimpy should inspect the result, summarize what changed, surface verification and risks, and help the user decide whether to continue, revise, accept, or open the project directory in a coding agent.
