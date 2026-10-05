# 🦐 Shrimpy

This is Shrimpy, rebuilt on Pi's durable runtime. Old Shrimpy is in [`shrimpy-old/`](shrimpy-old/README.md) for reference until the release deletes it: nothing there is built, tested or edited. The [replacement plan](docs/REDESIGN/PLAN.md) owns the design, and its "Target source layout" section owns the rules below.

## Stay aligned with the plan

Build what the plan says. If the plan is wrong, unclear or silent, or the code can't follow it, stop and raise it with the user and the agent coordinating the build. Don't settle it quietly in the code: that is how slop piles up. Any visible choice you make that the plan doesn't cover goes in your report, so it can be reviewed.

## Check your work

```bash
npm install --ignore-scripts
```

```bash
npm run check
```

`check` runs the type check, lint and every test. Tests run straight from TypeScript with `node --test`, so there is no build step.

A test earns its place by protecting something that would be missed: a seam between programs, starting, stopping, crashing and recovering, a promise the plan makes, or a bug that was actually seen. Don't pin wording or an internal shape, don't test test support or trivial helpers, and prefer one test through the real path to several on its pieces. When a change breaks a test that only recorded how things were, delete the test and keep the change.

Six tests use a real model, and are skipped unless you point them at a server. They ask the agent in a thread to run a command with the shell tool, to stay silent with `END` when told to say nothing and to answer otherwise, to stay silent when a conversation has plainly ended, to say it has started with `send_message` before it replies, to look back with `read_messages`, and to read the skill for making an agent and answer with commands that exist. `SHRIMPY_TEST_MODEL_URL` is the server's OpenAI-compatible base URL, ending in `/v1`, and `SHRIMPY_TEST_MODEL_ID` is its model ID. The server needs no key.

```bash
SHRIMPY_TEST_MODEL_URL=http://localhost:8090/v1 SHRIMPY_TEST_MODEL_ID=my-model npm test
```

## Run an agent

`npm run shrimpy -- <command>` runs the command line from source. For a `shrimpy` command that works from any directory, link `bin/shrimpy.js` into a directory on your PATH.

What you set up lives in one folder, `~/shrimpy`, or the folder the environment variable `SHRIMPY_DIR` names. Nothing is made there until a command needs it.

```text
~/shrimpy/
  agents/<name>/    one home for each agent
  gateway/          the gateway's data: the roster of who is on the network
  chat/             the chat server's data
```

A folder that has other files in it and no `agents/` is taken to be someone else's, such as a clone of this repository. Dot files don't count, so a folder that holds only a `.DS_Store` is still yours to fill. Nothing is made in someone else's folder, and the commands say to set `SHRIMPY_DIR` or move it. While you work on Shrimpy, give every run a `SHRIMPY_DIR` and a `SHRIMPY_RUNTIME_DIR` of its own, so that nothing touches a setup in use.

Each agent is a home folder, and `agent init` makes one, with a starter `SOUL.md` that works as it is, and says what to do next. It never overwrites a file that exists. The agent is named for its folder unless `--name` gives another name.

Wherever a command takes an agent's home, a name like `scout` is the home `agents/scout` in the folder, and anything with a path separator in it, or that starts with `.` or `~`, is a path: `./scout` is a folder here, and `agent init ~/elsewhere/scout` makes a home there.

```bash
npm run shrimpy -- agent init scout --model local/qwen3.8-27b
```

