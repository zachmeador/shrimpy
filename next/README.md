# 🦐 Shrimpy, rebuilt

This is the new Shrimpy, built on Pi's durable runtime. It lives here until it replaces `src/`. The [replacement plan](../docs/REDESIGN/PLAN.md) owns the design, and its "Target source layout" section owns the rules below.

## Stay aligned with the plan

Build what the plan says. If the plan is wrong, unclear or silent, or the code can't follow it, stop and raise it with the user and the agent coordinating the build. Don't settle it quietly in the code: that is how slop piles up. Any visible choice you make that the plan doesn't cover goes in your report, so it can be reviewed.

## Check your work

```bash
npm install --ignore-scripts
```

```bash
npm run check
```

`check` runs the type check, lint and every test. Tests run straight from TypeScript with `node --test`, so there is no build step. Nothing here touches the root `dist/` that the installed `shrimpy` uses.

Five tests use a real model, and are skipped unless you point them at a server. They ask the agent in a thread to run a command with the shell tool, to stay silent with `END` when told to say nothing and to answer otherwise, to stay silent when a conversation has plainly ended, to say it has started with `send_message` before it replies, and to look back with `read_messages`. `SHRIMPY_TEST_MODEL_URL` is the server's OpenAI-compatible base URL, ending in `/v1`, and `SHRIMPY_TEST_MODEL_ID` is its model ID. The server needs no key.

```bash
SHRIMPY_TEST_MODEL_URL=http://localhost:8090/v1 SHRIMPY_TEST_MODEL_ID=my-model npm test
```

## Run an agent

`npm run shrimpy -- <command>` runs the command line from source. For a `shrimpy` command that works from any directory, link `bin/shrimpy.js` into a directory on your PATH. Each agent is a home folder, and `agent init` creates one. It never overwrites a file that exists.

```bash
npm run shrimpy -- agent init ~/agents/scout --name scout --model local/qwen3.8-27b
```

```text
agent.json            the agent's name and its default model
SOUL.md               its own instructions
context/              Markdown notes, shown to the agent in every conversation
skills/               one folder for each skill, with a SKILL.md in it
vault/                longer notes the agent reads when it needs them
state/pi/models.json  providers you declare, with their models
state/pi/auth.json    API keys, by provider
state/agent.sqlite    the engine's storage, made by the first start
runtime/              the owner lock, the endpoint and sockets
```

The default model is `provider/id`. Its provider is either one of Pi's built-in providers, with a key in `auth.json`, or one that `models.json` declares. A server of your own is declared like this, and the flags in it are the ones that server needs:

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

A server that needs no key still takes a placeholder, so `apiKey` is set. A key in `auth.json` is `{ "anthropic": { "type": "api_key", "key": "..." } }`. Keys are used as written and are only read from these two files: the environment is not consulted, and `!command` or `$NAME` values are refused.

## What an agent is told

Every session gets the same four sections of instructions, in this order: what every Shrimpy agent is told (how its reply works, what `END` does, the message tools and the home), `SOUL.md`, the Markdown files of `context/` and the folders under it, and the skills of `skills/`, each as its name, a one-line description and where its `SKILL.md` is. A skill's text is not loaded; the agent reads it when the task calls for it. A section with nothing in it is left out.

The files are read when the agent starts and when it is told to `reload`, and never in between: editing one changes nothing for a running agent until then. Each session uses the change with its next request, and what it already holds is not rewritten. A file that can't be read, or a skill whose `SKILL.md` has no front matter with a description, is left out and named, and the rest is read. Facts about one message travel with it and are not part of the instructions: the thread and channel it is in, who wrote it and when, and any earlier messages in the thread the agent hasn't acted on.

The agent has two tools for chat. `send_message` posts a message now, without ending the turn: to the thread the turn came from, or to `@name` for its DM with that member. `read_messages` reads a thread the same way. A turn's final text is still its reply, so `send_message` is for telling someone something before the turn ends, or somewhere else. The tools use the connection to chat that the agent already has. With chat unreachable they say so and don't wait, and a text too long for one message is posted in parts.

## Talk to an agent

`up` starts what is missing on this machine and keeps it running in the foreground: the gateway, the chat server with its store in the data directory, and the agent at each home. The data directory is required, so nothing lands near a live workspace.

```bash
npm run shrimpy -- up ~/agents/scout --data ~/shrimpy-data
```

From another terminal, `run` says something to the agent and prints its reply. The new thread's ID goes to standard error, so a script that reads standard output gets only the reply, and `--thread` continues the thread.

