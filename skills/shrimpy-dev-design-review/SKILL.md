---
name: shrimpy-dev-design-review
description: Use when evaluating Shrimpy feature ideas, architecture proposals, backlog notes, potential backlog changes, refactors, or competing implementation shapes from first principles. Apply before accepting, prioritizing, rewriting, or deleting proposed work when the real question is whether the design belongs in Shrimpy and improves its overall shape.
---

# Shrimpy Dev Design Review

Judge design decisions consistently from evidence and system consequences. Treat backlog Markdown as one place proposals are recorded, not as evidence that a proposal is current or desirable.

## Principles

- Inspect reality before judging the proposal. Read relevant source, tests, stable docs, recent history, and reported failures. Do not treat a backlog note's `Current State` as authoritative.
- Separate the demonstrated problem from the proposed solution. A real problem does not automatically justify the proposed machinery.
- Decompose broad proposals into independently judgeable decisions. Do not let one necessary fix legitimize every adjacent abstraction.
- Prefer deletion, reuse, direct composition, and one-source-of-truth seams. Do not invent an abstraction to make the answer look architectural.
- Respect Shrimpy's boundary with Pi. Shrimpy owns the home-agent layer, workspace conventions, agents, routing, watches, and inspectable CLI composition. Pi owns agent-runtime concepts it already provides.
- Ignore sunk cost and implementation status when judging design merit. Consider those separately when choosing transition work.
- Do not mistake uncertainty for low value. Mark missing evidence and name the cheapest way to learn.
- Do not reject work merely because it is large. Reject or narrow it when its concepts, states, or ownership costs are unjustified.

## Workflow

1. State the user-visible or operational problem in one sentence without solution language.
2. Verify the present implementation and identify stale proposal claims.
3. Split the proposal into atomic decisions such as a new state record, protocol, abstraction, command, policy, background loop, or deletion.
4. For each decision, compare at least these counterfactuals:
   - Do nothing and document the limitation.
   - Delete or collapse existing behavior.
   - Reuse Pi or another existing Shrimpy seam.
   - Solve it through a prompt, skill, stable documentation, configuration, ordinary files, or an existing CLI command.
   - Implement the smallest direct code change.
   - Add the proposed general mechanism.
5. Score each decision with the rubric below. Give evidence for every score; the number is a forcing function, not the conclusion.
6. Review the combined system shape. Individually reasonable decisions can still create an unreasonable whole.
7. Give one verdict per decision: `keep`, `narrow`, `defer`, `delete`, `replace`, or `research`.
8. If editing backlog files, also use `shrimpy-dev-backlog`. Preserve the problem and evidence while changing or removing unsupported solution commitments.

## Rubric

Score each dimension from 0 to 2, for a maximum of 12.

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Evidence | Hypothetical or contradicted by source | Plausible, indirect, or uncommon | Demonstrated in source, tests, operations, or repeated user experience |
| Consequence | Little meaningful effect | Material usability or maintenance improvement | Correctness, safety, trust, or frequent-workflow impact |
| Ownership | Belongs in Pi, prompts, skills, docs, or external tooling | Boundary is mixed or strategically chosen | Clearly belongs in Shrimpy's home-agent layer |
| Minimality | Adds parallel paths or unjustified concepts | Some new machinery with bounded value | Deletes duplication, reuses a seam, or adds the smallest sufficient mechanism |
| Truthfulness | Creates simulated, inferred, or unverifiable behavior | Indirectly inspectable or partially testable | Uses production behavior as the source of truth and supports direct verification |
| Durability | Creates ongoing synchronization, migration, or compatibility burden | Bounded maintenance cost | Reduces states/dependencies or has a stable, reversible contract |

Interpret totals cautiously:

- `10–12`: strong design; keep unless a dimension hides a blocker.
- `7–9`: useful but narrow the weak dimensions or state the accepted tradeoff.
- `4–6`: defer, replace, or research before committing implementation shape.
- `0–3`: delete or reject unless the maintainer is explicitly funding a strategic experiment.

Never use the total to overrule a fundamental ownership, safety, or truthfulness failure. A speculative product bet may deserve research despite a low evidence score; label it honestly instead of manufacturing certainty.

## System-Shape Check

After scoring components, count what the whole proposal adds or removes:

- Core concepts or named abstractions.
- Durable files, records, caches, and synchronized states.
- Protocol messages, queues, acknowledgements, or lifecycle states.
- Background loops, services, and failure modes.
- Configuration, public CLI/API surface, and policy vocabulary.
- Pi-private or upstream-version coupling.
- Migration, compatibility, and recovery obligations.
- Existing concepts, code paths, and special cases deleted.

Require an explicit justification for every lasting addition. Prefer a design whose failure is visible and recoverable with ordinary files and CLI inspection.

## Bias Checks

Before finalizing:

- Steelman both the problem and the simplest credible alternative.
- Search for evidence that the proposal is stale, already implemented, or solving the wrong layer.
- Check whether convenience is being presented as correctness, or observability as a substitute for simplification.
- Check whether a one-consumer helper is being promoted into a framework prematurely.
- Check whether a diagnostic reimplements production behavior instead of consuming it.
- Check whether multiple locally sensible backlog items collectively turn Shrimpy into a general agent platform.
- Distinguish implementation quality from idea quality and priority from merit.

## Output

Lead with the overall judgment and confidence. Then provide:

1. Verified problem and any stale assumptions.
2. Atomic decisions with rubric scores and short evidence.
3. System-shape consequences.
4. Verdicts and the smallest recommended shape.
5. Open uncertainties and the cheapest validation step.

Be candid and calibrated. Do not convert every review into a rewrite plan, and do not edit files unless the user asked for changes.
