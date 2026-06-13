# 🦐 SETUP-003: Opt-In Watch Seeding

Status: todo
Priority: P2
Area: Setup
Depends On: none

## Why

Fresh setup schedules three recurring watches enabled by default, and the setup skill's single bundled question — leave them enabled or pause them — explains nothing about what each watch does or costs. Every watch run spends tokens on the configured model, so "on by default" can be expensive depending on model choice, and a user who quits the setup session early never reaches the question at all, leaving the watches running. Recurring behaviors should be opt-in: seeded disabled, presented one by one with a brief plain-language explanation, and enabled only when the user says yes.

## Current State

- `ensureWorkspaceInitialized` writes `createDefaultShrimpyWatches()` from `src/setup/defaults.ts` to the `shrimpy` agent's `watches.json` whenever that file is absent: `memory-management` (daily 03:00), `journal-daily` (daily 22:30), and `journal-compact` (Sundays 04:00), all enabled message watches into the `maintenance` channel, seeded before the mechanic setup session starts.
- The setup skill (`src/setup/templates/mechanic/skills/setup/SKILL.md`) asks one bundled question about leaving watches enabled and pauses them by setting `enabled: false` in `watches.json`. There is no per-watch explanation and no cost mention.
- `shrimpy watches` covers list/add/show/history/run, and `watches add` accepts `--disabled`, but there is no enable/disable toggle for an existing watch.

## Build

- Seed all default watches disabled, so quitting setup early leaves nothing running and non-interactive setup enables nothing.
- Rework the setup skill's watches question into per-watch opt-in: one or two plain lines each covering what it does, when it runs, and that each run spends tokens on the configured model, then enable only what the user accepts.
- Add `shrimpy watches enable <agent-id>/<watch-id>` and `shrimpy watches disable <agent-id>/<watch-id>` so the skill and the user flip a watch with one inspectable command instead of editing `watches.json`.
- Cover every watch setup can offer, including scheduling mechanic security and hygiene audits in the same step.
- Close the step by telling the user how to change their choices later (`shrimpy watches ...` or a mechanic session).

## Boundaries

- Fresh seeding only; existing workspaces and their `watches.json` files are untouched.
- The explanations live in the setup skill itself, not behind a docs pointer.
- Scope is watch opt-in semantics; onboarding completion, gateway steps, next steps, and status readiness are already handled elsewhere.
- Watch definitions stay in `src/setup/defaults.ts`; this changes their seeded `enabled` state and the question, not their content.

## Notes

- The cost line should say runs use the configured model rather than estimating prices.
- Declined-gateway wording already covers dormant watches, which pairs naturally with this step.
- Mechanic audit skills define the security and hygiene watches this step can offer to schedule.

## Done

- Fresh seeding writes all default watches disabled.
- The setup skill presents each watch with a brief explanation and cost note, enabling only accepted watches; declined watches stay disabled but discoverable in `watches list`.
- `shrimpy watches enable`/`disable` toggle an existing watch and appear in the command catalog.
- Tests cover disabled-by-default seeding and the toggle commands.