```bash
npm run shrimpy -- run scout "what is in my inbox?"
npm run shrimpy -- run scout "and from today?" --thread th_4k9x2m7q0b3d
npm run shrimpy -- threads scout
npm run shrimpy -- read th_4k9x2m7q0b3d
```

## The terminal

`shrimpy` with no command, at a terminal, opens the console. It asks this machine's gateway what is running, and shows the agents. With one agent it goes straight to that agent's threads. Pick a thread, or start one with `n`, and talk: what you type goes to the thread, so `run`, `read` and every other client see it too, and what the agent and others say appears as it arrives. While the agent works in the open thread, its answer, thinking and tool calls stream below the conversation, apart from it. When the turn settles, the reply is a message like any other.

It is a client of the chat server and of agents, and nothing more. Anything it can't reach is named on screen with what to start, and it keeps trying; what you typed stays in the editor.

| Key | What it does |
|---|---|
| `↑` `↓`, Enter | Choose and open an agent or a thread. |
| `n` | In the threads of an agent: start a thread. |
| Esc | In the threads of an agent: go back to the agents. In a thread: stop the agent's work in this thread, for everyone. |
| Enter | In a thread: send what you typed. Shift+Enter or Ctrl+J starts a new line. |
| Ctrl+T, Ctrl+N | In a thread: go to the threads, or start a thread. |
| Ctrl+C | Clears what you typed. Pressed again with nothing typed, it quits. |

Quitting stops no work. If the agent is still working, one line says so and how to stop it. With nothing running at a terminal, `shrimpy` shows what to start and picks everything up once it is running. Anywhere but a terminal, `shrimpy` with no command lists the commands and exits 2, as `shrimpy help` does with 0.

## Commands

| Command | What it does |
|---|---|
| `up <home>... --data <dir>` | Starts what is missing: the gateway, the chat server with its store in the data directory, and an agent at each home. Each runs as a process of its own. One that is already running is used as it is and left running when this stops. It stays in the foreground, and says what is running and how to reach it. |
| `run <agent> "<text>" [--thread <id>] [--no-wait]` | Posts the text to the agent in your DM, to a new thread unless `--thread` names one, waits for the agent's receipt on it, and prints the reply. `--no-wait` exits once the message is posted and prints its IDs. |
| `threads <agent> [--json]` | Lists your threads with the agent: ID, when last updated, who is working in it, and its name or first message. |
| `read <thread> [--json]` | Shows a thread: who said what and when, and where an agent failed, stopped or skipped a message. `--json` prints the thread and every message with all its receipts. |
| `agent init <home> --name <name> --model <provider/id>` | Creates the home. |
| `agent serve <home> [--now]` | Runs the agent in the foreground, which is what a supervisor or sandbox runs. It prints one JSON line when it is listening. |
| `agent status <home>` | Prints whether an agent is running there and how to reach it. Exits 1 if none is. |
| `agent reload <home>` | Makes the agent running there read `SOUL.md`, `context/` and `skills/` again. Each session uses the change with its next request. Files it couldn't use are named. |
| `agent context <home>` | Prints what an agent at the home would be told if it started now, read from the files and labelled as a preview. It starts nothing, and works while an agent runs there. A running agent has what it read when it started or last reloaded. |
| `sessions list <home>` | Lists the agent's sessions: the thread and channel each is behind, and whether it is working. |
| `sessions read <home> <thread> [--json]` | Shows the session behind a thread. |
| `sessions steer <home> <thread> <text> [--request-id <id>] [--wait]` | Gives that session input. A retry with the same request ID is the same input. |
| `sessions stop <home> <thread>` | Stops that session's work and withdraws the input it had not picked up. The agent keeps running. |
| `gateway serve [--web-port <port>] [--web-dir <dir>]` | Runs the gateway in the foreground. It prints one JSON line when it is listening. The browser entry opens on loopback only when a port is given, and 0 picks a free one. `--web-dir` serves the web client's files from a directory. |
| `gateway status` | Lists the programs registered with this machine's gateway: kind, name, version and pid. A version that differs from the command's own is marked, and so is the gateway's, on standard error. Exits 1 if no gateway is running. |
| `chat serve <data-dir>` | Runs the chat server in the foreground, with its store in the data directory, and registers it with the gateway. It prints one JSON line when it is listening. |

