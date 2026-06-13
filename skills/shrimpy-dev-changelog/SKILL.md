---
name: shrimpy-dev-changelog
description: Use when updating Shrimpy's root CHANGELOG.md for unreleased work, release preparation, or release-note cleanup, especially when deciding categories, ordering, and user-facing wording.
---

# 🦐 Shrimpy Dev Changelog

Use this Shrimpy developer skill from the Shrimpy repository when the user wants to update `CHANGELOG.md`.

## Goal

Keep the changelog useful to a user deciding whether to install or upgrade Shrimpy. It should summarize meaningful behavior changes, manual-action risks, and release highlights without becoming a commit log.

Implementation and tests are the authority. Existing changelog entries, backlog notes, docs, and commit titles are hints to verify against diffs, not source material to copy.

## Files

- `CHANGELOG.md` is the canonical public changelog.
- `package.json` carries the package version and release metadata.
- `docs/backlog/` explains planned work, not shipped release notes.
- Completed backlog items can inform the changelog, but do not copy backlog planning language into release notes.

## Workflow

1. Confirm the Shrimpy project root and read `AGENTS.md`.
2. Inspect local state before editing:
   - `git status --short`
   - `git diff -- CHANGELOG.md`
   - `sed -n '1,260p' CHANGELOG.md`
   - `node -e "console.log(require('./package.json').version)"`
3. If summarizing recent work, inspect the relevant diffs and commits:
   - `git tag --list 'v[0-9]*' --sort=-v:refname | head`
   - `git log --oneline --decorate <last-release-tag>..HEAD`
   - `git diff --name-status <last-release-tag>..HEAD`
   - `git diff --stat <last-release-tag>..HEAD`
   - `git diff <last-release-tag>..HEAD -- <relevant paths>`
Use the latest semver release tag when one exists. For a normal unreleased update after a public release, the baseline is usually the latest `v*` tag.
4. Update the active `Unreleased` section unless the user is cutting a release.
5. For release prep, change the heading from `Unreleased` to the release date only when the user has asked to prepare or cut that release.
6. Edit only changelog entries that are needed for the current work. Preserve unrelated release notes and user edits.
7. Do not modify dated or previously released changelog sections during normal unreleased updates. If a historical release note looks wrong, add a correction or clarification under `Unreleased` instead of rewriting the old release entry, unless the user explicitly asks for historical changelog cleanup.

## Evidence Checks

Before trusting a bullet, verify the concrete surface:

- Commands, flags, and help text: `src/commands/catalog.ts` plus command tests.
- Config keys and validation: `src/config/`, `src/context/spec.ts`, setup tests.
- Workspace files: `src/app/paths.ts`, `src/setup/init.ts`, setup templates/tests.
- Session behavior: `src/sessions/`, TUI code, session tests.
- Channel/wake behavior: `src/channels/`, `src/agents/channel-policy*`, delivery-loop tests.
- Watches/gateway behavior: `src/watches/`, `src/gateway/`, watch tests.
- Skills: `skills/`, `src/setup/templates/skills/`, skill command tests.

When writing or reviewing the active `Unreleased` section, verify claimed features against the diff. Correct wrong verbs, removed command names, outdated config keys, and claims based on plans rather than shipped code only inside the active unreleased entry. Historical release entries describe the commit state they were released with; do not rewrite them as current truth.

## Changelog Threshold

Include a change when a user, operator, maintainer, or agent would act differently because of it.

Worth including:

- New, removed, or renamed CLI commands, flags, config keys, workspace files, or public command output.
- Setup, install, upgrade, release, or data-safety changes that affect whether Shrimpy runs or how users recover.
- Agent, session, channel, watch, TUI, surface, tool, or model behavior changes visible in normal use.
- Pi upgrades or dependency changes with compatibility, runtime, packaging, or security impact.
- Docs, source skills, setup templates, or agent references that change how humans or agents should operate.

Skip changes that are only tests, refactors, code movement, wording cleanup, dependency churn without user-visible effect, or implementation detail better left in commits.

## Style

Use the helpful parts of Home Assistant-style release notes without turning Shrimpy's changelog into a blog post:

- Put the most important user-visible changes first.
- Keep the root title as `# 🦐 Shrimpy Changelog`.
- Prefix each release heading with the shrimp emoji, for example `## 🦐 0.3.0 - A Window in the Reef - Unreleased`.
- Use 🦐 for the changelog title and release headings. Keep product-area headings and bullets plain unless the item itself is about Shrimpy identity.
- Use stable product-area sections so readers can scan what changed.
- Within each section, put the highest-impact bullets first.
- Call out breaking, backward-incompatible, removed, or manual-action items plainly and near the top of the relevant release section.
- Keep exhaustive implementation detail in commits, reference docs, or backlog notes, not the changelog.

Write bullets in the existing Shrimpy voice:

- Start with a concrete verb such as `Added`, `Changed`, `Improved`, `Replaced`, or `Removed`.
- Name real commands, config keys, files, surfaces, agent behavior, or user workflows.
- Prefer user and maintainer outcomes over internal mechanics.
- Keep each bullet short enough to scan in a release section.
- Group related small changes into one bullet when they ship as one user-facing capability.
- Do not include test-only, refactor-only, or low-signal internal changes unless they explain a user-visible behavior or release risk.
- Do not write marketing copy, jokes, or vague claims like "various fixes".

## Section Ordering

Reuse existing section names when they fit. Good Shrimpy sections include:

- `Breaking Changes` or `Manual Actions`
- `Installation`
- `CLI & Plumbing`
- `Workspace & Setup`
- `Agents, Skills & Tools`
- `Turn Context`
- `Channels & Agent Policy`
- `Watches & Gateway`
- `Sessions, Models & TUI`
- `Pi Upgrades`
- `Docs & Agent References`
- `Release & Dependencies`

These are suggested labels, not required buckets. Do not create a section just to fit an implementation change; include only sections with meaningful user-facing release value.

Use `Breaking Changes` when config keys, workspace file names, command names, or routing behavior changed in a way an existing workspace or workflow may notice. Mention the old and new names plainly.

## Impact Ordering

When choosing bullet order inside a section, prefer:

1. Data safety, compatibility, security, or manual-action items.
2. Setup, install, and upgrade changes that affect whether Shrimpy runs.
3. User-visible commands, TUI behavior, channel behavior, and agent workflows.
4. New inspection/debugging surfaces that make behavior observable.
5. Maintainer-facing docs, source skills, or agent references only when they affect install, upgrade, operator workflows, or agent behavior.

Let concrete impact win over chronology. Do not reorder old release sections unless the user asks for cleanup.

## Release Headings

Current shape:

```markdown
## 🦐 0.3.0 - A Window in the Reef - Unreleased
```

For public releases at `0.1.0` or later, keep the version, aquatic release name, and date/status in the heading. Patch releases inherit the aquatic release name from their minor line, so `0.4.1` uses the `0.4.0` name. Choose a new release name only for a new minor line such as `0.5.0`. Use the release process in `AGENTS.md` when the user asks to cut a release.

## Verification

For changelog-only edits, run lightweight checks:

```bash
git diff -- CHANGELOG.md skills
rg "various|misc|stuff" CHANGELOG.md
```

Run code tests only when source code changed or when the changelog edit is part of a source change that needs verification.
