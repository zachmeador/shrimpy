# 🦐 SETUP-001: First-Run Onboarding Lands Somewhere

Status: review
Priority: P1
Area: Setup
Depends On: none

## Why
First-run setup ends without ever mentioning the gateway. `ensureWorkspaceInitialized` seeds three watches (`memory-management`, `journal-daily`, `journal-compact`) and the setup skill asks whether to leave them enabled, but nothing in the flow installs or starts the gateway, so a fresh user who finishes setup gets a workspace where watches and chat surfaces silently never run. The only gateway guidance lives in the Telegram epilogue and in `setupNextStepLines` (`src/setup/init.ts`), which no CLI path reaches.

The flow also gives no signal about where the user stands. Setup state flips to `ready` the moment the coding policy resolves and agent context dirs exist, before the mechanic session does any personalization; a user who quits the mechanic TUI immediately gets "Setup already has a model policy and agent context. Nothing to do." on rerun, with no pointer to `shrimpy mechanic` or `shrimpy setup telegram` as re-entry paths. `shrimpy status` — the command the installer names as the next step — prints workspace, gateway, and channel state with no setup readiness line. After the mechanic session exits, `runSetupOnboarding` returns silently with no printed next steps.

## Build
- Setup skill: add a gateway step before the closing summary — offer `shrimpy gateway install` + `shrimpy gateway start`, and when the user declines, say plainly that watches and chat surfaces stay dormant until the gateway runs.
- `runSetupOnboarding`: after the mechanic session returns, print a short next-steps block (gateway install/start when absent, `shrimpy status`, key workspace paths). Reuse or replace `setupNextStepLines` so that text has exactly one live home.
- `already_configured` message: name the re-entry paths (`shrimpy mechanic` for workspace shaping, `shrimpy setup telegram` for chat surfaces) instead of ending at "Nothing to do."
- `shrimpy status`: add a setup readiness line driven by `resolveSetupState` (for example `setup: needs model access — run shrimpy setup`), so the installer's suggested next step actually reports setup state.

## Boundaries
- `ready` keeps meaning plumbing (model policy resolves, agent contexts exist). Personalization stays best-effort and owned by the skill; do not gate readiness on `USER.md` content.
- Ask before installing the gateway service; never auto-install host-level units during setup.
- A live model call to verify auth during setup (today's smoke test only resolves the policy statically, so a bad API key first fails inside the mechanic TUI) is a candidate follow-up, not this slice.
- No new state files; setup state stays derived from config, auth, and workspace files.

## Notes
- Touch points: `src/setup/templates/mechanic/skills/setup/SKILL.md`, `src/setup/onboarding.ts`, `src/setup/init.ts` (`setupNextStepLines`), `src/commands/status.ts`.
- The gateway question fits naturally as the last owner decision in the skill's question list, next to the existing watches question.
- SETUP-002 removes the dead `setupInit` print wrapper; coordinate so `setupNextStepLines` ends up either wired into onboarding output here or deleted there, not both.

## Done
- Finishing the mechanic setup session prints next steps that include gateway install/start when the gateway service is absent.
- The setup skill asks the gateway question, and declining produces an explicit dormant-watches statement in the closing summary.
- `shrimpy setup` on a ready workspace names `shrimpy mechanic` and `shrimpy setup telegram` as re-entry paths.
- `shrimpy status` on an unconfigured workspace shows a setup line naming the blocking state and the command to run; on a ready workspace it shows setup as ready.
- Tests cover the status setup line for at least `needs_model_access` and `ready`, and the onboarding next-steps output.
