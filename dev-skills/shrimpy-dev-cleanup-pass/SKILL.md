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

- One program's modules, in `src/agent/`, `src/chat/` or `src/gateway/`, and whether each still has one job.
- A contract in `src/contracts/` with its client caller, and what crosses it.
- `src/lib/`, where shared plumbing may have grown a concept of its own.
- The CLI's commands, their help text and what they share.
- The terminal client's layers.
- Test support: stand-ins and rigs that repeat a program's rules, and tests that only record how things are.
- The skills Shrimpy ships and the instructions agents are given, where they repeat each other or the docs.
- The plan and status only when they reveal a stale concept.

Never look in `shrimpy-old/` for a shape to restore.

Choose the shape with the clearest evidence of repeated logic, awkward boundaries, or abstractions that mostly rename, forward, or split one responsibility across nearby files. If no shape has a credible cleanup case, say so and stop.

## Workflow

1. Confirm the Shrimpy root and read `AGENTS.md`, `AGENTS-PRIVATE.md` if present, and `git status --short`.
2. Establish the baseline for the area: find relevant tests, commands, docs, and public behavior before proposing changes.
3. Make a quick wide scan with `rg`, `rg --files`, file sizes, imports, exports, and recent diffs. Do not start editing during discovery.
4. Pick one shape and deep-dive it. Trace callers, data flow, ownership, tests, and docs until the cleanup can be explained as one coherent behavior-preserving pass.
5. Look specifically for:
   - duplicate helpers, duplicated defaults, repeated file/path/config handling, or repeated command plumbing;
   - the same concept named differently across source, tests, docs, skills, or CLI prose;
   - one-method services, single-use registries, pass-through wrappers, single-implementation interfaces, and modules that only rename another module's job;
   - policies split across source, docs, skills and tests without a clear owner;
   - stale doc names or descriptions that preserve an old mental model and may steer future agents back into the duplicated shape;
   - exports used only by tests, docs naming behavior that no longer exists, orphaned CLI branches, no-op options, and stale validation paths that ESLint will not catch;
   - layers whose responsibility can be named as already belonging to another nearby layer.
6. Build the cleanup case from evidence, not taste. Cite files, call chains, duplicated shapes, and behavior boundaries.
7. Present one recommended cleanup plan. Do not implement it until the user approves, unless the user already asked for implementation in the same prompt.

## Cleanup Plan Shape

Report:

- **Target shape:** the one area selected and why it beat other candidates.
- **Observed slop:** concrete duplicate/weird/stale structures with file references.
- **Naming drift:** any cases where source, tests, docs, skills or CLI prose use different names for the same concept.
- **Behavior boundary:** commands, contracts, the files of an agent's home, and docs that must keep behaving the same.
- **Proposed cleanup:** the specific merges, removals, moves, or inlining steps.
- **Validation:** the smallest useful commands to prove behavior stayed intact.
- **Risk:** what could accidentally change and how the plan avoids it.
- **Decision:** recommend proceed, defer, or no credible pass found.

## Safety

- Preserve user edits. Do not revert, reset, clean, or overwrite unrelated files.
- Treat a setup in use as user data. Never touch a running Shrimpy's homes, chat data or runtime directory.
- Do not add legacy support, compatibility wrappers, migration paths, or new abstraction layers during cleanup.
- Do not make formatting-only or drive-by refactors unless they are necessary to remove the selected duplication.
- Stop and ask before changing public CLI behavior, a contract, the files of a home, persisted state, or release semantics.

## Implementation Mode

When the user approves the cleanup:

1. Keep the patch tied to the approved cleanup case. Cross module or product-shape boundaries when the duplicated abstraction, repeated policy, or behavior-preserving removal actually crosses them.
2. Prefer direct removal, merge, or inlining over new helper creation.
3. Update tests before or alongside behavior-preserving source edits when the old tests encode the duplicated structure rather than behavior.
4. Update the readme, the plan or the changelog only when the cleanup changes something those files describe.
5. Run the validation named in the cleanup plan, then `npm run check`.