An agent has one session for each thread it takes part in, named by the thread's ID, and no session until a message arrives in a thread. `agent serve` registers the agent with this machine's gateway, finds the chat server through the gateway's list, and joins chat as the agent its `agent.json` names. It starts, and its sessions work, with no gateway or chat server running; it finds them when they come up and again after they go away. A message addressed to the agent, which in a DM is every message from the other member, becomes a turn in the session for its thread, and the turn's final text is posted to the thread as the reply. A final text of `END`, or nothing, posts nothing. The agent leaves a receipt on each message when its turn ends.

`agent serve` stops on SIGTERM or Ctrl+C. It stops taking input, gives running turns up to five seconds to finish, then closes. Work that did not finish resumes at the next start. `--now`, or a second signal during the wait, skips the wait.

`gateway serve` and `chat serve` stop on SIGTERM or Ctrl+C too, and exit 0, and stopping does not wait for a gateway that has stopped answering. A second gateway on a machine, or a second chat server, is refused with its own message and exit code 1. The chat server takes the socket's lock before it touches its data directory, so one that is refused leaves nothing behind; the store's own lock refuses a second chat server that reaches the same data directory through a different runtime directory. A chat server works the same with no gateway running: it registers when it finds one, and again each time the gateway comes back. The line it prints says it is listening, not that it has registered. A runtime directory too long for a socket path, 104 bytes, is refused with a message that says what to shorten.

`up` stops on SIGTERM or Ctrl+C: agents first, then the chat server, then the gateway, and it exits 0 once they have stopped. A second request tells the agents to stop without waiting for running turns, and a third ends everything at once. A program that `up` started and that ends by itself makes `up` say which one, stop the rest and exit 1. Each line a program prints is passed on with its name in front. When everything is already running, `up` says so and exits 0.

In chat you are `person:<your operating system username>`. `run` waits for the agent's receipt on your message, read from the thread. It prints the reply on standard output and exits 0 when the agent answered. A silent agent prints nothing and exits 0. A failure prints its reason on standard error and exits 1. Stopped or skipped work says so on standard error and exits 130. Stopping `run` while it waits leaves the message and the agent's work alone, and exits 130. It posts nothing, and says what to start, when no gateway, chat server or agent of that name is running. `read` leaves out silent receipts, which are recorded but shown to nobody by default.

A gateway, chat server or agent of another version than the command is named on standard error by `gateway status`, `up`, `run`, `threads` and `read`, and the command carries on.

`sessions steer --wait` prints the answer, then exits 0 when the input was answered, 130 when it was cancelled, and 1 when it failed or ended without an answer. Any command exits 2 when it is used wrongly. The session commands talk to the running agent and never open the home's storage.

## The shape

`src/` is organized by program: `agent/`, `chat/`, `gateway/`, `clients/` and `cli/`. Programs never import each other. They share only `contracts/`, which carry Shrimpy's own shapes, and `lib/`.

- A file imports files in its own directory, or another directory's front door: its `index.ts` or its `node.ts`. A directory's files stay closed to the directories inside it, so what both need gets a directory of its own. Every front door opens with a short comment saying what the module is for and what it must not know.
- A module whose API partly needs Node offers that part through `node.ts`, and a file behind that door that needs Node is named `*.node.ts`. A module that is Node-only throughout has `node.ts` as its only door.
- Browser-safe code can't import Node or a `node.ts` door. That is the web client and everything in `contracts/` and `lib/` apart from the files that need Node, so a `lib/` module's `index.ts` door and everything behind it is browser-safe. Tests and `testing/` modules, `lib/testing` among them, are never shipped and are exempt.
- Tests sit beside the code as `*.test.ts`. Test support lives in a `testing/` module that only tests import.
- Only `agent/` imports Pi's durable runtime. Inside it, only `host/`, `sessions/` and `extensions/` do, and the code that takes messages in (`intake/`) sees nothing of it: it works with Shrimpy's own types and a `Turns` it is handed. `agent/sessions/` is the one place that reads Pi's records, and it writes Shrimpy's own documents (which thread a session belongs to, the outbox, the feed cursor) in the same commits as the work they belong to.
- The agent reaches the gateway and the chat server through `agent/links/`, which is handed how to reach each, so nothing there assumes either is on this machine. The defaults reach both over their Unix sockets.
- The console works the same way: `clients/console/network/` is its links, each handed a transport, `state/` is what it knows and does, `screen/` is what it shows as plain text and facts, with every sentence in `words.ts` and everything foreign made harmless for a terminal, and `draw/` is the only code that imports `pi-tui`. The lint keeps the other three free of it.

`lint/boundaries.js` enforces these rules, so a violation fails `npm run check`.

No shortcut reaches a commit: a module's front door, tests and lint coverage exist before its first commit.
