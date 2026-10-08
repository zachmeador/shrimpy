---
name: shrimpy-setup
description: Use when the person asks you to get Shrimpy running, give an agent a model, or work out why part of the setup isn't running or answering.
---

# Getting Shrimpy running

You can check things and edit files. Starting Shrimpy is the person's step: `shrimpy up`, `agent serve`, `gateway serve` and `chat serve` run until someone stops them, so from your shell they never return. Hand the person the command to run in a terminal. A new agent's home is not a step of theirs: while Shrimpy runs, its agent starts by itself in a few seconds, and `shrimpy gateway status` then lists it. Don't stop the gateway, the chat server or yourself either, or the conversation you are in is cut off.

## What runs

- **The gateway**, one per machine. It knows which programs are running and connects them, and it keeps the roster in its data directory, `gateway/`: every person and agent on the network, by a name and an ID of its own. Nobody says who they are: the gateway decides. Never delete that directory.
- **The chat server**, one per machine. It keeps every channel, thread and message in its data directory, `chat/`. Never delete that directory.
- **An agent for each home.** One process that owns the home's files and answers in threads.

By default all of it lives in the Shrimpy folder, `~/shrimpy` or the folder `SHRIMPY_DIR` names: `agents/` holds a home for each agent, beside `providers/`, `gateway/` and `chat/`. Commands take an agent by name, like `scout`, which is `agents/scout` there.

`shrimpy up` starts whichever of these is missing, with every agent in `agents/`, and stays in that terminal. Ctrl+C stops what it started. Anything already running is used as it is. An agent that ends is started again, after pauses that grow while it keeps failing. An agent that joined a gateway elsewhere with `shrimpy agent join` belongs to that gateway: where every agent in the folder does, `up` starts those agents and no gateway or chat server, and they are talked to from the gateway's machine.

`shrimpy gateway install` keeps `shrimpy up` running as a service of the person's account, started again if it fails, and `shrimpy gateway uninstall` removes it. They are the person's to run: installing again restarts everything, you included.

Programs reach each other by name through the gateway, so people and agents can talk only while it runs. An agent's own work does not need it, and its replies wait until it is back, but `up` stops everything it started when the gateway or the chat server ends. With the gateway down, `shrimpy sessions list`, `shrimpy sessions read <session>` and `shrimpy sessions stop <session>` still work for an agent asking about itself, and for a person, who adds `--agent <agent>`, because they go straight to the agent's home. From an agent's shell, a command about another agent goes through the gateway and takes an admin.

A program that won't start says why in the terminal that started it. Ask the person to paste it.

There is no setup command yet. A new setup is `shrimpy providers login` to sign in and choose a model, then `shrimpy agent init <name>`, then `shrimpy up`. One agent that answers is a complete setup, and a second can wait until the person asks for it.

## See what is running

- `shrimpy gateway status` lists the registered programs (kind, name and version) and the roster (ID, kind, name, and whether it is reachable now), and ends with whether a service keeps the Shrimpy folder running. An agent that isn't listed among the programs isn't running.
- `shrimpy agent status --agent <agent>` says whether that agent is running.
- `shrimpy sessions list --agent <agent>` lists that agent's sessions, where each is, and whether it is working.

## A model for an agent

An agent takes its model, servers and keys from two places and nowhere else: not from the environment, not from another home. Its own home comes first, and what the home doesn't hold comes from `providers/` in the Shrimpy folder, which every agent started there shares. The model and the servers are read when the agent starts, so the person restarts it after changing one. A key or a sign-in is read again at every request.

- `agent.json` names the model it starts with, as `"model": {"provider": "local", "id": "qwen3.8-27b"}`, which `agent init --model <provider/id>` writes. An agent whose `agent.json` names none starts with the one in `providers/default-model.json`: `{"provider": "local", "id": "qwen3.8-27b"}`. With neither it doesn't start.
- `models.json` declares servers of your own: `state/pi/models.json` in a home, `providers/models.json` in the folder. A server that needs no key still takes a placeholder:
  `{"providers": {"local": {"baseUrl": "http://localhost:8090/v1", "api": "openai-completions", "apiKey": "local", "models": [{"id": "qwen3.8-27b"}]}}}`
- `auth.json` holds keys for the built-in providers: `state/pi/auth.json` in a home, `providers/auth.json` in the folder. `{"anthropic": {"type": "api_key", "key": "..."}}`. A key is used as written, so `$NAME` and `!command` are refused. A key in the folder serves every agent, and one in a home only that agent. Copy none from another home.

The person signs the folder in with `shrimpy providers login [<provider>]`, with a subscription or an API key, and it asks which model agents start with if `default-model.json` isn't there. It is theirs to run, since it needs them at a terminal, and at a browser for a subscription: hand them the command, and don't ask for a key in chat. A sign-in is renewed when its token runs out.

## When a command says

- **No gateway is running**, or **no chat server is registered**: nothing is up. The person runs `shrimpy up`.
- **The agent X is on the roster but is not running**: the person runs `shrimpy agent serve <agent>`. For an agent that lives elsewhere, which has no home here, they run `shrimpy up` where it lives.
- **Nobody called X is on the roster**: the name is wrong, or that agent hasn't run yet. An agent joins the roster the first time it runs, or when `shrimpy agent join` is run for it where it lives, and the message lists the agents there are.
- **The name "X" is taken**: another member has the name, and people and agents share names. Change `name` in the agent's `agent.json` to one nobody has. The person starts the agent again.
- **The gateway does not know that token**: the gateway's roster was replaced since this home joined. The message names the file in the home to delete so that the agent joins again as a new member. A new member has none of the old one's DMs, so leave that to the person.
- **The chat server can't reach the gateway**: nobody can come in to chat until the gateway is back, and programs find it again when it is. If it stays down, the person runs `shrimpy up`.
- **The agent "X" is already running**: another home holds the same token, so the gateway takes the two for one agent. That happens when a home is copied. The message says how to make the copy an agent of its own. Don't start an agent's home twice.
- **Another process owns the agent home**: an agent already runs there. Use it.
- **A gateway is already running**, **a chat server is already running**, or **another chat server is using the data**: one is up already. Use it.
- **The agent has no model to start with**: name one in `agent.json`, or put one in `providers/default-model.json`.
- **names the provider "p", which is not declared**: declare `p` in a `models.json`, the home's or the folder's, or correct the model in the file the message says names it: `agent.json`, or `providers/default-model.json`.
- **The provider "p" has no API key**, or **signs in with an account** and has no sign-in: the person runs `shrimpy providers login p`. To give a declared server a key instead, set its `apiKey`.
- **has no model "m"**: the message lists the models it has.
- **is not an agent home**: the path is wrong, or `shrimpy agent init` hasn't run there.
- **There is no agent called X**: the name is wrong or the agent isn't made yet. The message lists the agents the Shrimpy folder has and the command that makes this one.
- **There are no agents in … yet**: `shrimpy up` has nothing to start. Make an agent first, or give `shrimpy up` an address with `--listen <host:port>` to start only the gateway and the chat server, for agents that live elsewhere.
- **has other files in it and no agents/ or providers/ folder**: that folder isn't Shrimpy's, so nothing is made there. The person sets `SHRIMPY_DIR` to another folder, or moves that one.
- **too long for a socket**: set `SHRIMPY_RUNTIME_DIR` to a shorter directory, for every shrimpy command.
- **runs Shrimpy 0.0.1, but this command is 0.0.0**: programs of two versions are up together. Restart them together.
- **not valid JSON**, or **unsupported keys**: the file it names has a mistake, and the message says where.

When you're done, say what you changed and the one command to run next.
