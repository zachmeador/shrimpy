# 🦐 SKILL-001: All-Agents Pattern Reference Skill

Status: draft
Priority: P2
Area: Skills
Depends On: none

## Why

The bundled skill set has good mechanism playbooks (`watches`, `add-agent`, `channel-routing`) and good upkeep habits (`memory-management`, journals), but the application-pattern knowledge — what shape a "remind me Thursday", "keep an eye on this page", or "track my workouts" request should take — is advertised only to the mechanic, via `shrimpy-mechanic-ideas`. Skill bindings are in-context breadcrumbs, not access control: any agent with bash can read every skill, doc, and `--help` screen. The miss is that the agents actually receiving pattern-shaped requests mid-conversation carry no breadcrumb for them, so the shape gets rediscovered from docs and `--help` each time instead of being one read away.

`shrimpy-mechanic-ideas` also mixes two different things: an owner taxonomy (where should a thing live — the good part) and application examples that don't represent what home agents in this class (Shrimpy, OpenClaw, Hermes) actually get used for. The Career example is good material in the wrong slot — it motivates scoped agents rather than standing alone as a pattern — and the security/janitor entries are right ideas filed too thin to act on. Nothing in it connects a pattern to the CLI snippets that build it.

Replace it with a docs-backed reference skill available to all agents. The pattern content lives in the docs tree as `docs/patterns/<category>.md`, one short page per category encoding the sane default shape — which owner, what naming, the one or two commands — leaning on agents having good defaults rather than adding policy. The skill itself stays thin: a trigger description, the owner menu, and one breadcrumb line per category. Skills carry defaults and breadcrumbs; docs carry the content. "Oh, you're building this pattern? Store output here, here's the watch snippet."

## Current State

- `src/skills/defaults.ts` ships four all-agents skills (`coding-delegation`, `memory-management`, `journal-daily`, `journal-compact`) and seven mechanic-bound skills.
- `shrimpy-mechanic-ideas` with `references/pattern-inventory.md` is the only pattern catalog. It is bound only to the mechanic, has no CLI snippets, and its examples skew unrepresentative.
- Shrimpy workspaces always have the app checkout and its docs on disk: the `SYSTEM.md` template advertises the docs path, and the `watches` and `channel-routing` skills already breadcrumb to `reference/` docs by path instead of bundling copies. Docs-as-references is established house style; `shrimpy-mechanic-ideas` is the only default skill carrying its own references corpus.
- Skill loading is progressive (name and description advertised at session start, body read on demand, documented in [skills.md](../reference/skills.md)), so a thin always-visible index skill costs almost nothing per session.
- Mechanism playbooks with verified commands (`watches`, `add-agent`) are advertised only to the mechanic and organized by mechanism, not by pattern; no agent's advertised context carries a pattern-level breadcrumb.
- Mechanic security and hygiene audit skills already own the deep version of one pattern.

## Build

- Add a new all-agents source-default skill (working id `patterns`) under `src/setup/templates/skills/`, registered with target `all` in `src/skills/defaults.ts`. No bundled `references/` directory: `SKILL.md` is the whole bundle — the compact owner menu salvaged from `pattern-inventory.md` (vault note, skill, watch, channel, agent, project) plus one line per category stating its default shape and the doc breadcrumb, resolved through the docs path advertised in workspace context.
- Add the pattern content as `docs/patterns/<category>.md`, one short page per category, each roughly 40 lines: what the pattern is, the default shape (owners plus naming conventions), one or two verified CLI snippets, two or three don'ts.
  - `reminders.md` — one-off and recurring nudges. Message watch posting into a channel the user actually reads.
  - `briefings.md` — scheduled digests (morning brief, weekly review). Message watch carrying a concise instruction; vault only when output is worth keeping.
  - `monitors.md` — "tell me when this changes": price, page, feed, server. Command watch with a deliberate emit policy for deterministic checks; message watch when judgment is needed.
  - `capture.md` — "look into this" links, papers, products into vault collections, source metadata first.
  - `trackers.md` — running logs fed via chat (food, workouts, expenses): channel in, durable vault note, optional rollup watch.
  - `audits.md` — read-only sweep over the workspace producing a dated recommendations doc in `agents/<id>/vault/`, never auto-fixing from a watch run. Two flavors, one shape: security posture (tool surfaces, channel policies on externally reachable channels, command watches, skill package provenance, secrets in prompt-loaded files) and janitor/hygiene (stale or failing watches, dead channels, context bloat, failing skill validation). Points at the mechanic audit skills.
  - `scoped-agents.md` — when a topic deserves its own agent versus a note or skill on the main agent. The case for splitting is domain isolation: the domain's voice, memory, channels, and tone stay out of the main agent. Career is the motivating example ([CAREER-001](career-001-resume-agent-workflow.md)) — application tracking and recruiter framing should not leak into the home agent. Nothing is forced: the same skills can bind to `shrimpy` instead when the user prefers one agent.
