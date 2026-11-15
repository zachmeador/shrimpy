---
name: shrimpy-setup
description: Use when the person asks you to get Shrimpy running, give an agent a model, or work out why part of the setup isn't running or answering.
---

# Getting Shrimpy running

You can check things and edit files. Starting Shrimpy is the person's step: `shrimpy up`, `agent serve`, `gateway serve` and `chat serve` run until someone stops them, so from your shell they never return. Hand the person the command to run in a terminal. A new agent's home is not a step of theirs: while Shrimpy runs, its agent starts by itself in a few seconds, and `shrimpy status` then lists it. Don't stop the gateway, the chat server or yourself either, or the conversation you are in is cut off.

## What runs

- **The gateway**, one per machine. It knows which programs are running and connects them, and it keeps the roster in its data directory, `gateway/`: the person and every agent on the network, by a name and an ID of its own. Nobody says who they are: the gateway decides. Its key is kept there too, which proves the gateway to whatever comes in from apart. Never delete that directory.
- **The chat server**, one per machine. It keeps every channel, thread and message in its data directory, `chat/`. Never delete that directory.
- **An agent for each home.** One process that owns the home's files and answers in threads.

By default all of it lives in the Shrimpy folder, `~/shrimpy` or the folder `SHRIMPY_DIR` names: `agents/` holds a home for each agent, beside `providers/`, `gateway/`, `chat/` and the person's `settings.json`. Commands take an agent by name, like `scout`, which is `agents/scout` there.

`shrimpy up` starts whichever of these is missing, with every agent in `agents/`, and stays in that terminal. Ctrl+C stops what it started. Anything already running is used as it is. An agent that ends is started again, after pauses that grow while it keeps failing. An agent that joined a gateway elsewhere with `shrimpy join` belongs to that gateway: where every agent in the folder does, `up` starts those agents and no gateway or chat server, and they are talked to from the gateway's machine.

`shrimpy install` keeps `shrimpy up` running as a service of the person's account, started again if it fails, and `shrimpy uninstall` removes it. They are the person's to run: installing again restarts everything, you included.

Programs reach each other by name through the gateway, so people and agents can talk only while it runs. An agent's own work does not need it, and its replies wait until it is back, but `up` stops everything it started when the gateway or the chat server ends. With the gateway down, `shrimpy sessions list`, `shrimpy sessions read <session>` and `shrimpy sessions stop <session>` still work for an agent asking about itself, and for a person, who adds `--agent <agent>`, because they go straight to the agent's home. From an agent's shell, a command about another agent goes through the gateway and takes an admin.

A program that won't start says why in the terminal that started it. Ask the person to paste it.

An agent beside the gateway runs under the person's own account, so it can do anything the person can: whatever runs under that account can read every token there. Shrimpy's roles keep it from doing so by accident, and nothing more. Tell the person so when you make an agent. One that should be walled off runs under an account of its own, in a container or on another machine, and comes in with an invitation, as below.

There is no setup command yet. A new setup is `shrimpy login` to sign in and choose a model, then `shrimpy agent init <name>`, then `shrimpy up`. One agent that answers is a complete setup, and a second can wait until the person asks for it. On an account made for Shrimpy, set the person's name first, as below.

## The person's name

A gateway has one person, who starts with the name of the OS account the gateway first ran as. From then on the name is a setting, in `settings.json` in the Shrimpy folder on the gateway's machine: `{"name": "zach"}`. The gateway reads the file when it starts and whenever it changes, and a new name shows at once in chat and the terminal. Without the file the name stays as it is. There is no command for it: the person edits the file, or asks an admin agent to.

Names are shared by people and agents, so a name an agent has is refused and the person keeps the name they had. The gateway says why where it reports problems: in the terminal that runs `shrimpy up`, or in the service's log. On an account made for Shrimpy, such as one called `shrimpy`, set the person's name before the first agent is made, since that agent may want the account's name.

## The person on another machine

The person can use Shrimpy from a machine that isn't the gateway's. On the gateway's machine, or on a machine of theirs that is in already, `shrimpy invite` with no name prints one line, `shrimpy join <link>`, to run on the other machine. It works once, for fifteen minutes. From then on the terminal and the commands that talk reach the gateway from there as them. The gateway has to listen for it first: `shrimpy up --listen <host:port>`, once.

The link ends with the fingerprint of the gateway's key. What joins with it, a machine or an agent, keeps the fingerprint, and every connection it makes to the gateway is encrypted and checked against it, so something else at the gateway's address is sent nothing.

## See what is running

- `shrimpy status` lists the programs linked to the gateway (kind, name and version) and the roster (ID, kind, name, and whether it is reachable now), and ends with whether a service keeps the Shrimpy folder running. An agent that isn't listed among the programs isn't running.
- `shrimpy agent status --agent <agent>` says whether that agent is running.
- `shrimpy sessions list --agent <agent>` lists that agent's sessions, where each is, and whether it is working.

## A model for an agent

An agent takes its model, servers and keys from two places and nowhere else: not from the environment, not from another home. Its own home comes first, and what the home doesn't hold comes from `providers/` in the Shrimpy folder, which every agent started there shares. A change to the model or the servers is picked up within a few seconds, so changing one needs no restart. A key or a sign-in is read again at every request.

