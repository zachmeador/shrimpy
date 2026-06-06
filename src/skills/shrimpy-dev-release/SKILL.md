---
name: shrimpy-dev-release
description: Use when preparing, cutting, or verifying a public Shrimpy release with version metadata, tags, GitHub Releases, release notes, and post-release checks.
---

# Shrimpy Dev Release

Use this source skill when the user asks to prepare or cut a Shrimpy release.

## Inputs

- Target version, for example `0.3.0`.
- Release tag, for example `v0.3.0`.
- Aquatic release name.
- Whether the user wants preparation only, or also wants commit/tag/push/GitHub Release actions.

## Preflight

1. Read `AGENTS.md` and `AGENTS-PRIVATE.md` when present.
2. Confirm branch and cleanliness with `git status --short --branch`.
3. Fetch release metadata with `git fetch --tags origin`.
4. Confirm `main` is current before cutting the release:
   - `git log --oneline HEAD..origin/main`
   - `git log --oneline origin/main..HEAD`
5. Inspect the latest release tag and unreleased delta:
   - `git tag --list 'v[0-9]*' --sort=-v:refname | head`
   - `git log --oneline <last-tag>..HEAD`
6. Do not create tags or GitHub releases while release-prep changes are uncommitted.

## Release Prep

Use `shrimpy-dev-changelog` for release-note wording and release-heading rules.

Update:

- `package.json` and `package-lock.json` version.
- `package.json` `shrimpy.releaseName`.
- `CHANGELOG.md` release heading from `Unreleased` to the release date.
- README/setup examples that intentionally reference the latest release tag.
- Any stable docs that still describe removed or renamed release surfaces.
- Completed backlog notes: remove them from `docs/backlog/index.md` and delete the completed note unless the user asks to preserve it elsewhere.

If a new source skill was added under `src/skills/`, run `npm run build:skills` or a full build so `.agents/skills`, `.claude/skills`, and `CLAUDE.md` are regenerated.

## Verification

Run the smallest complete release checks unless the user narrowed the scope:

```bash
npm run lint
npm test
npm audit --omit=dev
node dist/cli.js --version
git status --short --branch
```

For installer/setup-heavy releases, also run an isolated setup smoke when practical:

```bash
npm run dev:setup:clean
npm run dev:setup:init
```

`npm test` rebuilds ignored `dist/` and can change the live local `shrimpy` binary, because the local binary points at this checkout's generated output.

## Cut Release

Only after the user approves the prepared diff:

```bash
git add <release files>
git commit -m "Release vX.Y.Z"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
gh release create vX.Y.Z --target main --title "vX.Y.Z alpha - <release name>" --notes "<summary>" --prerelease
```

GitHub automatically provides source archives. Do not attach release assets unless the user deliberately chose packaged artifacts.

## Post-Release

- Confirm `gh release view vX.Y.Z`.
- Confirm the install command can target the tag.
- If the user wants the public docs to keep pointing at the latest tag, update the tag examples in the next normal development commit after release only when that policy is desired.
