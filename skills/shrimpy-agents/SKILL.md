---
name: shrimpy-agents
description: Use when the person asks for another agent, wants to change who an agent is or which model it uses, or asks what an agent is doing.
---

# Making and looking after agents

An agent is a folder. Make one when the person asks for one. If what they want is a way of doing a job, that is a skill (see shrimpy-skills), and any agent can have it: a job having a name doesn't make it someone.

## Make one

1. `shrimpy agent init <home> --name <name> --model <provider/id>`. Put the home next to your own. A name is letters, digits, dots, hyphens and underscores, and no one else on the roster can have it: people and agents share names. Running it again changes nothing that exists.
2. Give it a model. Its home is its own and inherits nothing from yours (see shrimpy-setup).
3. Say who it is in its `SOUL.md`. The starter works as it is, so edit it and keep what still fits.
4. The person starts it with `shrimpy agent serve <home>` in a terminal. It joins the roster the first time it runs, and `shrimpy gateway status` then lists it.
5. Leave the first hello to the person. `shrimpy run` from your shell would be you talking, not them.

## What is in a home

```text
agent.json            its name and the model it starts with
SOUL.md               who it is: the first thing in its instructions
context/              Markdown notes shown in every conversation
skills/               its own skills, a folder each with a SKILL.md
vault/                longer notes it reads when it needs them
state/pi/models.json  model servers it can use
state/pi/auth.json    its API keys
state/agent.sqlite    the engine's storage
state/member.json     its ID on the roster and the key that proves it is this agent
runtime/              the lock, the socket and the shrimpy command: disposable
```

Never open `state/agent.sqlite` or edit `runtime/`: the running agent owns them. Never show `state/member.json` to anyone: whoever holds the key is that agent. Every agent under one user can read and edit every other's files, so be sure which home you are in.

## Change who an agent is

Edit `SOUL.md` for its voice and role, and `context/` for what it should always have in mind. Both are shown on every request, so keep them short and put the long material in `vault/`. Don't repeat in `SOUL.md` what its instructions already say about replying and the message tools.

A running agent reads these files when it starts and when it is told to reload, and at no other time.

- `shrimpy agent reload <home>` makes it read them again. Each of its sessions uses the change with its next request, and names any file it couldn't use.
- `shrimpy agent context <home>` shows what it would be told if it started now. It reads the files and starts nothing, so run it before the reload to see the result.

A change to `agent.json`, `models.json` or `auth.json` waits for a restart, which is the person's step. A new `name` in `agent.json` renames the agent when it restarts: it stays the same member, with its DMs and history, and a name another member has is refused.

## See what an agent is doing

- `shrimpy sessions list <home>` has a line for each thread it is in: the thread, its channel, and `working` or `idle`.
- `shrimpy sessions read <home> <thread>` shows that session: what the agent was shown, what its tools did and what it answered.
- `shrimpy sessions stop <home> <thread>` stops the work in that session and takes back the messages it hadn't picked up. Those stay in the thread, marked skipped, and the agent reads them with the next one. The agent keeps running.

`sessions steer` puts input into a session that the thread never sees. It is not a way to talk to an agent.

No command removes an agent. To retire one, have the person stop it and leave its home where it is. Delete files only when they ask you to.
