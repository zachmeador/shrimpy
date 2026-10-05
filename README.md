# 🦐 Shrimpy

This is Shrimpy, rebuilt on Pi's durable runtime. Old Shrimpy is in [`shrimpy-old/`](shrimpy-old/README.md) for reference until the release deletes it: nothing there is built, tested or edited.

- [`AGENTS.md`](AGENTS.md) has the rules for working here.
- [The redesign docs](docs/REDESIGN/README.md) own the design: how each piece works, what is built and what isn't.
- `shrimpy <command> --help` says what a command does.

## Check your work

```bash
npm install --ignore-scripts
```

```bash
npm run check
```

`check` runs the type check, lint and every test. Tests run straight from TypeScript with `node --test`, so there is no build step.

Six tests use a real model, and are skipped unless you point them at a server. `SHRIMPY_TEST_MODEL_URL` is the server's OpenAI-compatible base URL, ending in `/v1`, and `SHRIMPY_TEST_MODEL_ID` is its model ID. The server needs no key.

```bash
SHRIMPY_TEST_MODEL_URL=http://localhost:8090/v1 SHRIMPY_TEST_MODEL_ID=my-model npm test
```

## Run it

`npm run shrimpy -- <command>` runs the command line from source. For a `shrimpy` command that works from any directory, link `bin/shrimpy.js` into a directory on your PATH.

What you set up lives in one folder, `~/shrimpy`, or the folder the environment variable `SHRIMPY_DIR` names. While you work on Shrimpy, give every run a `SHRIMPY_DIR` and a `SHRIMPY_RUNTIME_DIR` of its own, so that nothing touches a setup in use.

```text
~/shrimpy/
  agents/<name>/    one home for each agent
  gateway/          the gateway's data: the roster of who is on the network
  chat/             the chat server's data
```

Make an agent. `agent init` says what to do next.

```bash
npm run shrimpy -- agent init scout --model local/qwen3.8-27b
```

The model is `provider/id`. A server of your own is declared in the home's `state/pi/models.json`, with the flags that server needs. A key for one of Pi's built-in providers goes in `state/pi/auth.json`.

```json
{
  "providers": {
    "local": {
      "baseUrl": "http://localhost:8090/v1",
      "api": "openai-completions",
      "apiKey": "local",
      "compat": { "supportsDeveloperRole": false, "supportsStore": false, "supportsReasoningEffort": false },
      "models": [{ "id": "qwen3.8-27b", "reasoning": true, "contextWindow": 262144, "maxTokens": 65536 }]
    }
  }
}
```

Start the gateway, the chat server and every agent in the folder. It runs in the foreground until Ctrl+C.

```bash
npm run shrimpy -- up
```

From another terminal, talk to an agent, or open the terminal client with no command at all.

```bash
npm run shrimpy -- run scout "what is in my inbox?"
npm run shrimpy -- threads scout
npm run shrimpy -- read th_4k9x2m7q0b3d
npm run shrimpy
```

## Commands

The table is written by `npm run readme` from the commands the CLI has, and a test fails when it is behind. `shrimpy <command> --help` says more about each.

