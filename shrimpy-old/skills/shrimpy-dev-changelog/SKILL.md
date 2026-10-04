---
name: shrimpy-dev-changelog
description: Use when updating Shrimpy's root CHANGELOG.md for unreleased work, release preparation, or release-note cleanup.
---

# 🦐 Shrimpy Dev Changelog

Write for someone deciding whether to install or upgrade Shrimpy. Use the writing guide for prose and the release skill for release execution.

## Scope

Include a change when a user, operator, maintainer, or agent would act differently because of it: behavior, commands, configuration, installation, recovery, consequential dependency changes, or operational guidance. Skip test-only changes, internal refactors, and wording cleanup. Combine related small changes into one user-facing outcome.

Released sections are immutable unless the user explicitly requests historical repair. Put post-release work and corrections under `Unreleased`, even when they concern behavior introduced in an earlier release.

## Evidence And Workflow

1. Read root instructions and inspect Git status, staged/unstaged changes, the active changelog section, and the package version.
2. For a normal unreleased update, compare with the latest semver release tag. Inspect the actual relevant diffs; commit titles, backlog notes, and existing prose are leads rather than proof.
3. Verify commands and flags against `src/commands/catalog.ts`, configuration against its validators, and behavior against the owning source and tests. Include relevant skills, setup templates, extensions, and web code.
4. Add or update `Unreleased` above the latest release, preserving unrelated entries. Do not invent a target version. Change the heading to a release date only for requested release preparation.

## Shape And Order

Use a short verb-led bullet naming the concrete change and its consequence. Call out removed or renamed commands/fields and required manual actions plainly. Keep implementation detail in commits or reference docs.

Reuse product-area headings that fit. Order by impact: data safety and manual actions first, then install/upgrade reliability, normal user workflows, inspection tools, and consequential maintainer guidance. Avoid empty categories and vague catch-all bullets.

Keep the title `# 🦐 Shrimpy Changelog`. Use `## 🦐 Unreleased` until a target version is chosen. Versioned headings contain version, aquatic name, and date/status, for example `## 🦐 0.6.2 - The Blue Hour - 2026-09-02`. Keep product-area headings plain. Release naming policy lives in `shrimpy-dev-release`.

## Verify

Review the diff and read the active section in impact order. Confirm every claim against its evidence, released sections remain untouched, and no entry exists solely to record internal work. Skip builds and tests for changelog-only edits; follow skills maintenance when editing this skill.
