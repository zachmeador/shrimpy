# 🦐 SETUP-002: Setup Entry Seams And Dead Code

Status: todo
Priority: P2
Area: Setup
Depends On: none

## Why
The setup entry paths disagree on mechanics in ways users can hit. Bare `shrimpy` passes `process.cwd()` into onboarding (`src/commands/root.ts` → `src/commands/tui.ts`), while `shrimpy setup` uses the workspace, so the mechanic setup session's cwd depends on which command launched it. The setup skill's opening recipe (`test -f config/shrimpy.json`, `find agents/shrimpy …`) and its validator invocation (`bash scripts/validate-config.sh`) are workspace-relative, so the bare-`shrimpy` entry drops the agent into a directory where the recipe fails. The validator itself lives in the app checkout (default skills are served from `src/setup/templates/`, not copied into the workspace), and its five-dirs-up fallback assumes a workspace install path that does not exist, so it only resolves the workspace when cwd already is the workspace.

Exit codes disagree the same way: non-interactive `shrimpy setup` with no models prints the interactive-terminal message and exits 0 (`src/commands/setup.ts` ignores the onboarding result kind), while bare `shrimpy` in the same state exits 1, so `shrimpy setup && shrimpy gateway install` cannot be scripted.

Dead code from the previous setup design is still in the tree: `extensions/setup.ts` handles a `setup-provider` session type no code creates (replaced by the readline model-access wizard in `src/setup/model-access.ts`), and `setupInit` in `src/setup/init.ts` is a CLI-shaped print wrapper reachable only from tests. `shrimpy setup` and `shrimpy setup init` run the identical onboarding call while the README still presents init as the distinct explicit workspace-creation step.

## Build
- Onboarding session cwd: always run the mechanic setup session with the workspace as cwd, regardless of entry path.
- Validator resolution: make the skill's validator instruction work from any cwd — reference the script relative to the skill directory shown in the skill trail, or export `SHRIMPY_WORKSPACE` in the invocation — and fix or remove the script's broken five-up fallback so its resolution order matches where default skills actually live.
- Exit codes: `cmdSetup` maps onboarding result kinds to exit status — `setup_started` and `already_configured` exit 0, everything else nonzero.
- Remove `extensions/setup.ts` and its entry in `SHRIMPY_EXTENSION_PATHS` (`src/sessions/pi-resources.ts`).
- Collapse `shrimpy setup init` into `shrimpy setup` (one onboarding entry, one catalog line) and update README/`docs/reference/setup.md` text that implies init is a separate explicit step.
- Move `setupInit` out of production source: tests call `ensureWorkspaceInitialized` directly or a test helper wraps it; the unreachable print wrapper goes away.

## Boundaries
- No broad flow or wording redesign of onboarding output.
- No change to which files `ensureWorkspaceInitialized` creates or to the setup state machine in `src/setup/state.ts`.
- Installer (`scripts/install.sh`) keeps printing `shrimpy setup init` only until the command collapses; update it in the same change.

## Notes
- `setupInit` has ~100 test call sites across `test/*.test.ts`; the migration is mechanical (same signature as `ensureWorkspaceInitialized` plus printing).
- Per the repo legacy policy, the collapsed `setup init` subcommand is removed, not aliased.
- Verify the bare-`shrimpy` onboarding path end to end after the cwd change: skill recipe commands and validator both succeed from a session launched outside the workspace.

## Done
- Bare `shrimpy` and `shrimpy setup` launch the setup session with identical cwd (the workspace), and the skill's recipe commands succeed from both entries.
- `bash` validator invocation from the skill passes from a setup session launched in a directory other than the workspace.
- Non-interactive `shrimpy setup` with no usable models exits nonzero.
- `extensions/setup.ts` and the `setup-provider` handling are gone; `grep -r setup-provider src extensions` is empty.
- `shrimpy setup init` no longer exists; README, reference setup doc, installer next-steps, and catalog show the single `shrimpy setup` entry.
- `setupInit` no longer ships in `src/`; tests pass using the init seam directly.
