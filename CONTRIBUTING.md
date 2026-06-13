# 🦐 Contributing

Shrimpy is a small project with one maintainer. Welcome, hypothetical contributor — the whole policy fits on this page, and the policy is: keep it shrimple.

## 🦐 Before you write code

For anything bigger than a small fix, open an issue first. Shrimpy has strong opinions ([docs/reference/design.md](docs/reference/design.md)) and a backlog ([docs/backlog/index.md](docs/backlog/index.md)); two sentences up front beat a PR that can't land.

Typo fixes, doc corrections, and small bug fixes with a repro can go straight to a PR.

## 🦐 Issues

Brevity is a feature. One problem per issue.

- What happened, what you expected, how to reproduce.
- `shrimpy --version`, OS, Node version.
- Relevant log lines from `workspace/runtime/logs/`, trimmed.

There are no templates. Just don't make the reader excavate.

Security issues: use GitHub's private vulnerability reporting, not a public issue.

## 🦐 Pull requests

- Shrimp-sized. One change per PR — small diffs get merged, big ones get questions.
- Target `main`. Run `npm test` and `npm run lint` first.
- Description: a few sentences on what and why. No essays, no checklists.
- Behavior changes at real seams come with tests. Nobody here chases coverage numbers.

## 🦐 House rules

The ones that surprise people:

- **No legacy paths.** Replace old behavior outright — no compat shims, deprecated stubs, or migration code. Live workspaces are migrated by the mechanic's [`workspace-migration`](src/setup/templates/mechanic/skills/workspace-migration/SKILL.md) skill, which reasons from git diffs; if your change to the workspace shape isn't obvious from the diff, leave that skill a note.
- **CLI first.** Every feature is reachable via `shrimpy <command>` before it grows any other surface.
- **No slop.** AI-assisted work is fine — Shrimpy is built that way — but you're responsible for every line. If you can't explain it, don't submit it.
- **Don't hard-wrap prose.** Markdown paragraphs stay on one line.

## 🦐 Conduct

Be decent. Shrimp are social animals.

## 🦐 License

MIT. By contributing, you agree your work ships under it.