- Write the frontmatter description around the request phrases that should trigger it: reminders, recurring checks, briefings, monitors, trackers, capture collections, audits, new ongoing flows.
- Remove `shrimpy-mechanic-ideas` entirely: defaults entry, template directory, and the pointer in the `mechanic` skill. Fold its "how to run a recommendations session" remainder into the `mechanic` skill.
- Verify every snippet against [cli.md](../reference/cli.md), and write `reminders.md` and `briefings.md` against current channel membership, wake policy, and delivery behavior — that plumbing is actively changing and is the easiest place for this skill to silently rot.
- Mention the patterns location in the docs map (`docs/README.md` and the `SYSTEM.md` template's docs line) so the pages are findable without the skill.
- Minor instruction cleanup while touching the area: dedupe the repeated evidence list in the `mechanic` triage skill. Keep `SYSTEM.md` lean; the skill and docs, not profile instructions, carry pattern knowledge.

## Boundaries

- Each reference is defaults plus snippets, boring on purpose; unusual but intentional setups stay legal.
- Do not implement audit skills or vault git tracking here. Audit skills already exist; vault git tracking remains [VAULT-001](vault-001-default-workspace-collections.md).
- No snippets for unshipped mechanisms; patterns reference only what exists today.
- Keep the category list small. Resist growing this into a comprehensive catalog; new categories must earn their slot.
- No compatibility shim or stub left behind for `shrimpy-mechanic-ideas`.
- No parallel content corpus inside the skill bundle. If a pattern page is worth writing, it is a doc; the skill only triggers and indexes.
- No capability language anywhere in the skill or pattern docs. Bindings control what is advertised in context, not what an agent can do; bash makes everything reachable. Frame agent differences as breadcrumbs, never as permissions.
- Snippets follow the plain-first output convention from [CLI-001](cli-001-bounded-agent-output.md): plain CLI output for inspection, `--json` only where the snippet pipes it.

## Notes

- This implements the practical-starter path of [APP-001](app-001.md): `docs/patterns/` is its examples document split per category, and the skill is the trigger that makes the examples reachable from live sessions. APP-001 should either close into this note or re-scope to its experimental/"out there" examples bundle — maintainer call.
- Because the content is repo docs, the existing docs-parity habits cover pattern snippets the same way they cover mechanism docs. Bundled skill references would have no parity machinery and would rot quietly.
- Per-workspace customization happens by overriding the skill (a workspace `skills/patterns/` bundle wins over the source default), not by editing install-managed docs in the app checkout.
- Mechanic hygiene audit checklists are complementary, not duplicate: they say what tends to go wrong; this skill says what shapes to reach for. Keep them separate.
- When [VAULT-001](vault-001-default-workspace-collections.md) ships collection conventions, `capture.md` and `trackers.md` should adopt its naming; until then naming stays a loose convention.
- The category list comes from what OpenClaw/Hermes-class home agents demonstrably get used for, not from Shrimpy's feature list.
- A possible eighth category — small tools/apps under `agents/<id>/projects/`, including local-service glue like talking to Home Assistant over CLI/HTTP — is deliberately deferred. Ship seven and see.

## Done

- The new skill exists as an all-agents source default with no bundled references, `shrimpy skills validate` passes, and the directory id matches frontmatter `name`.
- Seven pattern pages exist under `docs/patterns/`, each with shape, verified snippets, and don'ts.
- `docs/README.md` and the `SYSTEM.md` template point at the patterns location.
- `shrimpy-mechanic-ideas` is gone from `src/skills/defaults.ts`, the templates tree, the `mechanic` skill, `test/setup-init.test.ts`, and `test/skill-command.test.ts`.
- The default-skill listing in [skills.md](../reference/skills.md) reflects the new set.
- Reminders and briefings snippets are checked against current delivery semantics, not older watch docs.
