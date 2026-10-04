---
name: shrimpy-update
description: Use when preparing, applying, or verifying a Shrimpy update, including release inventory, workspace impact, gateway lifecycle, included-skill changes, and user-approved workspace migrations.
---

# Shrimpy Update

Use this mechanic-owned skill when the user wants to update Shrimpy or inspect the effect of a version change on an existing workspace. The job is to inventory the current and target releases, identify consequential application and workspace changes, ask the user to confirm one concrete plan, carry out the approved update, and verify the result.

When `shrimpy update` opens the session with current and target refs plus an exact `shrimpy update apply --tag ... --commit ...` command, treat that handoff as an end-to-end update task. Do not stop after producing an inventory or ask the user to copy commands into another terminal.

## Inventory

Run the bundled read-only inventory script from the skill directory shown in the skill trail. Pass the exact refs and commit from the update handoff:

```bash
node <update-skill-dir>/scripts/inventory.mjs \
  --current-ref <current-ref> \
  --target-ref <target-tag> \
  --target-commit <target-commit>
```

The script emits concise JSON covering the install type, Git state and fast-forward eligibility, Node/npm compatibility, gateway state and bindings, relevant application diffs, changed included skills and modified installed copies, newly introduced port candidates, workspace checkpoint state, and exact proposed commands. It does not fetch, checkout, stop services, edit files, install packages, or apply an update.

If the update handoff did not supply refs, run the script without them and use its locally or remotely discoverable release information. Treat an `unknown` eligibility or diff as a reason to inspect further, not as permission to guess. For a source checkout, test with the workspace environment removed:

```bash
env -u SHRIMPY_WORKSPACE npm test
```

Resolve any remaining detail through `context/WORKSPACE.md`, the relevant files in `docs/reference/`, and narrowly targeted Git commands. Do not dump large raw status or diff output into the conversation.

## Assess Workspace Impact

Turn the inventory into a short plan containing:

- the current and target release and commit;
- managed install or source checkout;
- application changes relevant to workspace files, config, agents, skills, watches, channels, sessions, state, runtime, gateway, surfaces, or the web inspector;
- gateway state before the update and the exact stop/start intent;
- changed included skills, their installed-copy modification state, and any required add, update, rename, remove, keep, or review decision;
- exact commands and risk level for each consequential step;
- whether workspace checkpointing or another backup will be used.

Treat `config/`, `agents/`, `state/`, `runtime/`, `channels/`, `media/`, workspace `skills/`, and agent skills as user data. Preserve user-created skills by default.

If a Shrimpy-owned package was renamed or removed, present the old installed copy and the replacement as an explicit workspace change. Do not leave a compatibility alias or silently delete the old copy.

## Keep Default Skills Current

Keeping Shrimpy's installed default skill packages aligned with the target release is an important part of the update, not optional cleanup. These skills carry current product behavior and safety guidance. User-created skills remain user-owned, but do not leave an old Shrimpy default active merely because its installed copy is marked modified.

Refresh every unmodified default included package after the user approves the update plan. For a modified default package, first confirm that there is a real difference: compare the complete installed package with the target release package, then tell the user which files differ and summarize the meaningful instruction changes. Do not assume that a hash or `modified: true` flag represents intentional customization.

Ask the user directly to choose one of these outcomes for each genuinely customized default:

1. **Merge into the target package.** Start from the target release package and carry forward only the user's intentional, compatible additions. The target version dictates the skill: do not retain old text that removes, weakens, contradicts, or reverts its behavior or safety boundaries. Show the resulting bounded diff and validate the merged live package.
2. **Archive the old package and use the target package unchanged.** Preserve the complete old directory in a hidden archive beside its live skill root, then install the target package at the normal live path. Use `skills/.archive/<id>-before-<target-tag>-<timestamp>/` for a workspace skill or `agents/<id>/skills/.archive/<id>-before-<target-tag>-<timestamp>/` for an agent skill. Hidden skill directories are ignored by discovery, so the archive stays nearby without becoming active.

Do not silently overwrite a customized default, and do not offer indefinite use of the stale default as the routine safe choice. If the user has not chosen merge or archive-and-replace, leave that package untouched, mark default-skill refresh as unresolved, and do not claim that the workspace update is complete.

## Plan The Gateway Lifecycle

Preserve runtime intent: a stopped gateway stays stopped, while a running gateway is restarted only after the new application and workspace checks pass.

For a managed gateway:

1. Immediately before replacing application code or generated runtime files, stop a running gateway with `shrimpy gateway stop`.
2. Run `shrimpy gateway status` and confirm that the old gateway process no longer owns the workspace.
3. Run the exact tagged apply command from the update handoff. Do not substitute another tag or branch ref.
4. Continue through the newly installed CLI and apply only the approved workspace changes.
5. If service definitions, runtime paths, or environment setup changed, refresh the service with `shrimpy gateway install`.
6. Start the gateway only if it was running before the update.

For a manually managed gateway, identify the exact stop and start commands during inventory. Do not replace live application code until the user confirms that the old process has stopped.

## Confirm And Apply

Stop after the inventory and present one concise update plan. Ask for one approval covering its exact application changes, workspace changes, skill-package decisions, gateway sequence, and checkpoint or backup. A clear approval such as “go ahead” or “do it” authorizes the listed routine commands.

Pause again only for a materially consequential decision that was not in the approved plan: destructive work, auth or secrets, conflicts with modified user content, a different target release, or a broader workspace change.

Managed installs use only the guarded command supplied by the update handoff:

```bash
shrimpy update apply --tag <tag> --commit <commit>
```

Do not put the mutating update lifecycle in a skill script. For source checkouts, use the repository's Git and build workflow and keep every mutation visible as an ordinary command.

If the update was launched from a mechanic TUI, that session may still be running previously loaded application code after the app swap. It can finish through the newly installed CLI, but tell the user to exit and reopen the mechanic when verification is complete.

## Verify

Run the bundled verifier with the expected target and the gateway state recorded by inventory:

```bash
node <update-skill-dir>/scripts/verify.mjs \
  --expected-tag <target-tag> \
  --expected-commit <target-commit> \
  --gateway <running|stopped>
```

The verifier checks the installed version and commit, source cleanliness, skills and context assembly for every configured agent, and the requested gateway state. For a running gateway it polls the heartbeat, web sidecar, configured surface reports, and web inspector until healthy or the bounded timeout expires. On failure it includes recent gateway logs in its JSON result.

Do not replace health polling with arbitrary sleeps. If verification fails, leave an unhealthy gateway stopped after inspection and report the exact failure and recovery command; do not repeatedly restart it.

Finish with the version moved to, application and workspace changes made, commands run, checks passed, gateway before/after state, each default skill refreshed, merged, or archived, and any unresolved decisions.
