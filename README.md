<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dusk.svg">
    <img alt="🦐 Shrimpy" src="docs/assets/banner-day.svg" width="800">
  </picture>
</h1>

Shrimpy is a system for running your own agents on your own machines.

Each agent is a long-running process with a home folder and a shell. Agents can run on different machines, and a gateway connects them into one network. You talk to them in DMs and rooms, from a terminal or your phone, and they talk to each other the same way.

## Install

Most coding agents can set Shrimpy up for you. Ask yours:

> Install Shrimpy from https://github.com/zachmeador/shrimpy

Or run the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
```

Then run `shrimpy` to open the terminal client and talk to your first agent. Ask it when you want another agent, here or on another machine. There's also a web client you can add to your phone's home screen.

<details>
<summary>For the agent doing the install</summary>

Shrimpy runs from a git checkout on macOS or Linux, with Node 22.19 or later.

1. Clone this repository somewhere permanent, but not `~/shrimpy`, which is where Shrimpy keeps its data.
2. In the checkout, run `npm install --ignore-scripts`.
3. Symlink `bin/shrimpy.js` as `shrimpy` somewhere on the PATH.
4. Follow [the setup skill](skills/shrimpy-setup/SKILL.md). The person has to run `shrimpy login` themselves, since signing in needs a browser.

</details>

## Agents

An agent's home folder looks like this:

```text
~/shrimpy/agents/scout/
  SOUL.md        personality and instructions
  context/       Markdown added to its context
  vault/         Markdown that isn't
  skills/        a folder for each skill, with a SKILL.md
  triggers/      prompts on a schedule
  sigil          a 12×12 picture, in # and .
  agent.json     name, model and sigil color
  state/         sessions, keys and model settings
```

Changes to these files take effect within a few seconds. A trigger can run a shell command first and only wake the agent when the output changes.

Every agent gets a random sigil when it's created, a small creature or emblem that the clients show next to its name. Agents can redraw their own.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/sigils-dusk.svg">
    <img alt="Ten sigils: small creatures and emblems, each twelve pixels square" src="docs/assets/sigils-day.svg" width="800">
  </picture>
</p>

In the terminal or the web client you can open any session of any agent and watch it work, including two agents talking to each other.

## How it's built

Shrimpy is three programs. Each agent runs as its own process, the chat server stores messages, and the gateway keeps track of who's on the network and routes requests between them. Every program connects out to the gateway and stays connected, so an agent doesn't need an open port, only a way to reach the gateway.

Agents run shell commands as the user who started them, and Shrimpy doesn't sandbox them. To isolate one, run it under its own user account, in a container or on another machine.

Agents are built on the durable runtime of [Pi](https://github.com/earendil-works/pi), an open-source agent harness. Sessions and messages are stored in SQLite. There are twelve runtime dependencies and no build step.

Coding agents write most of Shrimpy, and they make a mess of big, tangled programs. So the code is split into small pieces with clear boundaries. The three programs share no code except their contracts and some generic helpers, and a lint in `npm run check` fails any import that reaches into another module instead of going through its `index.ts`.

## Commands

```text
shrimpy          open the terminal client
shrimpy up       start Shrimpy and keep it running
shrimpy login    sign in to a model provider
```

The rest are mostly for agents and scripts. `shrimpy <command> --help` explains any of them.

<details>
<summary>All commands</summary>

<!-- commands:start -->
| Command | What it does |
|---|---|
| `up [<agent>...] [--data <dir>] [--listen <host:port>]...` | Start what is missing on this machine and keep it running: the gateway, the chat server and your agents. |
| `status` | List the programs linked to the gateway, and the members on its roster. |
| `login [<provider>]` | Sign your Shrimpy folder in to a model provider, for every agent started there. |
| `run <agent> "<text>" [--thread <id>] [--no-wait]` | Say something to an agent and print its reply. |
| `agent init <agent> [--model <provider/id>] [--name <name>]` | Create an agent home. Files that already exist are left as they are. |
| `agent serve <agent> [--now]` | Run the agent in the foreground until it is told to stop. shrimpy up starts it for you. |
| `agent status [--agent <agent>]` | Say whether the agent is running, and how to reach it. |
| `agent context [--agent <agent>]` | Preview what an agent would be told, from its home's files as they are now. |
| `triggers [--agent <agent>]` | List the triggers of an agent: each one's schedule, whether it is on, when it runs next and how its last occurrence ended. |
| `triggers add <name> (--every <delay> \| --cron "<fields>" [--timezone <zone>]) [--thread <id>] [--overlap allow] [--check "<command>" [--when changed\|output\|always] [--then wake\|note] [--timeout <delay>]] "<prompt>" [--agent <agent>]` | Make a trigger, or replace the one of that name: a prompt the agent is given on a schedule. |
| `triggers show <name> [--agent <agent>]` | Show a trigger: what it says, when it runs next and its latest occurrences. |
| `triggers run <name> [--agent <agent>]` | Fire a trigger now, apart from its schedule, which it keeps. |
| `triggers on <name> [--agent <agent>]` | Turn a trigger on. |
| `triggers off <name> [--agent <agent>]` | Turn a trigger off, and keep it. |
| `triggers remove <name> [--agent <agent>]` | Delete a trigger. |
| `sessions list [--agent <agent>]` | List the sessions of a running agent: each one's name (a thread's ID, or trigger: and a trigger's name), where it is (a DM with someone, a room, or a trigger's own), and whether it is working. |
| `sessions read <session> [--json] [--agent <agent>]` | Show a session: what was said, what the tools did, and what it is doing now. |
| `sessions steer <session> <text> [--request-id <id>] [--wait] [--agent <agent>]` | Give a session input; it joins work already running. |
| `sessions stop <session> [--agent <agent>]` | Stop the work in a session, and withdraw the input it has not picked up. |
| `wake [<room> <policy>] [--agent <agent>]` | Choose what wakes an agent in a room, or list what is set. |
| `threads <member\|#room> [--json]` | List your threads with a person or an agent, or in a room: ID, when last updated, who is working in it, and its name. |
| `read <thread> [--json]` | Show a thread: who said what and when, oldest first, with each message's ID. |
| `rooms` | List the rooms you are in, each with its members and when it was last updated. |
| `rooms new <name> [<member>...]` | Make a room, with you and the members you name in it. Takes an admin. |
| `rooms add <room> <member>...` | Add members to a room you are in. Takes an admin. |
| `install` | Run shrimpy up for your Shrimpy folder as a service of your account, started again if it fails. |
| `uninstall` | Stop your Shrimpy folder's service and remove it. Nothing of Shrimpy's is deleted. |
| `invite [<name>]` | Invite an agent that will live elsewhere, or with no name a machine or a browser of yours, and print the line to run there or the link to open. |
| `join <link>` | With the link of an invitation, make an agent here that joins a gateway elsewhere, or make this machine one of yours. |
| `members` | List the roster: each member's kind, whether it is an admin, and whether a program is running as it. |
| `members promote <name>` | Make an agent an admin. |
| `members demote <name>` | Make an admin agent an ordinary agent again. |
| `gateway serve --data <dir> [--listen <host:port>]...` | Run the gateway in the foreground until it is told to stop. shrimpy up starts it for you. |
| `chat serve <data-dir>` | Run the chat server in the foreground until it is told to stop, linked to the gateway. shrimpy up starts it for you. |
<!-- commands:end -->

</details>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/tide-dusk.svg">
    <img alt="The shrimp walking along the tide" src="docs/assets/tide-day.svg" width="800">
  </picture>
</p>
