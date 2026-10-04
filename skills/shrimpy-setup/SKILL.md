---
name: shrimpy-setup
description: Use when the person asks you to get Shrimpy running, give an agent a model, or work out why part of the setup isn't running or answering.
---

# Getting Shrimpy running

You can check things and edit files. Starting programs is the person's step: `shrimpy up`, `agent serve`, `gateway serve` and `chat serve` run until someone stops them, so from your shell they never return. Hand the person the command to run in a terminal. Don't stop the gateway, the chat server or yourself either, or the conversation you are in is cut off.

## What runs

- **The gateway**, one per machine. It knows which programs are running and connects them, and it keeps the roster in its data directory: every person and agent on the network, by a name and an ID of its own. Nobody says who they are: the gateway decides. Never delete that directory.
- **The chat server**, one per machine. It keeps every channel, thread and message in its data directory. Never delete that directory.
- **An agent for each home.** One process that owns the home's files and answers in threads.

`shrimpy up <home>... --data <data-dir>` starts whichever of these is missing and stays in that terminal. Ctrl+C stops what it started. Anything already running is used as it is. To add an agent to a setup that is up, the person runs `shrimpy agent serve <home>` in another terminal. Stopping an agent that `up` started stops everything `up` started.

A program that won't start says why in the terminal that started it. Ask the person to paste it.

There is no setup command yet. A new setup is `shrimpy agent init`, a model for the agent, then `up`. One agent that answers is a complete setup, and a second can wait until the person asks for it.

## See what is running

- `shrimpy gateway status` lists the registered programs (kind, name, version and pid) and the roster (ID, kind, name, and whether it is reachable now). An agent that isn't listed among the programs isn't running.
- `shrimpy agent status <home>` says whether the agent at a home is running.
- `shrimpy sessions list <home>` lists the threads that agent is working in.

## A model for an agent

An agent gets its model from its own home and nowhere else: not from the environment, not from another home. Everything below is read when the agent starts, so the person restarts it after a change.

- `agent.json` names the model it starts with, as `provider/id`.
- `state/pi/models.json` declares servers of your own. A server that needs no key still takes a placeholder:
  `{"providers": {"local": {"baseUrl": "http://localhost:8090/v1", "api": "openai-completions", "apiKey": "local", "models": [{"id": "qwen3.8-27b"}]}}}`
- `state/pi/auth.json` holds keys for the built-in providers: `{"anthropic": {"type": "api_key", "key": "..."}}`. A key is used as written, so `$NAME` and `!command` are refused. Ask the person for it, and copy none from another home.

Signing in with OAuth doesn't work yet.

## When a command says

- **No gateway is running**, or **no chat server is registered**: nothing is up. The person runs `shrimpy up <home>... --data <data-dir>`.
- **The agent X is on the roster but is not running**: the person runs `shrimpy agent serve <home>`.
- **Nobody called X is on this machine's roster**: the name is wrong, or that agent hasn't run yet. An agent joins the roster the first time it runs, and the message lists the agents there are.
- **The name "X" is taken**: another member has the name, and people and agents share names. Change `name` in the agent's `agent.json` to one nobody has. The person starts the agent again.
- **The gateway does not know that token**: the gateway's roster was replaced since this home joined. The message names the file in the home to delete so that the agent joins again as a new member. A new member has none of the old one's DMs, so leave that to the person.
- **The chat server can't reach the gateway**: nobody can come in to chat until the gateway is back, and programs find it again when it is. If it stays down, the person runs `shrimpy up <home>... --data <data-dir>`.
- **Another process owns the agent home**: an agent already runs there. Use it.
- **A gateway is already running**, **a chat server is already running**, or **another chat server is using the data**: one is up already. Use it.
- **names the provider "p", which is not declared**: declare `p` in `models.json`, or correct the model in `agent.json`.
- **The provider "p" has no API key**: add the key to `auth.json`, or give a declared server its `apiKey`.
- **has no model "m"**: the message lists the models it has.
- **is not an agent home**: the path is wrong, or `shrimpy agent init` hasn't run there.
- **too long for a socket**: set `SHRIMPY_RUNTIME_DIR` to a shorter directory, for every shrimpy command.
- **runs Shrimpy 0.0.1, but this command is 0.0.0**: programs of two versions are up together. Restart them together.
- **not valid JSON**, or **unsupported keys**: the file it names has a mistake, and the message says where.

When you're done, say what you changed and the one command to run next.
