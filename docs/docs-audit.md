# 🦐 Documentation and Maintenance Audit

Reviewed on `main`, commit `1fc578c9e65c349389975c52f5f2977481b93a55` (`v0.6.2`). This report records the pre-edit findings on `main`. The maintainer approved the fixes, except the root `SECURITY.md` wording change, which was reverted.

Shrimpy's documentation has a useful foundation, but too many files independently explain the same behavior. The maintenance instructions add another layer of repetition. The result is both extra reading and concrete drift: setup defaults, local replies, and session persistence are described differently depending on where someone starts.

I would make a focused correction and consolidation pass. Keep the distinction between a beginner guide, a reference, and an agent workflow. Give each detailed explanation one owner, and make the maintenance rules shorter and better at finding behavioral errors.

## 1. Repair the instructions that lead readers to the wrong action

These are confirmed problems on `main`, rather than preferences about wording.

| Location | Problem and evidence | Recommended repair |
|---|---|---|
| [Getting started: automation](getting-started.md#a-gentle-automation-schedule), [runtime: background work](reference/runtime.md#background-work) | Both say fresh setup installs disabled watches. The guide then tells readers to enable named audits. [Setup's test](../test/setup-init.test.ts) explicitly asserts that neither default agent has a `watches.json`; the [setup skill](../src/skills/included/shrimpy-setup/SKILL.md) says no watches are created until opt-in. | Explain that setup offers optional routines and creates only those selected. Do not assume an unselected audit exists and can simply be enabled. Keep exact defaults in [shrimpy-watches-default-init](../src/skills/included/shrimpy-watches-default-init/SKILL.md). |
| [Channel skill: Decide](../src/skills/included/shrimpy-channels/SKILL.md#decide) | Its unconditional instruction for answering the current conversation is “use `reply`.” The skill is available outside gateway conversations. [Tool tests](../test/tools.test.ts) verify that publication helpers are omitted without an active publication channel, matching [tools.md](reference/tools.md#shrimpy-daemon-tools). | Say to answer normally in local sessions and use `reply` in an active channel conversation. This is a necessary distinction to retain in the skill. |
| [README: How it fits together](../README.md) | It groups `shrimpy run` with commands that write a transcript under the agent folder. [run.ts](../src/commands/run.ts) sets persistence only when a session is explicitly requested; [sessions.md](reference/sessions.md#one-core-multiple-hosts) correctly describes the default as ephemeral. | Remove the blanket persistence claim. Keep the detailed rule in sessions and a brief `--session` hint beside the quickstart command. |
| [README: Usage](../README.md#-usage), [Getting started: Meet your agent](getting-started.md#meet-your-agent) | They present bare `shrimpy` as opening the normal/main agent. [root.ts](../src/commands/root.ts) resolves the most recent interactive agent when no agent or prompt is supplied. After chatting with mechanic, this can reopen mechanic. | Use `shrimpy chat shrimpy` where the tutorial needs that particular agent. Describe bare `shrimpy` as resuming terminal chat. |
| [Contributing: House rules](../CONTRIBUTING.md#-house-rules) | Contributors are told to leave migration guidance in a `workspace-migration` skill at a path that does not exist. | Replace the obsolete workflow reference with the current [update skill](../src/skills/included/shrimpy-update/SKILL.md) and a concise explanation of where workspace-impact guidance belongs. |

A related overstatement deserves a small correction: [memory.md](reference/memory.md#ownership) says memory changes are reversible through Git when the workspace is tracked. Shrimpy's own [checkpoint whitelist](../src/workspace/checkpoints/git.ts) excludes agent `context/`, as [workspace.md](reference/workspace.md#checkpoints) correctly explains. Qualify the promise: recovery requires that the particular file is actually tracked or otherwise backed up.

## 2. Replace the stale-doc detection method

The [docs skill](../skills/shrimpy-dev-docs/SKILL.md#find-the-affected-docs) takes the latest commit touching reference docs and examines source changes after it. On this checkout, that commit is `HEAD`, so the prescribed committed-source range is empty despite the errors above.

A reference edit is not evidence that all preceding source changes were documented. The method also excludes source changes made in the baseline commit itself. Its search scope focuses on `src/` and `docs/reference/`, overlooking behavior in included skills, `web/`, extensions, and entry-page instructions.

**Recommendation:** start from the feature diff or an explicitly chosen source range. Map changed behavior to its reference owner, examples, setup instructions, and relevant skills. For an audit, inspect current claims against reachable source and tests even when Git reports no newer source edits. Include staged changes and relevant files outside `src/`.

Keep verification small: check links, validate important command/default claims, and read the edited prose. A word search for `added|now|new|previously|recently` may help editing, but it cannot establish freshness; it also flags legitimate `sessions new` commands and ordinary “new session” wording.

## 3. Give documentation policy one home

[docs/AGENTS.md](AGENTS.md) still calls nonexistent `tracking/` active project state. It allows reference changes when the user or backlog makes a decision explicit. The [research index](research/README.md) likewise promotes conclusions when they become decisions. The [docs index](README.md) instead says behavior must ship, while the docs skill puts implementation first but also mentions explicit decisions.

These rules leave an avoidable ambiguity between an accepted design and implemented behavior. [design.md](reference/design.md) also explicitly describes doctrine while living under an index labeled “Current behavior.” That is a labeling issue, not a reason to move the document.

**Recommendation:** let the docs skill own placement and evidence rules. Behavioral reference follows implemented behavior; design doctrine describes intended constraints; accepted but unimplemented work belongs in planning. Make `docs/AGENTS.md` a short entry pointer. Give indexes audience labels and links, without their own competing promotion policies.

The [writing guide](../skills/shrimpy-dev-writing-guide/SKILL.md) should keep ownership of prose style. The docs skill repeats its human-first framing, common-case-first structure, concrete language, brevity, and no-hard-wrapping rule. Remove that second style guide.

## 4. Consolidate storage and context explanations

This is the clearest place to delete substantial prose without losing capability.

[workspace.md](reference/workspace.md) explains context loading under “Context Directories,” “Storage Rules,” and “Prompt Resources.” Its closing “State And Logs” repeats much of its opening layout. [memory.md](reference/memory.md) repeats recursive loading, workspace context-file responsibilities, and storage destinations. [context-assembly.md](reference/context-assembly.md#stable-sources) explains the loading rules again. Configuration maintains another partial file inventory.

Suggested ownership:

| Question | Detailed owner | Cuts elsewhere |
|---|---|---|
| Where does this file belong? | Workspace | Keep one layout and storage explanation; reduce the repeated prompt and log sections. |
| Which files reach the model, in what order, and when? | Context assembly | Replace loading details in memory/workspace with short reminders and links. |
| What should an agent remember or prune? | Memory and the relevant upkeep skill | Remove config mechanics and broad command inventories from memory. |
| Which fields can I configure? | Configuration, with explicit links for specialized shapes | Remove duplicate file descriptions and behavior essays. |

Keep the short storage/path reminders in installed `WORKSPACE.md` context where they help an agent choose correctly. Generated or installed instruction surfaces need enough information to work independently; literal zero repetition is not the goal.

## 5. Stop maintaining command catalogs in three places

The [CLI reference](reference/cli.md) says full flags belong in help, then includes long signatures. [skills.md](reference/skills.md#cli) repeats those signatures and extensive package metadata. The included [skills skill](../src/skills/included/shrimpy-skills/SKILL.md#apply) adds another catalog. Channels and watches follow a similar pattern, including commands already embedded in their workflows.

**Recommendation:** make the CLI reference a command-family map with representative examples and links. Let generated help own exhaustive options. Let feature references explain semantics and useful examples. In skills, keep commands whose selection or sequence matters—inspect installed drift, choose scope, preview, apply, validate—and remove parallel lists that add no decision guidance.

Schemas need the same treatment. Compaction defaults are copied into both configuration and compaction. Agent tool policy is explained in configuration, tools, and security. Prefer a single detailed explanation and example, with small field summaries where needed.

The configuration page's length alone is not a defect: its 428 lines are about 2,040 words, including JSON. Its organization is the problem. Tool defaults sit under “Web Inspector,” and operational recipes interrupt field reference. Fix those boundaries before splitting it into more pages.

## 6. Separate orientation from implementation detail

[overview.md](reference/overview.md) introduces six primitives. [architecture.md](reference/architecture.md#components) lists eighteen, mixing user concepts with classes such as `SessionResolver`, storage components, protocol variants, policy, and the watch clock. Its “Boundaries” then repeats several principles from [design.md](reference/design.md) and root agent instructions.

**Recommendation:** keep overview as the conceptual map. Make architecture a compact dependency/layer map for maintainers, calling implementation components what they are. Put doctrine in design. Remove architecture's repeated inventory of principles and its closing “Direction” recap where links suffice.

Several feature pages also change audience midway. [surfaces.md](reference/surfaces.md) leads with source-file anatomy before Telegram use. Runtime repeats local-session selection and lifecycle details owned by sessions, and places detailed reply-recovery internals beside the basic gateway flow. Compaction devotes substantial space to hooks, request construction, and summary formatting.

Keep operational consequences: whether a reply is public, how controls reach an owner, when recovery runs, and how to inspect failures. Move or cut implementation narration that does not change a reader's action. A small maintainer section can preserve useful detail without making everyone read it first.

## 7. Reduce ceremony in the maintenance skills

The skills often restate safeguards instead of adding a new decision:

- The 150-line [changelog skill](../skills/shrimpy-dev-changelog/SKILL.md) repeats released-section immutability in Workflow, Released Section Lock, Evidence Checks, and Impact Ordering. Inclusion thresholds, exclusions, and style guidance also overlap. Keep one immutable-history rule, one inclusion test, and one impact-order rule.
- The [backlog skill](../skills/shrimpy-dev-backlog/SKILL.md) repeats completion-by-deletion and the UX-section requirement. Its instructions still call absent short filenames “existing exceptions.” Keep placement/status semantics, one completion rule, and flexible sections. An explicit UX decision is useful; boilerplate is not.
- The [Pi-upgrade report template](../skills/shrimpy-dev-pi-upgrade/SKILL.md#report-shape) repeats version fields and asks to retain both “Upgrade Steps” and “Implementation Sequence.” The [research note](research/pi-agent.md) carries that repeated structure. Preserve provenance, evidence, live checks, and uncertainty, but maintain one version block and one action sequence.
- The docs skill's mandatory two-or-three-sentence opening and roughly 150-line target are weak quality measures. Unwrapped prose makes line counts especially misleading: runtime is only 86 lines but about 1,320 words. Cut or reorganize based on the question being answered.

Do not merge every skill into a large manual. The short writing and skills-maintenance skills have clear jobs. Changelog writing and release execution also deserve separate workflows. Shorten repeated instructions while preserving distinct responsibilities.

## 8. Trim entry pages and small signs of unfinished editing

README explains the product in its introduction, agent anatomy, capability list, and final architecture recap. Installation appears in README, getting-started, and setup. Keep a short README quickstart, a patient beginner walkthrough, and an operator setup reference; remove README's second system explanation and relocate the source-development recipe.

Smaller cleanup candidates:

- Empty `Date: --` and redundant `Status: Index` fields in research/musings indexes.
- The duplicated “totally wrekt” security openers: they delay the concrete explanation and read less carefully than the rest of the guidance.
- The universal shrimp-H1 requirement, which the instructions themselves inconsistently follow. Make it a scoped convention and normalize touched files, rather than spending a pass enforcing decoration.
- Long inventories of provider choices, exact default schedules, and illustrative setup output. Retain what helps the next action; leave changing details to the maintained owner or live selection UI.

The background collection is large: roughly 72,300 words of research, 21,000 of musings, and 41,700 of backlog. That does not establish that it should be deleted. The two largest architecture proposals are each about 7,450 words; short decision summaries would make them easier to review without destroying useful exploration. This audit sampled that material rather than evaluating every proposal's substance.

## Recommended pass

First correct the six concrete behavioral/workflow claims in section 1. Then simplify the docs-maintenance rules and consolidate storage/context and command explanations. Finish with audience organization and small prose cuts. This ordering fixes misleading guidance before spending effort on presentation.

Keep the existing directory structure, useful specialist skills, and generated mirrors. Both `.agents/skills/` and `.claude/skills/` matched all eleven source developer skills in this checkout; those copies are distribution output, not competing authorities.

Scope and verification: reviewed the 19 reference Markdown files, entry/instruction pages, documentation-related developer skills, and selected included skills and setup templates. Checked disputed claims against local source/tests and inspected Git history. A scan of ordinary relative Markdown link targets found the missing contributor-skill link; anchors and external URLs were not comprehensively checked. External provider claims were not fact-checked. No build, code tests, gateway changes, or live-workspace edits were needed or performed for this audit. Only the report was rewritten during the audit. The subsequent uncommitted fixes are described in the working-tree diff.
