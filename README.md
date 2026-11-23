<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dusk.svg">
    <img alt="🦐 Shrimpy" src="docs/assets/banner-day.svg" width="800">
  </picture>
</h1>

Shrimpy is a system for running your own agents, on your own machines.

Each agent has a home: a folder of plain files on the machine it lives on. It stays running there, with a shell, skills, and jobs it does on a schedule. A gateway joins your agents into one network, across as many machines as you have. They work with each other and with you in DMs and rooms, and you reach all of them from a terminal or your phone.

You don't need to learn its commands. When you want another agent, or one on a new machine, you ask an agent you already have.

## Install

Ask your coding agent, whichever you use:

> Install Shrimpy from https://github.com/zachmeador/shrimpy

Or run the installer yourself:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
```

Then `shrimpy` opens the terminal client. There is a web client too, which installs on your phone.

<details>
<summary>For the agent doing the install</summary>

Shrimpy needs Node 22.19 or later and git, on macOS or Linux, and runs from a checkout.

1. Clone this repository somewhere that will stay. Not `~/shrimpy`: that folder is where Shrimpy keeps what gets set up.
2. In the checkout, run `npm install --ignore-scripts`.
3. Link `bin/shrimpy.js` into a directory on the PATH, as `shrimpy`.
4. Follow [the setup skill](skills/shrimpy-setup/SKILL.md) from there. Signing in to a model provider needs the person, so hand them that command.

</details>

## An agent is a folder

```text
~/shrimpy/agents/scout/
  SOUL.md        who it is
  context/       notes it sees in every conversation
  skills/        what it knows how to do, in Markdown
  vault/         longer notes it reads when it needs them
  triggers/      jobs on a schedule
  sigil          its face, twelve lines of twelve
  agent.json     its name, model and color
  state/         its sessions and its token
```

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/sigils-dusk.svg">
    <img alt="Ten sigils: small creatures and emblems, each twelve pixels square" src="docs/assets/sigils-day.svg" width="800">
  </picture>
</p>

Edit a file and the agent picks it up a few seconds later. You can open any session of any agent and watch it work, including two agents talking to each other.

## How it's built

- `src/` has a folder for each program: the agent, the chat server and the gateway, plus the clients and the CLI. The three programs never import each other. They talk through the contracts in `src/contracts/`, and a lint fails the check when a file reaches past another module's `index.ts`.
- What you edit is Markdown and JSON. Sessions and messages are in SQLite, through Node's built-in `node:sqlite`, so there is no database server to run.
- Each agent runs on [Pi](https://github.com/earendil-works/pi), an open-source agent harness. Pi saves an agent's work as it goes, so an agent that is stopped or crashes picks up where it was. Its packages are pinned to one release.
- Every program connects out to the gateway and keeps that link open. Nothing has to listen where an agent lives, which is what lets one run on another machine, in a container or under its own account.
- A scheduled job can run a command first and call the model only when the output has changed.
- There are twelve runtime dependencies and no build step. Node runs the TypeScript directly.
- An agent has a real shell and runs as whoever started it. Shrimpy doesn't sandbox it. To wall one off, run it under its own account, in a container or on another machine.

## Working on Shrimpy

```bash
npm run check
```

That runs the type check, the lint and every test. One test talks to a real model, and is skipped unless `SHRIMPY_TEST_MODEL_URL` and `SHRIMPY_TEST_MODEL_ID` name a server. Give every run its own `SHRIMPY_DIR` and `SHRIMPY_RUNTIME_DIR`, so it never touches a setup in use.

[How Shrimpy is built](docs/how-it-is-built.md) is the page to read before the code, [`AGENTS.md`](AGENTS.md) has the rules for working here, and [the design](docs/REDESIGN/README.md) has a file for each piece. Shrimpy is [MIT licensed](LICENSE).

## Commands

These are for agents and scripts. `shrimpy <command> --help` says more about each.

<details>
<summary>The whole list</summary>

<!-- commands:start -->
| Command | What it does |
|---|---|
| `up [<agent>...] [--data <dir>] [--listen <host:port>]...` | Start what is missing on this machine and keep it running: the gateway, the chat server and your agents. |
| `status` | List the programs linked to this machine's gateway, and the members on its roster. |
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
