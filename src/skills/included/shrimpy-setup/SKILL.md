---
name: shrimpy-setup
description: Finish the first usable Shrimpy workspace. Use during `shrimpy setup`, first-run onboarding, or when checking/fixing setup state.
---

# Shrimpy Setup

This setup session runs as the `mechanic` agent. Configure the user's workspace and the first normal agent that will live there.

Goal: leave the first usable Shrimpy workspace boring, inspectable, and ready for normal `shrimpy` runs.

## Start

Start by inspecting the current workspace state before asking questions:

- `pwd`
- `ls`
- `test -f config/shrimpy.json && sed -n '1,220p' config/shrimpy.json`
- `test -f profile/WORKSPACE.md && sed -n '1,180p' profile/WORKSPACE.md`
- `find agents/shrimpy agents/mechanic profile skills -maxdepth 4 -type f | sort | head -180`

Then give the user a compact state summary and ask exactly one next setup decision.

## Ask Only What Is Needed

Prefer the smallest useful setup. Ask one question at a time, usually in this order:

1. What should Shrimpy call the user?
2. What should the default `shrimpy` agent be like?
3. Should Shrimpy stay inside official workspace paths, or may it crawl other accessible folders on this machine to learn about projects and preferences?
4. Should a chat surface be added now? If yes, start with Telegram.
5. Should Shrimpy enable any background watches now? Offer some/all/none.
6. Should Shrimpy install and start the gateway service now?

Default path scope: only inspect official Shrimpy workspace paths, meaning the active Shrimpy workspace, agent roots inside it, and paths the user explicitly names. If the user allows broader crawling, summarize the intended roots first and avoid secrets, caches, dependency folders, and generated/runtime state.

If adding a chat surface, use the setup command for that surface, starting with `shrimpy setup telegram`. Do not make up generated-looking channel names; chat channels are created from configured instances and external chat ids.

A chat-surface setup is not complete until the surface has an explicit inbound whitelist. For Telegram, collect and configure the real numeric chat ID in `allowedChatIds`; usernames, display names, and `users` identity mappings are not authorization. Do not start the gateway to discover a Telegram chat ID before `allowedChatIds` is set; use `shrimpy setup telegram` direct polling or leave the surface unconfigured and tell the user the exact next command to run.

Default background behavior: setup installs watch schedules disabled. Ask whether the user wants to enable some, all, or none. Offer each watch briefly, noting that runs use the configured model:

- `shrimpy/memory-management`: daily 03:00, reviews recent activity and updates durable memory only when warranted.
- `shrimpy/journal-daily`: daily 22:30, writes a short day note when there was activity worth keeping.
- `shrimpy/journal-compact`: Sundays 04:00, compacts older journal notes after summaries exist.
- `mechanic/security-audit`: Mondays 05:00, writes a read-only security posture report.
- `mechanic/hygiene-audit`: Fridays 05:00, writes a read-only workspace hygiene report.

Enable accepted watches with `shrimpy watches enable <agent-id>/<watch-id>`. Leave declined watches disabled and discoverable. Tell the user they can change choices later with `shrimpy watches list`, `shrimpy watches enable ...`, and `shrimpy watches disable ...`.

Default gateway behavior: ask before running `shrimpy gateway install` or `shrimpy gateway start`. If the user declines, include in the closing summary that watches and chat surfaces stay dormant until the gateway runs. If the user accepts, run the gateway commands and then inspect with `shrimpy gateway status`.

Do not add a separate local/private model-policy chooser in first setup. `shrimpy setup` already made the `coding` policy usable, and this setup session runs as the `mechanic` agent through `modelPolicy: "coding"`.

Use `shrimpy-agents` for specialized agents, `shrimpy-channels` for chat surfaces or adapter routing, `shrimpy-watches` for recurring/background work, and `shrimpy-skills` for skill package changes. Keep first setup focused on concrete owner choices and validated workspace state.

When editing agent identity, keep ownership clear. `agents/shrimpy/` is the first normal agent's personality, context, watches, and durable memory. `agents/mechanic/` is your own maintenance identity and maintenance skills. For future agents, use `agents/<id>/` and normal `shrimpy agent ...` commands instead of mixing their personality or memory into `shrimpy` or `mechanic`.

## Edit The Right Files

When enough information is available, make concrete edits instead of only describing them. Preserve existing user edits.

- User facts and preferences: `profile/USER.md`
- Workspace layout and local path breadcrumbs: `profile/WORKSPACE.md`; maintain a short `Local Paths` section with the active workspace, Shrimpy app checkout, Shrimpy source, Shrimpy docs, reference docs, included skill sources, workspace skills, and agent skill path stems. Do not add broad crawl roots unless the user approved broader path scope.
- Shrimpy identity and style: `agents/shrimpy/SOUL.md`
- Durable agent memory: `agents/shrimpy/context/*.md`
- Saved material and setup notes for the main agent: `agents/shrimpy/vault/`
- Projects, apps, and scripts for the main agent: `agents/shrimpy/projects/`
- Watch preferences: `agents/<id>/watches.json`; setup defaults include `agents/shrimpy/watches.json` and `agents/mechanic/watches.json`. Prefer `shrimpy watches enable|disable <agent-id>/<watch-id>` for toggles.
- Shared framework guidance: `profile/SYSTEM.md`
- Config changes: prefer `shrimpy <command>` when a command exists; otherwise edit JSON carefully.

Keep replies short and practical. Do not explain Shrimpy's whole architecture unless the user asks.

## Validate

Before saying setup is done, run this skill's bundled validator from the `setup` skill directory shown in the skill trail:

```bash
SHRIMPY_WORKSPACE="$(pwd)" bash <setup-skill-dir>/scripts/validate-config.sh
```

If validation fails, inspect the error, fix the workspace, and run it again. Only claim success once validation passes.

End with the exact files changed and the next normal command to use, usually `shrimpy`.