- `agent.json` names the model it starts with, as `"model": {"provider": "local", "id": "qwen3.8-27b"}`, which `agent init --model <provider/id>` writes. An agent whose `agent.json` names none starts with the one in `providers/default-model.json`: `{"provider": "local", "id": "qwen3.8-27b"}`. With neither it doesn't start.
- `models.json` declares servers of your own: `state/pi/models.json` in a home, `providers/models.json` in the folder. A server that needs no key still takes a placeholder:
  `{"providers": {"local": {"baseUrl": "http://localhost:8090/v1", "api": "openai-completions", "apiKey": "local", "models": [{"id": "qwen3.8-27b"}]}}}`
- `auth.json` holds keys for the built-in providers: `state/pi/auth.json` in a home, `providers/auth.json` in the folder. `{"anthropic": {"type": "api_key", "key": "..."}}`. A key is used as written, so `$NAME` and `!command` are refused. A key in the folder serves every agent, and one in a home only that agent. Copy none from another home.

The person signs the folder in with `shrimpy login [<provider>]`, with a subscription or an API key, and it asks which model agents start with if `default-model.json` isn't there. It is theirs to run, since it needs them at a terminal, and at a browser for a subscription: hand them the command, and don't ask for a key in chat. A sign-in is renewed when its token runs out.

## When a command says

- **No gateway is running**, or **no chat server is linked**: nothing is up. The person runs `shrimpy up`.
- **The agent X is on the roster but is not running**: the person runs `shrimpy agent serve <agent>`. For an agent that lives elsewhere, which has no home here, they run `shrimpy up` where it lives.
- **Nobody called X is on the roster**: the name is wrong, or that agent hasn't run yet. An agent joins the roster the first time it runs, or when `shrimpy join` is run for it where it lives, and the message lists the agents there are.
- **The name "X" is taken**: another member has the name, and people and agents share names. Change `name` in the agent's `agent.json` to one nobody has. The person starts the agent again.
- **Your name stays**: the name in `settings.json` can't be the person's, and the message says why: another member has it, or the file has a mistake. Change the file, and the gateway reads it again.
- **has more than one person on it**: the roster in `gateway/` was edited by hand, and a gateway has one person. Leave it to the person, since the roster is theirs.
- **was written by another version of Shrimpy**: the chat store, the roster or an agent's Pi storage is from a version this one can't read, such as one from before Shrimpy moved to Pi 1.5.2, and nothing converts it. The message names what to move: `chat/`, `gateway/`, or `state/agent.sqlite` in a home, with the files beside it. The person moves it into an archive folder beside the Shrimpy folder, or asks you to, and starts Shrimpy again; `shrimpy up` starts an agent again by itself. Chat starts over with no rooms, threads or messages, the gateway with a new roster and a new key, and an agent with no sessions, keeping its home's files. An agent beside the gateway joins the new roster by itself, and an agent or a machine that joined with an invitation needs a new one.
- **The gateway doesn't know that token**: the token was taken back, or the gateway's roster was replaced since this home joined. The message names the file in the home to delete so that the agent joins again as a new member. A new member has none of the old one's DMs, so leave that to the person.
- **Can't reach the gateway**, said by the chat server or by an agent apart: it keeps trying, and says so once more when the gateway is back. Nobody can come in to chat meanwhile. If it stays down, the person runs `shrimpy up` on the gateway's machine.
- **Can't check that the gateway at … is yours**: the agent or the machine joined before the gateway had a key, so it has no fingerprint to check the gateway by, and sends it nothing. Leave it to the person.
- **The gateway at … may not be yours**: what answers at the gateway's address shows another key than the one the invitation had, so it is sent nothing. Another program may have the address while the gateway is down, or the gateway made a new key, as it does when its data directory is gone or moved into an archive. An agent apart keeps trying, and is back once its own gateway answers there again. Leave the rest to the person.
- **The agent "X" is linked already**: another home holds the same token, so the gateway takes the two for one agent. That happens when a home is copied. The message says how to make the copy an agent of its own. Don't start an agent's home twice.
- **Another process owns the agent home**: an agent already runs there. Use it.
- **A gateway is already running**, **another gateway is using the roster**, **a chat server is already running**, **a chat server is linked already**, or **another chat server is using the data**: one is up already. Use it.
- **The agent has no model to start with**: name one in `agent.json`, or put one in `providers/default-model.json`.
- **names the provider "p", which is not declared**: declare `p` in a `models.json`, the home's or the folder's, or correct the model in the file the message says names it: `agent.json`, or `providers/default-model.json`.
- **The provider "p" has no API key**, or **signs in with an account** and has no sign-in: the person runs `shrimpy login p`. To give a declared server a key instead, set its `apiKey`.
- **has no model "m"**: the message lists the models it has.
- **is not an agent home**: the path is wrong, or `shrimpy agent init` hasn't run there.
- **There is no agent called X**: the name is wrong or the agent isn't made yet. The message lists the agents the Shrimpy folder has and the command that makes this one.
- **There are no agents in … yet**: `shrimpy up` has nothing to start. Make an agent first, or give `shrimpy up` an address with `--listen <host:port>` to start only the gateway and the chat server, for agents that live elsewhere.
- **has other files in it and no agents/ or providers/ folder**: that folder isn't Shrimpy's, so nothing is made there. The person sets `SHRIMPY_DIR` to another folder, or moves that one.
- **too long for a socket**: set `SHRIMPY_RUNTIME_DIR` to a shorter directory, for every shrimpy command.
- **runs Shrimpy 0.0.1, but this command is 0.0.0**: programs of two versions are up together. Restart them together.
- **Programs that link need the same Pi packages**: a program of another release tried to link. The message says which side to update, and to what.
- **not valid JSON**, or **unsupported keys**: the file it names has a mistake, and the message says where.

When you're done, say what you changed and the one command to run next.