<!-- commands:start -->
| Command | What it does |
|---|---|
| `up [<agent>...] [--data <dir>]` | Start what is missing on this machine and keep it running: the gateway, the chat server and your agents. |
| `run <agent> "<text>" [--thread <id>] [--no-wait]` | Say something to an agent and print its reply. |
| `threads <member\|#room> [--json]` | List your threads with a person or an agent, or in a room: ID, when last updated, who is working in it, and its name. |
| `read <thread> [--json]` | Show a thread: who said what and when, oldest first, with each message's ID. |
| `rooms` | List the rooms you are in, each with its members and when it was last updated. |
| `rooms new <name> [<member>...]` | Make a room, with you and the members you name in it. Takes an admin. |
| `rooms add <room> <member>...` | Add members to a room you are in. Takes an admin. |
| `agent init <agent> --model <provider/id> [--name <name>]` | Create an agent home. Files that already exist are left as they are. |
| `agent serve <agent> [--now]` | Run the agent in the foreground until it is told to stop. |
| `agent status [--agent <agent>]` | Say whether the agent is running, and how to reach it. |
| `agent reload [--agent <agent>]` | Make a running agent read its instructions, context files, skills and triggers again. |
| `agent context [--agent <agent>]` | Preview what an agent would be told, from its home's files as they are now. |
| `sessions list [--agent <agent>]` | List the sessions of a running agent: each one's name (a thread's ID, or trigger: and a trigger's name), the channel it is behind, if any, and whether it is working. |
| `sessions read <session> [--json] [--agent <agent>]` | Show a session: what was said, what the tools did, and what it is doing now. |
| `sessions steer <session> <text> [--request-id <id>] [--wait] [--agent <agent>]` | Give a session input; it joins work already running. |
| `sessions stop <session> [--agent <agent>]` | Stop the work in a session, and withdraw the input it has not picked up. |
| `triggers [--agent <agent>]` | List the triggers of an agent: each one's schedule, whether it is on, when it runs next and how its last occurrence ended. |
| `triggers add <name> (--every <delay> \| --cron "<fields>" [--timezone <zone>]) [--thread <id>] [--overlap allow] [--check "<command>" [--when changed\|output\|always] [--then wake] [--timeout <delay>]] "<prompt>" [--agent <agent>]` | Make a trigger, or replace the one of that name: a prompt the agent is given on a schedule. |
| `triggers show <name> [--agent <agent>]` | Show a trigger: what it says, when it runs next and its latest occurrences. |
| `triggers run <name> [--agent <agent>]` | Fire a trigger now, apart from its schedule, which it keeps. |
| `triggers on <name> [--agent <agent>]` | Turn a trigger on. |
| `triggers off <name> [--agent <agent>]` | Turn a trigger off, and keep it. |
| `triggers remove <name> [--agent <agent>]` | Delete a trigger. |
| `wake [<room> <policy>] [--agent <agent>]` | Choose what wakes an agent in a room, or list what is set. |
| `members` | List the roster: each member's kind, whether it is an admin, and whether a program is running as it. |
| `members promote <name>` | Make an agent an admin. |
| `members demote <name>` | Make an admin agent an ordinary agent again. |
| `gateway serve --data <dir> [--web-port <port>] [--web-dir <dir>]` | Run the gateway in the foreground until it is told to stop. |
| `gateway status` | List the programs registered with this machine's gateway, and the members on its roster. |
| `chat serve <data-dir>` | Run the chat server in the foreground until it is told to stop, registered with the gateway. |
<!-- commands:end -->

## The shape

`src/` is organized by program: `agent/`, `chat/`, `gateway/`, `clients/` and `cli/`. Programs never import each other. They share only `contracts/`, which carry Shrimpy's own shapes, and `lib/`. [The code's layout](docs/REDESIGN/design/code-layout.md) owns these rules and has the rest, and `lint/boundaries.js` enforces them, so a violation fails `npm run check`.

- A file imports files in its own directory, or another directory's front door: its `index.ts` or its `node.ts`. A directory's files stay closed to the directories inside it, so what both need gets a directory of its own. Every front door opens with a short comment saying what the module is for and what it must not know.
- A module whose API partly needs Node offers that part through `node.ts`, and a file behind that door that needs Node is named `*.node.ts`. A module that is Node-only throughout has `node.ts` as its only door.
- Browser-safe code can't import Node or a `node.ts` door. That is the web client and everything in `contracts/` and `lib/` apart from the files that need Node. Tests and `testing/` modules are never shipped and are exempt.
- Tests sit beside the code as `*.test.ts`. Test support lives in a `testing/` module that only tests import.
- Only `agent/` imports Pi's durable runtime, and inside it only a file named `*.durable.ts` or a module's `durable.ts` door. Between the agent's modules, imports point one way. Only `clients/console/draw/` imports `pi-tui`.
