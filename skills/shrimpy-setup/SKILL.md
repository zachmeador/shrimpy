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

By default all of it lives in the Shrimpy folder, `~/shrimpy` or the folder `SHRIMPY_DIR` names: `agents/` holds a home for each agent, beside `providers/`, `gateway/`, `chat/`, `context/` and the person's `settings.json`. `up` and `agent serve` take an agent by the name of its home there, like `scout` for `agents/scout`. A command about one agent takes `--agent` with its name on the roster, which reaches it through the gateway wherever it lives, or with the path of its home.

`shrimpy up` starts whichever of these is missing, with every agent in `agents/`, and stays in that terminal. Ctrl+C stops what it started. Anything already running is used as it is. An agent that ends is started again, after pauses that grow while it keeps failing. An agent that joined a gateway elsewhere with `shrimpy join` belongs to that gateway: where every agent in the folder does, `up` starts those agents and no gateway or chat server, and they are talked to from the gateway's machine.

`shrimpy install` keeps `shrimpy up` running as a service of the person's account, started again if it fails, and `shrimpy uninstall` removes it. They are the person's to run: installing again restarts everything, you included.

Programs reach each other through the gateway, so people and agents can talk only while it runs. An agent's own work does not need it, and its replies wait until it is back, but `up` stops everything it started when the gateway or the chat server ends. With the gateway down, `shrimpy sessions list`, `shrimpy sessions read <session>` and `shrimpy sessions stop <session>` still work for an agent asking about itself, and for a person who gives `--agent` the path of the agent's home, because they go straight to the home. A name is found through the gateway. From an agent's shell, a command about another agent goes through the gateway and takes an admin.

A program that won't start says why in the terminal that started it. Ask the person to paste it.

An agent beside the gateway runs under the person's own account, so it can do anything the person can: whatever runs under that account can read every token there. Shrimpy's roles keep it from doing so by accident, and nothing more. Tell the person so when you make an agent. One that should be walled off runs under an account of its own, in a container or on another machine, and comes in with an invitation, as below.

A person at a terminal sets a new machine up by running `shrimpy`. It signs the Shrimpy folder in, asks their name and the first agent's, installs the service and opens their DM with the agent. Run again after a failure, it picks up at the first step not done. From your shell the same setup is `shrimpy login`, as signing in from a shell below has it, then `shrimpy agent init <name>`, then `shrimpy install`. One agent that answers is a complete setup, and a second can wait until the person asks for it. On an account made for Shrimpy, set the person's name first, as below.

## Notes every agent is shown

The Markdown files in `context/` in the Shrimpy folder on the gateway's machine are the workspace context: every agent on the network is shown them in every conversation, wherever it runs. Put there what every agent should know, such as who the person is and what they're working on, and keep it short, since every request carries it. What only one agent needs goes in that agent's own `context/`. A change reaches every running agent within a few seconds, with nothing to run.

Each agent keeps a copy in its home's `state/workspace-context/`, so it has the notes while the gateway is down. Don't edit the copy: the agent replaces it at each change. A machine that joined with `shrimpy join` has a Shrimpy folder of its own, and nothing reads that folder's `context/`.

## The person's name

A gateway has one person, who starts with the name of the OS account the gateway first ran as. From then on the name is a setting, in `settings.json` in the Shrimpy folder on the gateway's machine: `{"name": "zach"}`. The gateway reads the file when it starts and whenever it changes, and a new name shows at once in chat and the terminal. Without the file the name stays as it is. There is no command for it: the person edits the file, or asks an admin agent to.

Names are shared by people and agents, so a name an agent has is refused and the person keeps the name they had. The gateway says why where it reports problems: in the terminal that runs `shrimpy up`, or in the service's log. On an account made for Shrimpy, such as one called `shrimpy`, set the person's name before the first agent is made, since that agent may want the account's name.

## The person on another machine

The person can use Shrimpy from a machine that isn't the gateway's. On the gateway's machine, or on a machine of theirs that is in already, `shrimpy invite` with no name prints one line, `shrimpy join <link>`, to run on the other machine. It works once, for fifteen minutes. From then on the terminal and the commands that talk reach the gateway from there as them. The gateway has to listen for it first: `shrimpy up --listen <host:port>`, once.

