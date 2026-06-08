# 🦐 SKILL-002: Default Skill Stewardship

Status: draft
Priority: P2
Area: Skills
Depends On: none

## Why

Shrimpy should make skills feel like a normal part of a user's home agent, not an advanced packaging feature.

The opinionated default should be a small shared `SKILL.md` that every ordinary agent can see. It teaches agents when to suggest, create, update, test, prune, or ignore skills for the user. The behavior should stay simple: skill stewardship is a playbook for agents, backed by the existing `shrimpy skills` CLI and normal workspace files.

This fits the current Shrimpy model: skills are Pi-style prompt/resource bundles, not a second control plane. Agent skills can specialize an agent. Workspace skills can teach shared habits. The user can inspect and edit everything.

## Product Shape

- Seed a workspace-level `skill-stewardship` or `skill-management` skill in fresh setup so every default agent has the same compact rules for skill care.
- Keep the skill short enough to be useful when loaded, with longer examples or templates in `references/` only if they prove necessary.
- Make the skill trigger on explicit user requests such as "make this a skill", "update this skill", "what skills do I have", "should this be a skill", and on agent-discovered repeated workflows when the agent is about to make a concise recommendation.
- Use existing commands first: `shrimpy skills list`, `show`, `add`, `install`, and `validate`.
- Let the mechanic use the same skill during setup, repair, and usage assessments, but do not require a mechanic watch for ordinary skill edits.
- Prefer ordinary Markdown proposals and diffs over hidden mutation. If the user has not asked for a skill change, the agent should suggest the candidate and wait.

## Standard Behaviors

- Notice repeated user behavior: copied prompts, recurring output formats, repeated corrections, stable source order, domain-specific judgment, small scripts repeatedly recreated, or multi-step workflows the user clearly wants done the same way.
- Suggest a skill only when it would remove real repetition or preserve a preference the model is likely to miss later.
- Do not suggest a skill for a one-off task, raw memory, secrets, broad personality, model/tool policy, live state, command dispatch, or anything better owned by an app, watch, vault note, agent context file, or reference doc.
- Ask one concise confirmation before creating, replacing, or deleting a skill unless the user explicitly asked for that exact edit.
- Choose scope conservatively: workspace skill for shared user conventions and repeated workflows; agent skill for role-specific playbooks, maintenance tasks, or private agent responsibilities.
- Name skills by the user's task shape, not the implementation mechanism. Prefer `invoice-review` over `pdf-parser` when the user wants invoice review, and let the skill mention PDF parsing as one step.
- Write frontmatter descriptions as trigger guidance, focused on user intent: "Use this skill when..." Include near-miss boundaries if the skill could over-trigger.
- Keep `SKILL.md` focused on the workflow, default choices, edge cases, and final checks. Move bulky examples, source catalogs, templates, or schemas into `references/` or `assets/`.
- Bundle scripts only when they are stable, inspectable, and safer than making the agent rebuild them each time. Scripts should have helpful errors, structured output, safe defaults, and dry-run or confirmation flags for stateful operations.
- Validate after every edit with `shrimpy skills validate <id> --agent <agent>` or a workspace-wide validation when scope/shadowing changed.
- Smoke-test important skills with a few realistic should-trigger and should-not-trigger prompts. A lightweight note in the skill or mechanic report is enough at first; do not build a full eval system until real skill churn justifies it.
- Review skills from actual execution traces and user corrections. Prefer cutting vague instructions over adding generic best-practice prose.
- Prune or merge stale skills when they have not triggered usefully, duplicate another skill, or encode old preferences.

## Candidate Default Skill Outline

The seeded skill should probably contain:

- when to use the skill;
- a "should this become a skill?" checklist;
- scope rules for workspace versus agent skills;
- a short creation/update workflow using the existing CLI;
- writing rules for names, descriptions, body, references, assets, and scripts;
- validation and smoke-test steps;
- boundaries that keep memory, watches, apps, and skills distinct;
- a short final-response pattern telling the user what changed and how to inspect it.

## Boundaries

- Do not add automatic skill generation from normal chat history.
- Do not let background watches mutate skills without an explicit user request.
- Do not make Shrimpy rank, hide, or auto-select skills beyond the Pi-backed loading model already documented in [skills.md](../reference/skills.md).
- Do not create a marketplace, registry, sync service, or hidden scoring system for this item.
- Do not add legacy compatibility paths for older skill layouts.
- Do not store credentials, account state, or private source material inside skills unless the user deliberately places a non-secret reference file there.

## Notes

- External skill guidance lines up with this shape: skills are strongest for repeatable workflows, small focused building blocks, progressive disclosure, strong trigger descriptions, and iteration from real use. Useful references: [OpenAI Academy skill overview](https://openai.com/academy/skills/), [Agent Skills specification](https://agentskills.io/specification), [Agent Skills description guidance](https://agentskills.io/skill-creation/optimizing-descriptions), [Agent Skills evaluation guidance](https://agentskills.io/skill-creation/evaluating-skills), and [Claude custom skills guide](https://claude.com/docs/skills/how-to).
- [SKILL-001](skill-001-web-fetch-action-patterns.md) is a domain-specific example of action skills. This item is the general lifecycle playbook that helps agents decide when such a skill should exist.
- [MECH-001](mech-001-skill-opportunity-watch.md) can use these rules for recurring recommendations and context hygiene reports, but this item should be useful even with no watch enabled.

## Done

- Fresh setup includes one shared default skill-stewardship skill visible to ordinary agents.
- The skill teaches agents when to suggest, create, update, validate, test, and prune user skills.
- The skill uses existing `shrimpy skills` commands and normal workspace files.
- Skill edits require explicit user intent or confirmation.
- The guidance preserves the boundary between skills, memory, watches, apps, vault notes, and agent context.
- Tests cover setup seeding, skill validation, and visibility from at least the default `shrimpy` agent.