```text
agent.json            the agent's name and its default model
SOUL.md               its own instructions
context/              Markdown notes, shown to the agent in every conversation
skills/               one folder for each skill, with a SKILL.md in it
vault/                longer notes the agent reads when it needs them
state/pi/models.json  providers you declare, with their models
state/pi/auth.json    API keys, by provider
state/member.json     who the agent is on the network: its token, made the first time it starts, and its ID in the gateway's roster once it has joined
state/agent.sqlite    the engine's storage, made by the first start
runtime/              the owner lock, the endpoint that says where to find the agent by this home, and the shrimpy command the agent's shell runs
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

Every session gets the same four sections of instructions, in this order: what every Shrimpy agent is told (how its reply works, what `END` does, the message tools and `check_back`, how to look things up and the home), `SOUL.md`, the Markdown files of `context/` and the folders under it, and the skills, each as its name, a one-line description and where its `SKILL.md` is. A skill's text is not loaded; the agent reads it when the task calls for it. A section with nothing in it is left out.

The skills are those of the home's `skills/` and the ones that ship with Shrimpy, in `skills/` next to `src/`: `shrimpy-setup`, `shrimpy-agents`, `shrimpy-chat` and `shrimpy-skills`. Every agent is shown them, and a skill in the home with the same name replaces the included one. They are found from the code's own location. An agent's shell finds `shrimpy` whatever PATH the agent was started with: `agent serve` writes a launcher to `runtime/bin/shrimpy` that runs this same Shrimpy, and puts that folder first on the shell's PATH. A test holds every `shrimpy` command line in the instructions, the included skills and what `agent init` prints to the commands and flags the CLI has.

The files are read when the agent starts and when it is told to `reload`, and never in between: editing one changes nothing for a running agent until then. Each session uses the change with its next request, and what it already holds is not rewritten. A file that can't be read, or a skill whose `SKILL.md` has no front matter with a description, is left out and named, and the rest is read. Facts about one event travel with it and are not part of the instructions: the thread and channel it is in, who wrote it and when, and any earlier events in the thread the agent hasn't acted on.

The agent has two tools for chat. `send_message` posts a message now, without ending the turn: to the thread the turn came from, or to `@name` for its DM with that member. `read_messages` reads a thread the same way, with each message as it now stands: an edited one says so, a deleted one has lost its text, and the emoji on a message are listed. A turn's final text is still its reply, so `send_message` is for telling someone something before the turn ends, or somewhere else. The tools use the connection to chat that the agent already has. With chat unreachable they say so and don't wait, and a text too long for one message is posted in parts.

`check_back` is the agent's way to wake itself later, so that it needn't hold a turn open with `sleep`. `in` is a delay such as `30s`, `5m`, `2h` or `1d`, and `at` is an ISO 8601 time with an offset; exactly one is given, and between 1 second and 366 days from now. `note` is what the agent wants to be told, in its own words. The tool answers at once with when the session will be woken, in UTC, and how long that is from when it asked. A session can have 20 wake-ups waiting at once. A wake-up is kept in the agent's records, so it survives a restart, and one that came due while the agent was down comes at the next start. When it comes, the agent is shown that it is a wake-up it asked for, when it asked and for when, and its note, and the turn's final text is posted to the thread like any other: `END` or nothing posts nothing. A wake-up has no receipt, so a turn that fails, or a reply that chat refuses for good, is reported on standard error. Waiting is not work: the thread is marked as working while the wake-up's turn runs and not before. Stopping a session's work cancels the wake-ups it is waiting on, and the next input it gets says which, with each one's time and note, once. Nothing lists the wake-ups that are waiting, and nothing cancels one of them alone.

## Talk to an agent

`up` starts what is missing on this machine and keeps it running in the foreground: the gateway, the chat server and every agent in the folder's `agents/` that has an `agent.json`. The gateway keeps its roster in `gateway/` of the folder and the chat server its store in `chat/`. Name agents to start only those, and give `--data` to keep the two programs' data in another directory, in the same two folders. With no agent to start, `up` starts nothing and says how to make one.

```bash
npm run shrimpy -- up
```

From another terminal, `run` says something to the agent and prints its reply. The new thread's ID goes to standard error, so a script that reads standard output gets only the reply, and `--thread` continues the thread.

```bash
npm run shrimpy -- run scout "what is in my inbox?"
npm run shrimpy -- run scout "and from today?" --thread th_4k9x2m7q0b3d
npm run shrimpy -- threads scout
npm run shrimpy -- read th_4k9x2m7q0b3d
```

`read` shows each message's ID, and shows a message as it now stands: an edited one says when, a deleted one has lost its text, and the emoji on a message are listed. Any member of a channel can react to a message in it, and edit or delete their own, but no command, terminal key or agent tool does that.

## The terminal

`shrimpy` with no command, at a terminal, opens the console. It asks this machine's gateway what is running, and shows the agents. With one agent it goes straight to that agent's threads. Pick a thread, or start one with `n`, and talk: what you type goes to the thread, so `run`, `read` and every other client see it too, and what the agent and others say appears as it arrives. While the agent works in the open thread, its answer, thinking and tool calls stream below the conversation, apart from it. When the turn settles, the reply is a message like any other.

It is a client of the chat server and of agents, and nothing more. It reaches both by name through the gateway, so when the gateway stops, the console loses the chat server and the agent it was watching, names them on screen, and goes on trying until the gateway is back. The agent's work does not stop. Anything it can't reach is named on screen with what to start, and it keeps trying; what you typed stays in the editor.

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

The table is written by `npm run readme` from the commands the CLI has, and a test fails when it is behind. `shrimpy <command> --help` says more about each.

<!-- commands:start -->
| Command | What it does |
|---|---|
| `up [<agent>...] [--data <dir>]` | Start what is missing on this machine and keep it running: the gateway, the chat server and your agents. |
| `run <agent> "<text>" [--thread <id>] [--no-wait]` | Say something to an agent and print its reply. |
| `threads <member> [--json]` | List your threads with a person or an agent: ID, when last updated, who is working in it, and its name. |
| `read <thread> [--json]` | Show a thread: who said what and when, oldest first, with each message's ID. |
| `agent init <agent> --model <provider/id> [--name <name>]` | Create an agent home. Files that already exist are left as they are. |
| `agent serve <agent> [--now]` | Run the agent in the foreground until it is told to stop. |
| `agent status <agent>` | Say whether the agent is running, and how to reach it. |
| `agent reload <agent>` | Make a running agent read its instructions, context files and skills again. |
| `agent context <agent>` | Preview what an agent would be told, from its home's files as they are now. |
| `sessions list <agent>` | List the sessions of a running agent: the thread and channel each is behind, and whether it is working. |
| `sessions read <agent> <thread> [--json]` | Show the session behind a thread: what was said, what the tools did, and what it is doing now. |
| `sessions steer <agent> <thread> <text> [--request-id <id>] [--wait]` | Give the session behind a thread input; it joins work already running. |
| `sessions stop <agent> <thread>` | Stop the work in the session behind a thread, and withdraw the input it has not picked up. |
| `gateway serve --data <dir> [--web-port <port>] [--web-dir <dir>]` | Run the gateway in the foreground until it is told to stop. |
| `gateway status` | List the programs registered with this machine's gateway, and the members on its roster. |
| `chat serve <data-dir>` | Run the chat server in the foreground until it is told to stop, registered with the gateway. |
<!-- commands:end -->

`agent serve`, `gateway serve` and `chat serve` run in the foreground, which is what a supervisor or a sandbox runs, and each prints one JSON line when it is listening. `gateway serve` opens the browser entry on loopback only when `--web-port` is given, and 0 picks a free port; `--web-dir` serves the web client's files from a directory. `agent status` exits 1 when no agent is running at the home, and `gateway status` when no gateway is running.

An agent has one session for each thread it takes part in, named by the thread's ID, and no session until a message arrives in a thread. `agent serve` makes the agent a member of this machine's roster, with the name its `agent.json` gives it, the first time it starts. It makes its token and keeps it in `state/member.json` before it asks to join, so a start that ended before the gateway's answer was written down joins again with the same token and is the same member, and then it keeps its member ID there too. Every start after that signs in with that token, and a name changed in `agent.json` renames the same member. It registers with the gateway as that member, and reaches the chat server by its name through the gateway and comes in to chat with a ticket, so chat learns who the agent is from the gateway and not from the agent. A name another member has is refused, and the message says to change it in `agent.json`. The gateway recognizes an agent by its token, so a copy of a home is the same agent, and an agent runs once: while it does, the gateway turns away a program that joins with its token, signs in with it under another name or registers as it, and renames and replaces nothing. A command run in the agent's shell signs in with no name and is let in. An agent that is turned away goes on running its sessions outside chat, says why once on standard error however often it tries again, and keeps trying, so a copy joins as the agent once the first one stops. The gateway says what happened, and the agent says what to do about it with the paths of its own home: for a copy, to stop it, delete its `state/member.json`, give it a name of its own in `agent.json` and start it again. The agent starts, and its sessions work, with no gateway or chat server running; it finds them when they come up and again after they go away. The chat server keeps a log of events: a message posted, edited or deleted, an emoji put on a message or taken back, and a receipt left on one of these. It offers all of them to every member of the channel, and a message is what its events add up to. What an event means to an agent is the agent's own call. By default a message addressed to the agent, which in a DM is every message from the other member, becomes a turn in the session for its thread, and so does an edit of one, and so does a reaction to a message the agent wrote. The model is shown what happened: an edit says which message it changed and what it now says, and a reaction says who reacted with what, and to which of the agent's messages. A delete, a reaction to someone else's message, a reaction taken back and a receipt wake nobody. The turn's final text is posted to the thread as the reply. A final text of `END`, or nothing, posts nothing. A reply that chat refuses for good, such as one to a channel the agent has left, is not tried again: the receipt is failed, says the reply could not be posted, and gives chat's reason, and any parts of a long reply that were posted stay. The agent leaves a receipt on each event when its turn ends, after any reply is posted, and the receipt names the event it answers, so a message edited after the agent answered it gets a second answer and a second receipt, and the two can be told apart. Each receipt is an event in the log, naming the message of the event it answers, so whoever follows a channel's events learns what an agent did with something. A receipt that replaces an earlier one on the same event, as when a skipped message is answered later, is another event, and the message shows the one that stands. Leaving the receipt an event already has writes nothing, and a receipt can't be left on the event of a receipt.

`agent serve` stops on SIGTERM or Ctrl+C. It stops taking input, gives running turns up to five seconds to finish, then closes. Work that did not finish resumes at the next start, however often the agent is stopped this way. `--now`, or a second signal during the wait, skips the wait. An agent that ends any other way, such as a kill or a crash, resumes its work at the next start too, but a turn that was underway at two of those ends is not run a third time: it is stopped, and its message gets a failed receipt that says to send it again. A wake-up's turn is stopped the same way, and is reported, since it has no receipt.

`gateway serve` and `chat serve` stop on SIGTERM or Ctrl+C too, and exit 0, and stopping does not wait for a gateway that has stopped answering. A second gateway on a machine, or a second chat server, is refused with its own message and exit code 1. The chat server takes the socket's lock before it touches its data directory, so one that is refused leaves nothing behind; the store's own lock refuses a second chat server that reaches the same data directory through a different runtime directory. A chat server starts with no gateway running: it registers when it finds one, and again each time the gateway comes back. Until it has, it lets nobody in and says why, because only the gateway can say who anyone is. The line it prints says it is listening, not that it has registered. A runtime directory too long for a socket path, 104 bytes, is refused with a message that says what to shorten. A chat store of another version, or an agent home whose records another version wrote, is refused at start, and nothing converts it: the chat server names the version it found and the one it reads, and the agent names the file of its records, which is the one to move aside to start fresh, without its sessions and unfinished work.

`up` stops on SIGTERM or Ctrl+C: agents first, then the chat server, then the gateway, and it exits 0 once they have stopped. A second request tells the agents to stop without waiting for running turns, and a third ends everything at once. A program that `up` started and that ends by itself makes `up` say which one, stop the rest and exit 1. Each line a program prints is passed on with its name in front. When everything is already running, `up` says so and exits 0.

A program is reached by its name, through the gateway, on this machine as on any other. A client asks the gateway for a ticket for the program it wants, which comes with the server ID the program answers as, and connects to the gateway's way in for that name: a socket in the `ways/` folder of the runtime directory, made when the program registers and taken away when the program is gone. The gateway pipes the bytes both ways to the program's own socket, which only the gateway is told, reads none of them, and closes each side as soon as the other closes. The client hands the program its ticket before anything else, and the program asks the gateway whose it is, so a connection to the chat server or to an agent that comes without a good ticket is refused. The gateway's list says what is running, by kind, name, version and the member it is, and tells no one where a program listens. A program that registers again after a restart is reached by the same name. An agent has a second socket, for its home, that the commands which take an agent (`agent` and `sessions`) connect to straight and that asks for no ticket, so an agent can be watched and stopped while the gateway is down. What a member the gateway names may do at an agent is decided by the agent, and today everyone under one operating system user may do everything.

When the gateway stops, every connection to it and through it ends, and no program stops because of it, except that `up` stops what it started when any of it ends, the gateway included. The agent goes on with its turns, its replies wait in the tasks that follow their events and events wait in the chat server. The programs register again and the console and the agent's links connect again once the gateway is back, each pausing between tries for longer, up to 15 seconds.

Nobody says who they are in chat: the gateway decides. A command run by a person is the person who runs the gateway, named for their operating system user, and the console is the same person. A command run from an agent's shell is that agent: the launcher in the home's `runtime/bin` names the home, and the command signs in to the gateway with the token the home keeps, so `run` posts as the agent and `threads` and `read` show the agent's threads, not the person's. A home that has not joined yet is an error that says to start the agent. `run` and `threads` take the member's name from the roster, `run` an agent and `threads` a person or an agent. `run` waits for the agent's receipt on your message, read from the thread. It prints the reply on standard output and exits 0 when the agent answered. A silent agent prints nothing and exits 0. A failure prints its reason on standard error and exits 1. Stopped or skipped work says so on standard error and exits 130. Stopping `run` while it waits leaves the message and the agent's work alone, and exits 130. It posts nothing, and says what to start, when no gateway, chat server or agent of that name is running. `read` leaves out silent receipts, which are recorded but shown to nobody by default.

A gateway, chat server or agent of another version than the command is named on standard error by `gateway status`, `up`, `run`, `threads` and `read`, and the command carries on.

`sessions steer --wait` prints the answer, then exits 0 when the input was answered, 130 when it was cancelled, and 1 when it failed or ended without an answer. Any command exits 2 when it is used wrongly. The session commands talk to the running agent and never open the home's storage.

## The shape

`src/` is organized by program: `agent/`, `chat/`, `gateway/`, `clients/` and `cli/`. Programs never import each other. They share only `contracts/`, which carry Shrimpy's own shapes, and `lib/`.

- A file imports files in its own directory, or another directory's front door: its `index.ts` or its `node.ts`. A directory's files stay closed to the directories inside it, so what both need gets a directory of its own. Every front door opens with a short comment saying what the module is for and what it must not know.
- A module whose API partly needs Node offers that part through `node.ts`, and a file behind that door that needs Node is named `*.node.ts`. A module that is Node-only throughout has `node.ts` as its only door.
- Browser-safe code can't import Node or a `node.ts` door. That is the web client and everything in `contracts/` and `lib/` apart from the files that need Node, so a `lib/` module's `index.ts` door and everything behind it is browser-safe. Tests and `testing/` modules, `lib/testing` among them, are never shipped and are exempt.
- Tests sit beside the code as `*.test.ts`. Test support lives in a `testing/` module that only tests import.
- Only `agent/` imports Pi's durable runtime. Inside it, only `host/`, `sessions/` and `extensions/` do, and the code that takes messages in (`intake/`) sees nothing of it: it works with Shrimpy's own types and the `Admissions` and `Working` it is handed. `agent/sessions/` is the one place that reads Pi's records, and it writes Shrimpy's own documents (which thread a session belongs to, the feed cursor) in the same commits as the work they belong to. It owns the task that follows each input the agent takes up, a chat event or a wake-up, until the input's source is told how it ended (a chat event's receipt), and the task that waits for a wake-up to come due. It opens the records at the start and gives them an ID of their own, which every request ID the agent makes for chat carries. It also notes in them that the agent is running until an orderly stop, and counts the crashes that the turns it interrupted live through.
- The agent reaches the gateway and the chat server through `agent/links/`, which is handed how to reach them (`contracts/gateway`'s `Transports`: a way to the gateway, and through it to a program by its name), so nothing there assumes either is on this machine. The default is the gateway's Unix socket and its ways in. Only `contracts/gateway` and the gateway know where a way in is. Who may do what at an agent is checked in `agent/access/`, for every connection, by the caller it has: the home's owner, or the member the gateway said.
- The console works the same way: `clients/console/network/` is its links, each handed the same `Transports`, `state/` is what it knows and does, `screen/` is what it shows as plain text and facts, with every sentence in `words.ts` and everything foreign made harmless for a terminal, and `draw/` is the only code that imports `pi-tui`. The lint keeps the other three free of it.

`lint/boundaries.js` enforces these rules, so a violation fails `npm run check`.

No shortcut reaches a commit: a module's front door, tests and lint coverage exist before its first commit.
