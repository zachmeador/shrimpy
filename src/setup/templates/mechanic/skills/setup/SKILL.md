---
name: setup
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
- `find agents/shrimpy agents/mechanic profile skills -maxdepth 4 -type f | sort | head -180`

Then give the user a compact state summary and ask exactly one next setup decision.

## Ask Only What Is Needed

Prefer the smallest useful setup. Ask one question at a time, usually in this order:

1. What should Shrimpy call the user?
2. What should the default `shrimpy` agent be like?
3. Should Shrimpy stay inside official workspace paths, or may it crawl other accessible folders on this machine to learn about projects and preferences?
4. Should a chat surface be added now? If yes, start with Telegram.
5. Should Shrimpy leave its background watches enabled, or pause them for now?

Default path scope: only inspect official Shrimpy workspace paths, meaning the active Shrimpy workspace, agent roots inside it, and paths the user explicitly names. If the user allows broader crawling, summarize the intended roots first and avoid secrets, caches, dependency folders, and generated/runtime state.

If adding a chat surface, use the setup command for that surface, starting with `shrimpy setup telegram`. Do not create adapter-shaped channel names by hand; Telegram channels are created from configured instances and external chat ids.

Default background behavior: setup seeds three watches: `memory-management`, `journal-daily`, and `journal-compact`. They post work into the `maintenance` channel on their configured cadence. If the user wants quiet setup, set those entries in `agents/shrimpy/watches.json` to `enabled: false`; do not delete them.

Do not add a separate local/private model-policy chooser in first setup. `shrimpy setup` already made the `coding` policy usable, and this setup session runs as the `mechanic` agent through `modelPolicy: "coding"`.

Use the mechanic skill when setup turns into repair, configuration design, app-agent shaping, or deeper Shrimpy maintenance. Use `add-agent` for new specialized agents, `channel-routing` for chat surfaces or adapter routing, and `watches` for recurring/background work. Keep first setup focused on concrete owner choices and validated workspace state.

When editing agent identity, keep ownership clear. `agents/shrimpy/` is the first normal agent's personality, context, watches, and durable memory. `agents/mechanic/` is your own maintenance identity and maintenance skills. For future agents, use `agents/<id>/` and normal `shrimpy agent ...` commands instead of mixing their personality or memory into `shrimpy` or `mechanic`.

## Edit The Right Files

When enough information is available, make concrete edits instead of only describing them. Preserve existing user edits.

- User facts and preferences: `profile/USER.md`
- Shrimpy identity and style: `agents/shrimpy/SOUL.md`
- Durable agent memory: `agents/shrimpy/context/*.md`
- Shared saved material: `vault/`
- Shared projects, apps, and scripts: `projects/`
- Agent reports or setup notes: `agents/shrimpy/vault/`
- Watch preferences: `agents/shrimpy/watches.json`
- Config changes: prefer `shrimpy <command>` when a command exists; otherwise edit JSON carefully.

Keep replies short and practical. Do not explain Shrimpy's whole architecture unless the user asks.

## Validate

Before saying setup is done, run:

```bash
bash agents/mechanic/skills/setup/scripts/validate-config.sh
```

If validation fails, inspect the error, fix the workspace, and run it again. Only claim success once validation passes.

End with the exact files changed and the next normal command to use, usually `shrimpy`.