The link ends with the fingerprint of the gateway's key. What joins with it, a machine or an agent, keeps the fingerprint, and every connection it makes to the gateway is encrypted and checked against it, so something else at the gateway's address is sent nothing.

## The person in a browser

The gateway serves a web client: a page for talking to agents and watching their work. `shrimpy invite` with no name also prints a link to open in a browser. Opening it lets that browser in as a device of the person. It works once, for fifteen minutes.

With nothing set, the page is at `http://127.0.0.1:7448/`, and only a browser on the gateway's machine reaches it. A phone or another machine needs the page served over HTTPS. `page` in `settings.json` in the Shrimpy folder says where the page's door listens and names a certificate's two files, and is read when Shrimpy starts:

```json
{ "page": { "listen": "<host>:7448", "certificate": "<certificate file>", "key": "<key file>" } }
```

The browser has to trust the certificate. `shrimpy gateway serve --help` says more. The person takes a browser back with `/devices take back`, written in a thread.

## See what is running

- `shrimpy status` lists the gateway and the programs linked to it (kind, name and version) and the roster (ID, kind, name, whether it is reachable now, and the account and machine each agent last linked from), and ends with whether a service keeps the Shrimpy folder running. An agent that isn't listed among the programs isn't running.
- `shrimpy agent status --agent <agent>` says whether that agent is running, and the machine and home it last linked from.
- `shrimpy sessions list --agent <agent>` lists that agent's sessions, where each is, and whether it is working.

## A model for an agent

An agent takes its model, servers and keys from two places and nowhere else: not from the environment, not from another home. Its own home comes first, and what the home doesn't hold comes from `providers/` in the Shrimpy folder, which every agent started there shares. A change to the model or the servers is picked up within a few seconds, so changing one needs no restart. A key or a sign-in is read again at every request.

- `agent.json` names the model it starts with, as `"model": {"provider": "local", "id": "qwen3.8-27b"}`, which `agent init --model <provider/id>` writes. An agent whose `agent.json` names none starts with the one in `providers/default-model.json`: `{"provider": "local", "id": "qwen3.8-27b"}`. With neither it doesn't start.
- `models.json` declares servers of your own: `state/pi/models.json` in a home, `providers/models.json` in the folder. A server that needs no key still takes a placeholder. A model that takes pictures needs `"input": ["text", "image"]`, or the agent is sent a note in place of each picture:
  `{"providers": {"local": {"baseUrl": "http://localhost:8090/v1", "api": "openai-completions", "apiKey": "local", "models": [{"id": "qwen3.8-27b", "input": ["text", "image"]}]}}}`
- `auth.json` holds keys for the built-in providers: `state/pi/auth.json` in a home, `providers/auth.json` in the folder. `{"anthropic": {"type": "api_key", "key": "..."}}`. A key is used as written, so `$NAME` and `!command` are refused. A key in the folder serves every agent, and one in a home only that agent. Copy none from another home.

The folder is signed in with `shrimpy login [<provider>]`, with a subscription or an API key, and it asks which model agents start with if `default-model.json` isn't there. A sign-in is renewed when its token runs out.

## Signing in from a shell

A subscription needs the person at a browser, which can be on any machine. `shrimpy login` reads its answers from standard input, so you can run it for them and pass on what it asks:

1. Make a folder only you can open with `mktemp -d`, and start the sign-in in the background, reading its answers from a file there. Give it the provider the person named, or none to list the subscriptions it offers:
   ```bash
   touch <folder>/answers
   tail -f <folder>/answers | shrimpy login [<provider>] > <folder>/output 2>&1 &
   ```
2. Read `<folder>/output`, and answer each question it asks with a line added to the answers: `printf '%s\n' '<answer>' >> <folder>/answers`. Ask the person where the choice is theirs, such as the provider and the model agents start with.
3. Give them the link and the instructions it prints. When it asks for a code or the address the browser ended on, have them paste it into the chat, and add it to the answers the same way.
4. When it says the folder is signed in, or that nothing was, stop the `tail`, which ends `shrimpy login` too, and remove the folder.

