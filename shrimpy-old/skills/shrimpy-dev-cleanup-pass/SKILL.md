---
name: shrimpy-dev-cleanup-pass
description: Use only when the user explicitly invokes this exact skill for a Shrimpy cleanup pass. If the invocation has no narrower prompt, run one monolithic discovery workflow over large Shrimpy shapes, choose one high-leverage shape, deep-dive weird structure, repeated behavior, duplicated abstractions, stale paths, and behavior-preserving simplification opportunities, then present the case and plan for one large cleanup pass. Do not use automatically for normal feature work, code review, lint cleanup, or unsolicited refactoring.
---

# Shrimpy Dev Cleanup Pass

Use this skill only when the user explicitly names it or asks for a Shrimpy cleanup pass.

## Goal

Find one behavior-preserving cleanup pass worth doing. Prefer removing, merging, or simplifying abstractions over adding new structure. The output is a concrete case and plan for user approval unless the user explicitly asked to implement an already-approved cleanup.

## Default Shape Selection

When the user provides no specific target, scan broad Shrimpy shapes and pick one for a deep dive:

- CLI command registration, command handlers, catalog/help text, and command tests.
- Session lifecycle, instruction assembly, context assembly, and Pi wrapping.
- Agent policy, channels, watches, delivery loops, and wake scheduling.
- Workspace setup, config loading, templates, paths, and state files.
- Skills, skill mirrors, included packages, source developer skills, and validation.
- Web/TUI surfaces only when their structure is the obvious source of duplication.
- Reference docs and backlog only when they reveal stale source concepts or duplicated policy.

Choose the shape with the clearest evidence of repeated logic, awkward boundaries, or abstractions that mostly rename, forward, or split one responsibility across nearby files. If no shape has a credible cleanup case, say so and stop.

## Workflow

1. Confirm the Shrimpy root and read `AGENTS.md`, `AGENTS-PRIVATE.md` if present, and `git status --short`.
2. Establish the baseline for the area: find relevant tests, commands, docs, and public behavior before proposing changes.
3. Make a quick wide scan with `rg`, `rg --files`, file sizes, imports, exports, and recent diffs. Do not start editing during discovery.
4. Pick one shape and deep-dive it. Trace callers, data flow, ownership, tests, and docs until the cleanup can be explained as one coherent behavior-preserving pass.
5. Look specifically for:
   - duplicate helpers, duplicated defaults, repeated file/path/config handling, or repeated command plumbing;
   - the same concept named differently across source, tests, docs, backlog notes, templates, skills, or CLI prose;
   - one-method services, single-use registries, pass-through wrappers, single-implementation interfaces, and modules that only rename another module's job;
   - policies split across source, docs, skills, templates, and tests without a clear owner;
   - stale doc names or descriptions that preserve an old mental model and may steer future agents back into the duplicated shape;
   - exports used only by tests, docs naming behavior that no longer exists, orphaned CLI branches, no-op options, and stale validation paths that ESLint will not catch;
   - layers whose responsibility can be named as already belonging to another nearby layer.
6. Build the cleanup case from evidence, not taste. Cite files, call chains, duplicated shapes, and behavior boundaries.
7. Present one recommended cleanup plan. Do not implement it until the user approves, unless the user already asked for implementation in the same prompt.

## Cleanup Plan Shape

Report:

- **Target shape:** the one area selected and why it beat other candidates.
- **Observed slop:** concrete duplicate/weird/stale structures with file references.
- **Naming drift:** any cases where source, tests, docs, skills, templates, or CLI prose use different names for the same concept.
- **Behavior boundary:** commands, config files, workspace files, docs, and tests that must keep behaving the same.
- **Proposed cleanup:** the specific merges, removals, moves, or inlining steps.
- **Validation:** the smallest useful commands to prove behavior stayed intact.
- **Risk:** what could accidentally change and how the plan avoids it.
- **Decision:** recommend proceed, defer, or no credible pass found.

## Safety

- Preserve user edits. Do not revert, reset, clean, or overwrite unrelated files.
- Treat the live workspace as user data. Do not mutate workspace `config/`, `agents/`, `state/`, `runtime/`, `channels/`, or `media/`.
- Do not add legacy support, compatibility wrappers, migration paths, or new abstraction layers during cleanup.
- Do not make formatting-only or drive-by refactors unless they are necessary to remove the selected duplication.
- Stop and ask before changing public CLI behavior, workspace file shapes, setup behavior, persisted state, or release semantics.

## Implementation Mode

When the user approves the cleanup:

1. Keep the patch tied to the approved cleanup case. Cross module or product-shape boundaries when the duplicated abstraction, repeated policy, or behavior-preserving removal actually crosses them.
2. Prefer direct removal, merge, or inlining over new helper creation.
3. Update tests before or alongside behavior-preserving source edits when the old tests encode the duplicated structure rather than behavior.
4. Update reference docs, backlog, changelog, or generated skill mirrors only when the cleanup changes a maintained surface those files describe.
5. Run the focused validation named in the plan. For skill source edits, run `npm run build:skills`.
