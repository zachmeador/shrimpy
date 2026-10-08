---
name: shrimpy-dev-changelog
description: Use when updating Shrimpy's root CHANGELOG.md for unreleased work, release preparation, or release-note cleanup.
---

# 🦐 Shrimpy Dev Changelog

Write for someone deciding whether to install or upgrade Shrimpy. Use the writing guide for prose. The release rules are in the root `AGENTS.md`.

## Scope

Include a change when a user, operator, maintainer, or agent would act differently because of it: behavior, commands, configuration, installation, recovery, consequential dependency changes, or operational guidance. That includes what every agent is told and the skills Shrimpy ships, which are where the use of Shrimpy is written down. Skip test-only changes, internal refactors, and wording cleanup. Combine related small changes into one user-facing outcome.

Released sections are immutable unless the user explicitly requests historical repair. Put post-release work and corrections under `Unreleased`, even when they concern behavior introduced in an earlier release.

## Evidence And Workflow

1. Read root instructions and inspect Git status, staged/unstaged changes, the active changelog section, and the package version.
2. For a normal unreleased update, compare with the latest semver release tag. Inspect the actual relevant diffs; commit messages and existing prose are leads rather than proof.
3. Verify commands and flags against `shrimpy --help` and each command's own help, configuration against its validators, and behavior against the owning source. Include the skills Shrimpy ships and what every agent is told.
4. Add or update `Unreleased` above the latest release, preserving unrelated entries. Do not invent a target version. Change the heading to a release date only for requested release preparation.

## Shape And Order

Use a short verb-led bullet naming the concrete change and its consequence. Call out removed or renamed commands/fields and required manual actions plainly. Keep implementation detail in commits.

A setup can run its programs on several machines, and they are updated one at a time. Say plainly when a change needs every program updated together, which is whenever a contract between the programs changed, and when a program can no longer read what the version before stored.

Head each group by what a person does with Shrimpy, such as installing and updating, talking to agents, or running on several machines, and reuse those headings from release to release. Order by impact: data safety and manual actions first, then install/upgrade reliability, normal user workflows, inspection tools, and consequential maintainer guidance. Avoid empty categories and vague catch-all bullets.

Keep the title `# 🦐 Shrimpy Changelog`. Use `## 🦐 Unreleased` until a target version is chosen. Versioned headings contain version, aquatic name, and date/status, for example `## 🦐 0.6.2 - The Blue Hour - 2026-09-02`. Keep product-area headings plain. The release naming rule is in the root `AGENTS.md`.

## The release that replaces old Shrimpy

The first release of the redesigned Shrimpy can't be written from a diff, since nearly every line changed. Write it for someone who runs the Shrimpy before it: what is gone, what replaced it, what they do to move over, and what has not come back yet. Releases before it describe a program that no longer exists, so their headings and their area names are no guide, and the `Unreleased` entries written for it are dropped, since that work is deleted and was never released. Remove this section once that release is out.

## Verify

Review the diff and read the active section in impact order. Confirm every claim against its evidence, released sections remain untouched, and no entry exists solely to record internal work. Skip the check for changelog-only edits.
