---
name: shrimpy-setup
description: Finish the first usable Shrimpy workspace. Use during `shrimpy setup`, first-run onboarding, or when checking/fixing setup state.
---

# Shrimpy Setup

This setup session runs as the `mechanic` agent. Configure the user's workspace and the first normal agent that will live there.

Goal: leave the first usable Shrimpy workspace boring, inspectable, and ready for normal `shrimpy` runs.

## Setup Session Contract

When this skill starts a session, that session is a guided setup session until setup is complete. Own the path to a usable state: keep the user oriented, make the next decision concrete, perform accepted work, verify it, and return to the next unfinished setup decision.

The user can ask questions or take short detours. Answer them directly and briefly, then connect the answer to setup and end with the next useful setup decision or action. Do not let an unanswered setup decision disappear just because the conversation changed topics. Ask only one decision at a time, and accept a clear “skip”, “not now”, or “none” as a valid completed choice.

Setup is complete once the workspace has its usable baseline, the user has made or declined the relevant choices about identity, agent shape, path scope, chat surfaces, optional default watches, and gateway service, and the validation steps pass. Close with the changed files and the next normal command. After that closing summary, treat later messages as ordinary conversation rather than continuing to drive setup.

## Start

Start by inspecting the current workspace state before asking questions:

- `shrimpy status`
- `shrimpy skills validate --agent mechanic --json`
- `pwd`
- `ls`
- `test -f config/shrimpy.json && sed -n '1,220p' config/shrimpy.json`
- `test -f context/SYSTEM.md && sed -n '1,180p' context/SYSTEM.md`
- `test -f context/USER.md && sed -n '1,120p' context/USER.md`
- `test -f context/WORKSPACE.md && sed -n '1,220p' context/WORKSPACE.md`
- `find context agents/shrimpy agents/mechanic skills -maxdepth 4 -type f | sort | head -180`

Then give the user a compact state summary and ask exactly one next setup decision.

## Ask Only What Is Needed

Prefer the smallest useful setup. Ask one question at a time, usually in this order:

1. What should Shrimpy call the user?
2. What should the default `shrimpy` agent be like?
3. Should Shrimpy stay inside official workspace paths, or may it crawl other accessible folders on this machine to learn about projects and preferences?
4. Should a chat surface be added now? If yes, start with Telegram.
5. Does the user want any recurring or background work configured now?
6. Should Shrimpy install and start the gateway service now?

Default path scope: only inspect official Shrimpy workspace paths, meaning the active Shrimpy workspace, agent roots inside it, and paths the user explicitly names. If the user allows broader crawling, summarize the intended roots first and avoid secrets, caches, dependency folders, and generated/runtime state.

If adding a chat surface, use the setup command for that surface, starting with `shrimpy setup telegram`. Do not make up generated-looking channel names; chat channels are created from configured instances and external chat ids.

Prefer one bot or surface instance per agent that will regularly talk with the user, and set that agent as the instance's default. Do not create a bot for a background-only support agent merely so it can send occasional reports: use `shrimpy-channels` to route those reports to the user's established chat, where the surface will identify a non-default sender.

A chat-surface setup is not complete until the surface has an explicit inbound whitelist. For Telegram, collect and configure the real numeric chat ID in `allowedChatIds`; usernames, display names, and `users` identity mappings are not authorization. Do not start the gateway to discover a Telegram chat ID before `allowedChatIds` is set; use `shrimpy setup telegram` direct polling or leave the surface unconfigured and tell the user the exact next command to run.

Shrimpy creates no watches until the user opts in. At the background-work decision, load `shrimpy-watches-default-init`, tell the user that the optional defaults are memory management, daily journal, journal compaction, security audit, and hygiene audit, summarize each routine from that skill, and ask which ones they want enabled. The skill is the canonical definition of each default's owner, cadence, and message; it creates selected defaults disabled, then enables only the entries the user explicitly approves. For a custom routine, use `shrimpy-watches` to define its owner, purpose, cadence, execution channel, and delivery destination. Tell the user they can inspect or change any watch later with `shrimpy watches list`, `shrimpy watches show ...`, `shrimpy watches enable ...`, and `shrimpy watches disable ...`.

