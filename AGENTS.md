# 🦐 Shrimpy

A home for agents, built on Pi's durable runtime.

If `AGENTS-PRIVATE.md` exists at the project root, read it for workspace- and user-specific context (paths, identifiers, local hosts) that is intentionally not tracked in git.

## Where things are

- **What is open:** [`docs/open.md`](docs/open.md), the important open questions and issues, and what waits on the owner. An important gap you find goes in it in the same change, and a question for the owner under Waiting on the owner. A small one is fixed or left out. What is decided and built is in the code, and why is in the commit messages.
- **How to run and check it:** [`CONTRIBUTING.md`](CONTRIBUTING.md). The layout rules are in [how Shrimpy is built](docs/how-it-is-built.md), and every command is in the [README](README.md).
- **How the web client looks:** [`docs/web-client-mockup.html`](docs/web-client-mockup.html), the owner's reference since 2026-11-21. Open it in a browser: it has live frames of the client at each width, and the first block of its styles is everything that decides the look. The README's screenshots are taken from it and from [the terminal's mockup](docs/terminal-mockup.html) by `node docs/assets/shoot.ts`, so a change to either mockup runs it again.
- **`src/`:** three programs (`agent/`, `chat/` and `gateway/`), the clients, the CLI, and the only code they share: `contracts/` and `lib/`.
- **`skills/`:** the skills Shrimpy ships to its agents.
- **Entry point:** `src/cli/main.ts`, run as `bin/shrimpy.js`.

## How to work here

- **Build what the owner decided, and raise every mismatch.** If a decision is wrong, unclear or silent, or the code can't follow it, say so to the user. Never settle it quietly in the code. A visible choice you make that no decision covers goes in your report, so it can be reviewed.
- **Core first.** Effort goes to the shape, which is hard to change later: the three programs and what each owns, the contracts between them, identity and addressing, the conversation model, the home, and the network. Wording, extra tools, skills and terminal affordances are made correct and plain, then tuned through use.
- **Share truth, not shape.** Unify code when two copies drifting apart would be a bug. Two simple pieces that merely look alike stay separate rather than merging into a shared helper full of options and mode flags, since later changes otherwise couple unrelated callers.
- **Treat a boundary error as a design problem.** When `lint/boundaries.js` rejects an import, move the concept to the right tier or module instead of adding an exception or re-exporting an internal through a front door. If the rule itself is wrong, raise it rather than working around it.
- **One pattern per problem.** Don't introduce a second way to solve a problem beside an existing one. Future sessions imitate whatever they read first, so if the existing pattern no longer fits, replace it across the codebase.
- **Model lifecycles as explicit states.** Independent booleans (`loading`, `connected`, `closing`) allow impossible combinations and hide races on reconnect or shutdown. Use a tagged union for modes, one commit for coupled writes, and one cancellation path for teardown.
- **Split or rewrite before a file turns into a hub.** Keep files small enough to read whole. When a change adds another special case to a large state or UI file, split it or rewrite the module behind its contract instead of stacking another local patch on top.
- **Tests earn their place.** A test protects a seam between programs, starting, stopping, crashing and recovering, a promise Shrimpy makes, or a bug that was actually seen. Don't pin wording or an internal shape, and don't test test support. When a change breaks a test that only recorded how things were, the test goes.
- **No shortcuts reach a commit.** `npm run check` passes at every commit that changes code: types, the boundary lint and the tests.
- **Commands operate Shrimpy; clients and tools use it.** A `shrimpy` command starts, stops, configures, inspects or repairs a program or a home. `run` and `read` are the shell's client: one asks and prints the answer, the other prints a thread. What happens inside a conversation, such as editing or reacting, belongs to the clients and to an agent's tools. A contract method needs no command: it is reachable from code and from an agent's tools.
- **A command is never added in the change that adds the feature.** It gets a change of its own, which names who asked for it and what they couldn't do without it: the owner, a skill that tells someone to run it, or a test that can't reach the seam from code. Whoever is building it doesn't count as an asker. A feature that arrives as a noun, such as triggers or rooms, doesn't bring a full set of verbs with it.
- **Lean on Pi.** Wrap it cleanly and extend it at the point where it is the real constraint, not before.
- **Agents and Markdown before mechanisms.** Shrimpy provides guardrails and ways to talk. What an agent can work out from its instructions, a skill or its shell doesn't get a mechanism of its own.
- **Follow Shrimpy's own skills yourself.** If the user asks for something one of them covers, such as setting Shrimpy up, read `skills/<name>/SKILL.md` and do it.
- **A setup in use is user data.** Never connect to, stop or change a running Shrimpy's homes, chat data or runtime directory while developing. Give every run a runtime directory of its own with `SHRIMPY_RUNTIME_DIR`, and a folder of its own with `SHRIMPY_DIR`, since the default folder, `~/shrimpy`, is someone's real setup.

## Writing

This covers everything a person or an agent will read, commit messages included. Write the way a developer who knows the code explains it to a colleague: lead with the point, and say only what the reader needs. A little playfulness is welcome where it fits, but keep it rare.

The owner keeps cutting the same things:

- **Invented phrasing for ordinary things.** Use the word people already use: "All commands", not "The whole list", and "12×12", not "twelve lines of twelve". Define a term Shrimpy coined the first time you use it.
- **Files and programs written as if they think.** `vault/` is a folder of Markdown files, not "longer notes it reads when it needs them".
- **Explaining more than the reader needs.** "Sessions are stored in SQLite" is the whole sentence. Leave out what a dependency saves you and how it works inside.
- **Facts with no point, and rules with no reason.** If a reader would answer a sentence with "ok?", cut it. Give a rule's reason: "the programs never import each other" means nothing until the reader knows why.
- **Answers to worries the reader doesn't have,** such as "You don't need to learn its commands."
- **Selling.** No slogans, no lists of three for rhythm, and no "not X, but Y" unless someone would really pick X.
- **Saying it twice.** Each fact belongs in one place, and other files link to it.
- **Lists in the wrong place.** Explain in short paragraphs. Use bullets or a table for items a reader scans, and never string them into one long sentence.

Docs in this repo get a `# 🦐` title, but the skills Shrimpy ships don't. Use the shrimp emoji sparingly anywhere else, and don't hard-wrap prose.

When you're done, read the text once as its reader and cut whatever slows them down.

## No legacy support

Do not add backward-compatibility or migration code unless the user asks for it. The one standing ask: from 1.0.0, the chat store, the roster and each agent's storage migrate forward when their program starts, after a copy is set aside, through `src/lib/migration/`. A major release may leave converting a setup to the agent that updates it, as 3.0 does, and its changelog says what that agent has to do. Before 1.0.0, a setup in use is converted by hand.

- **Never** add a legacy support path by default.
- **Never** leave dead code, deprecated command shims, compatibility wrappers or error-only placeholder modules behind after replacing behavior. Remove the old path entirely.
- Replace old behavior directly instead of carrying both old and new code paths.

## Git

- **`nightly`** is where work lands. Commit freely there, and push it as it moves. It's what the owner's machines run. Between releases its version is the next minor with `-dev`, such as `1.1.0-dev`.
- **`main`** moves only at a release, by a fast-forward to the release commit on `nightly`. So its tip is always the latest release, and its README and install line match what people get.
- **Release tags** are the safest known states.
- A patch for a release, once `nightly` has moved on, is cherry-picked onto `main` and tagged there. Then `main` is merged back into `nightly`, so the next release can still fast-forward.
- Use a feature branch only when it solves a real problem.

## Releases

Use GitHub Releases for public versions.

- A release is a commit on `nightly` that sets the version. `main` fast-forwards to it, and it's tagged there with a GitHub release: `gh release create <tag> --target main --title "<tag> - <release name>" --notes "<summary>"`.
- A release candidate is a prerelease tag on a `nightly` commit, such as `v1.0.0-rc.1`, never on `main`, made with `--target nightly --prerelease`. It installs only by its exact version.
- Tags are semantic versions with a `v` prefix, such as `v0.1.0`.
- Every public release gets a short lyrical aquatic name. Keep it poetic but concrete, and put it in the release's title or notes. `v0.1.0` was **First Light in the Tidepool**.
- `CHANGELOG.md` is only for what matters to someone running Shrimpy: changes they'll notice, and anything they have to do, such as updating every machine at once. Each gets one short line, added under Unreleased in the change that makes it, and git history has the rest. A release's heading there is like `## 🦐 1.0.0 - A Rising Tide - YYYY-MM-DD`, since `shrimpy update` takes the release's name from it.
- A release writes down every contract it serves in `src/contracts/released.json`, since programs of one major keep serving what any release of it shipped. `npm run check` fails at a release until it has, and prints what to write.
- From 1.0.0 a release is a full one, never a prerelease, since the install script installs GitHub's latest release, which skips prereleases.

## Philosophy

Keep it shrimple.
