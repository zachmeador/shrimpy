# 🦐 Shrimpy

A home for agents, built on Pi's durable runtime.

If `AGENTS-PRIVATE.md` exists at the project root, read it for workspace- and user-specific context (paths, identifiers, local hosts) that is intentionally not tracked in git.

## Where things are

- **The redesign:** [`docs/REDESIGN/`](docs/REDESIGN/README.md) holds the design and the order of work. Its front page says where each piece stands and what to read. The design is one file for each core piece in `docs/REDESIGN/design/`, and [`PLAN.md`](docs/REDESIGN/PLAN.md) has the order of work.
- **Where the code trails the plan:** [`docs/REDESIGN/STATUS.md`](docs/REDESIGN/STATUS.md). What was built and decided, by date, is in [`docs/REDESIGN/history/LOG.md`](docs/REDESIGN/history/LOG.md).
- **For the author to review:** [`docs/REDESIGN/AUTHOR-TO-REVIEW.md`](docs/REDESIGN/AUTHOR-TO-REVIEW.md) holds what is waiting on the owner, and nothing else.
- **How to run and check it:** [`README.md`](README.md), which also has the layout rules and every command.
- **`src/`:** three programs (`agent/`, `chat/` and `gateway/`), the clients, the CLI, and the only code they share: `contracts/` and `lib/`.
- **`skills/`:** the skills Shrimpy ships to its agents.
- **`dev-skills/`:** instructions for working on this repo, such as the writing guide.
- **`shrimpy-old/`:** old Shrimpy, kept for reference until the release deletes it. Don't build, test or edit anything there, and don't take its shapes, docs or tests as a guide. Its tests are not to be read at all.
- **Entry point:** `src/cli/main.ts`, run as `bin/shrimpy.js`.

## How to work here

- **Build what the plan says, and raise every mismatch.** If the plan is wrong, unclear or silent, or the code can't follow it, say so to the user and to whoever is coordinating the build. Never settle it quietly in the code.
- **Core first.** Effort goes to the shape, which is hard to change later: the three programs and what each owns, the contracts between them, identity and addressing, the conversation model, the home, and the network. Wording, extra tools, skills and terminal affordances are made correct and plain, then tuned through use.
- **Tests earn their place.** A test protects a seam between programs, starting, stopping, crashing and recovering, a promise the plan makes, or a bug that was actually seen. Don't pin wording or an internal shape, and don't test test support. When a change breaks a test that only recorded how things were, the test goes.
- **No shortcuts reach a commit.** `npm run check` passes at every commit: types, the boundary lint and the tests.
- **Commands operate Shrimpy; clients and tools use it.** A `shrimpy` command starts, stops, configures, inspects or repairs a program or a home. `run` and `read` are the shell's client: one asks and prints the answer, the other prints a thread. What happens inside a conversation, such as editing or reacting, belongs to the clients and to an agent's tools. A contract method needs no command: it is reachable from code and from an agent's tools.
- **A command is never added in the change that adds the feature.** It gets a change of its own, which names who asked for it and what they couldn't do without it: the owner, a skill that tells someone to run it, or a test that can't reach the seam from code. Builders and whoever coordinates them don't count as askers. A feature that arrives as a noun, such as triggers or rooms, doesn't bring a full set of verbs with it.
- **Lean on Pi.** Wrap it cleanly and extend it at the point where it is the real constraint, not before.
- **Agents and Markdown before mechanisms.** Shrimpy provides guardrails and ways to talk. What an agent can work out from its instructions, a skill or its shell doesn't get a mechanism of its own.
- **Follow Shrimpy's own skills yourself.** If the user asks for something one of them covers, such as setting Shrimpy up, read `skills/<name>/SKILL.md` and do it.
- **A setup in use is user data.** Never connect to, stop or change a running Shrimpy's homes, chat data or runtime directory while developing. Give every run a runtime directory of its own with `SHRIMPY_RUNTIME_DIR`, and a folder of its own with `SHRIMPY_DIR`, since the default folder, `~/shrimpy`, is someone's real setup.

## Writing

Use the [writing guide](dev-skills/shrimpy-dev-writing-guide/SKILL.md) for every doc, skill, instruction, command and error message.

## No legacy support

Do not add backward-compatibility or migration code unless the user asks for it.

- **Never** add a legacy support path by default.
- **Never** leave dead code, deprecated command shims, compatibility wrappers or error-only placeholder modules behind after replacing behavior. Remove the old path entirely.
- Replace old behavior directly instead of carrying both old and new code paths.

## Git

- **Release tags** are the safest known states.
- **`main`** is expected to build and run. It holds old Shrimpy until the release replaces it.
- **`wip`** is the working branch, where the new Shrimpy is built. Commit freely there.

Promote coherent work from `wip` to `main` with cherry-picks, squash commits or a temporary promotion branch. Use a feature branch only when it solves a real problem.

## Releases

Use GitHub Releases for public versions. Early versions are alpha-quality unless the user says otherwise.

- Cut a release only from a clean, pushed `main`, never from `wip`.
- Tags are semantic versions with a `v` prefix, such as `v0.1.0`.
- Every public release gets a short lyrical aquatic name. Keep it poetic but concrete, and put it in the release's title or notes. `v0.1.0` was **First Light in the Tidepool**.
- For an alpha, create a prerelease: `gh release create <tag> --target main --title "<tag> alpha - <release name>" --notes "<summary>" --prerelease`.

## Philosophy

Keep it shrimple.