If it asks for an API key, stop it the same way. A key is the person's to type into `shrimpy login` at a terminal, since pasted into the chat it would reach your own model provider. Hand them the command.

## When a command says

- **No gateway is running**, or **no chat server is linked**: nothing is up. The person runs `shrimpy up`.
- **The agent X is on the roster but is not running**: the person runs `shrimpy agent serve <agent>`. For an agent that lives elsewhere, which has no home here, they run `shrimpy up` where it lives.
- **Nobody called X is on the roster**: the name is wrong, or that agent hasn't run yet. An agent joins the roster the first time it runs, or when `shrimpy join` is run for it where it lives, and the message lists the agents there are.
- **The name "X" is taken**: another member has the name, and people and agents share names. Change `name` in the agent's `agent.json` to one nobody has. The person starts the agent again.
- **Your name stays**: the name in `settings.json` can't be the person's, and the message says why: another member has it, or the file has a mistake. Change the file, and the gateway reads it again.
- **has more than one person on it**: the roster in `gateway/` was edited by hand, and a gateway has one person. Leave it to the person, since the roster is theirs.
- **was written by another version of Shrimpy**: the chat store, the roster or an agent's Pi storage is from a version this one can't read, such as one from before Shrimpy moved to Pi 1.5.2, and nothing converts it. The message names what to move: `chat/`, `gateway/`, or `state/agent.sqlite` in a home, with the files beside it. The person moves it into an archive folder beside the Shrimpy folder, or asks you to, and starts Shrimpy again; `shrimpy up` starts an agent again by itself. Chat starts over with no rooms, threads or messages, the gateway with a new roster and a new key, and an agent with no sessions, keeping its home's files. An agent beside the gateway joins the new roster by itself, and an agent or a machine that joined with an invitation needs a new one.
- **The agent's records in … could not be read**: something other than a version is wrong with the agent's Pi storage, such as damage or a bug, and the message says what the engine said. Don't move or delete the storage, since every session of the agent is in it. Tell the person.
- **The gateway doesn't know that token**: the token was taken back, or the gateway's roster was replaced since this home joined. For an agent apart, an admin makes a new invitation with `shrimpy invite <name>` and runs its `shrimpy join <link>` line where the agent lives to replace its token. For an agent beside the gateway, deleting the file the message names lets it make a new token, which reclaims its entry if its token was taken back. Leave that to the person.
- **The agent … was removed from the roster**: an admin removed it, so it stopped and doesn't start again. It comes back as a new member: apart from the gateway with a new invitation and its `shrimpy join <link>` line, and beside it by deleting the file the message names. Leave that to the person, who may want it gone.
- **Can't reach the gateway**, said by the chat server or by an agent apart: it keeps trying, and says so once more when the gateway is back. Nobody can come in to chat meanwhile. If it stays down, the person runs `shrimpy up` on the gateway's machine.
- **The gateway at … may not be yours**: what answers at the gateway's address shows another key than the one the invitation had, so it is sent nothing. Another program may have the address while the gateway is down, or the gateway made a new key, as it does when its data directory is gone or moved into an archive. An agent apart keeps trying, and is back once its own gateway answers there again. If the gateway's key changed on purpose, an admin makes a new invitation with `shrimpy invite <name>` and runs its `shrimpy join <link>` line where the agent lives, which gives the home the gateway's current key and replaces its token. Leave the rest to the person.
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
- **The runtime directory … is a symbolic link**, **is not a directory** or **belongs to another account**, or **Other accounts can open the runtime directory**: Shrimpy keeps its sockets only in a directory that no other account can open. Do what the message says: make the directory private with `chmod 700`, remove what is in the way, or set `SHRIMPY_RUNTIME_DIR` to a directory only the person can open, for every shrimpy command. A directory that belongs to another account was made by someone else, so tell the person.
- **runs Shrimpy 0.0.1, but this command is 0.0.0**: programs of two versions are up together. Restart them together.
- **Programs that link need the same Pi packages**: a program of another release tried to link. The message says which side to update, and to what.
- **not valid JSON**, **unsupported keys** or **is required**: the file it names has a mistake, and the message says where.

When you're done, say what you changed and the one command to run next.
