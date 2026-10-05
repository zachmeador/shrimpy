---
name: shrimpy-agents
description: Use when the person asks for another agent, wants to change who an agent is or which model it uses, or asks what an agent is doing.
---

# Making and looking after agents

An agent is a folder. Make one when the person asks for one. If what they want is a way of doing a job, that is a skill (see shrimpy-skills), and any agent can have it: a job having a name doesn't make it someone.

## Make one

1. `shrimpy agent init <name> --model <provider/id>` makes its home in the person's Shrimpy folder, as `agents/<name>`, and prints where. A name is letters, digits, dots, hyphens and underscores, and no one else on the roster can have it: people and agents share names. Running it again changes nothing that exists.
2. Give it a model. Its home is its own and inherits nothing from yours (see shrimpy-setup).
3. Say who it is in its `SOUL.md`. The starter works as it is, so edit it and keep what still fits.
4. The person starts it with `shrimpy agent serve <name>` in a terminal, or with `shrimpy up` if nothing is running yet. It joins the roster the first time it runs, and `shrimpy gateway status` then lists it.
5. Leave the first hello to the person. `shrimpy run` from your shell would be you talking, not them.

## What is in a home

The Shrimpy folder is `~/shrimpy`, or the folder `SHRIMPY_DIR` names, and has a home for each agent in `agents/`. A command that takes an `<agent>` takes its name, like `scout`, or the path of its home. A word with a `/` in it, or one that starts with `.` or `~`, is a path.

```text
agent.json            its name and the model it starts with
SOUL.md               who it is: the first thing in its instructions
context/              Markdown notes shown in every conversation
skills/               its own skills, a folder each with a SKILL.md
triggers/             its triggers, a small file each (see shrimpy-triggers)
vault/                longer notes it reads when it needs them
state/pi/models.json  model servers it can use
state/pi/auth.json    its API keys
state/agent.sqlite    the engine's storage
state/member.json     the key that proves it is this agent, and its ID on the roster once it has joined
runtime/              the lock, where to find the agent by its home, and the shrimpy command: disposable
```

Never open `state/agent.sqlite` or edit `runtime/`: the running agent owns them. Never show `state/member.json` to anyone: whoever holds the key is that agent. Every agent under one user can read and edit every other's files, so be sure which home you are in.

## Change who an agent is

Edit `SOUL.md` for its voice and role, and `context/` for what it should always have in mind. Both are shown on every request, so keep them short and put the long material in `vault/`. Don't repeat in `SOUL.md` what its instructions already say about replying and the message tools.

A running agent reads these files when it starts and when it is told to reload, and at no other time.

- `shrimpy agent reload <agent>` makes it read them again. Each of its sessions uses the change with its next request, and names any file it couldn't use.
- `shrimpy agent context <agent>` shows what it would be told if it started now. It reads the files and starts nothing, so run it before the reload to see the result.

A change to `agent.json`, `models.json` or `auth.json` waits for a restart, which is the person's step. A new `name` in `agent.json` renames the agent when it restarts: it stays the same member, with its DMs and history, and a name another member has is refused.

## See what an agent is doing

- `shrimpy sessions list <agent>` has a line for each thread it is in: the thread, its channel, and `working` or `idle`.
- `shrimpy sessions read <agent> <session>` shows a session, named by its thread's ID or as `trigger:<name>` for a trigger's own: what the agent was shown, what its tools did and what it answered.
- `shrimpy sessions stop <agent> <session>` stops the work in that session and takes back the messages it hadn't picked up. Those stay in the thread, marked skipped, and the agent reads them with the next one. The agent keeps running.

`sessions steer` puts input into a session that the thread never sees. It is not a way to talk to an agent.

Your own sessions and triggers are yours to look at and stop. Another agent's, and reloading it, take an admin: every person is one, and an agent is one once it has been promoted. If you are refused, the refusal says who the admins are, and you can ask one of them.

No command removes an agent. To retire one, have the person stop it and leave its home where it is. Delete files only when they ask you to.