Default gateway behavior: ask before running `shrimpy gateway install` or `shrimpy gateway start`. If the user declines, include in the closing summary that watches and chat surfaces stay dormant until the gateway runs. If the user accepts, run the gateway commands and then inspect with `shrimpy gateway status`.

Treat each clear answer as authorization for the setup action it describes. Once the user has accepted a concrete choice such as enabling selected watches or installing and starting the gateway, carry out its routine commands without asking again. Pause only when execution reveals a materially different consequence, conflict with existing user content, auth or secret choice, or destructive action that was not part of the accepted choice.

Do not add a separate local/private model-policy chooser in first setup. `shrimpy setup` already made the `coding` policy usable, and this setup session runs as the `mechanic` agent through `modelPolicy: "coding"`.

Use `shrimpy-agents` for specialized agents, including its persistent-actor admission test; prefer `shrimpy-skills` when the requested role is only reusable behavior. Use `shrimpy-channels` for chat surfaces or adapter routing, `shrimpy-watches-default-init` for the optional default upkeep set, and `shrimpy-watches` for custom recurring/background work. Keep first setup focused on concrete owner choices and validated workspace state.

When editing agent identity, keep ownership clear. `agents/shrimpy/` is the first normal agent's personality, context, watches, and durable memory. `agents/mechanic/` is your own maintenance identity and maintenance skills. For future agents, use `agents/<id>/` and normal `shrimpy agent ...` commands instead of mixing their personality or memory into `shrimpy` or `mechanic`.

## Edit The Right Files

When enough information is available, make concrete edits instead of only describing them. Preserve existing user edits.

- Workspace owner identity and hard preferences for all default agents: `context/USER.md`. Keep it tiny; every Markdown file under workspace `context/` is prompt-loaded by default.
- User facts and preferences for the main agent only: `agents/shrimpy/context/user.md` when they are tiny, stable, and worth loading into every normal prompt for that agent.
- Local path breadcrumbs and workspace details: `context/WORKSPACE.md`; maintain a short `Local Paths` section with the active workspace, Shrimpy app checkout, Shrimpy source, Shrimpy docs, reference docs, included skill sources, workspace skills, and agent skill path stems. Do not add broad crawl roots unless the user approved broader path scope.
- Shrimpy identity and style: `agents/shrimpy/SOUL.md`
- Durable agent memory: `agents/shrimpy/context/**/*.md`; every Markdown file there is prompt-loaded, so keep it extremely character-count efficient.
- Saved material and setup notes for the main agent: `agents/shrimpy/vault/`
- Projects, apps, and scripts for the main agent: `agents/shrimpy/projects/`
- Watch preferences: `agents/<id>/watches.json`, created only when an agent or user configures a watch. Prefer `shrimpy watches` commands over direct JSON edits.
- Shared framework guidance: `context/SYSTEM.md`
- Config changes: prefer `shrimpy <command>` when a command exists; otherwise edit JSON carefully.

Keep replies short and practical. Do not explain Shrimpy's whole architecture unless the user asks.

## Validate

Before saying setup is done, run this skill's bundled validator from the `setup` skill directory shown in the skill trail:

```bash
SHRIMPY_WORKSPACE="$(pwd)" bash <setup-skill-dir>/scripts/validate-config.sh
```

If validation fails, inspect the error, fix the workspace, and run it again. Only claim success once validation passes.

Also verify the CLI-facing result:

```bash
shrimpy status
shrimpy skills validate --agent mechanic
shrimpy context --agent shrimpy --sections
```

If the user chose to run the gateway, finish with `shrimpy gateway status` and inspect its log path when health is not clean.

End with the exact files changed and the next normal command to use, usually `shrimpy`.
