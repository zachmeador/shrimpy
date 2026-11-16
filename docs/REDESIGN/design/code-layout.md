# 🦐 The code's layout

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

This is the layout of `src/`. Old Shrimpy sits in `shrimpy-old/` until the release deletes it, along with its tests, which test old internals.

The tree is organized by program. Shrimpy is three programs (an agent, the chat server and the gateway) plus the clients and the CLI, and the only code they share is their contracts.

```text
src/
  contracts/        the only code programs share: each contract's Chord object types and the shapes they carry,
                    and the files a home, the folder and the gateway keep that the `shrimpy` command shares
    agent/          Agent, Session and AgentPresence at agent({ name }), the shapes the agent builds, one sentence
                    for each way a turn ends without an answer, and linking to an agent by its home's path, with
                    the membership a home keeps; a home's layout, `agent.json`, its wake and trigger files and
                    their schedules, making a home, the folder's default model and where it keeps sign-ins
    chat/           Chat, Channel, Thread and ChatPresence at chat(): channels, threads, messages, events and
                    receipts, and the commands a person writes for agents
    gateway/        what every contract shares (the hosts and their addresses, who is asking, the fields a member
                    is named by, a method's answer or refusal, and the hello before Chord), Roster at gateway(),
                    and the invitation's link and what a machine of yours keeps; through node.ts, the one dial
                    every link and join starts with, a client's link to the gateway or to an agent's home socket,
                    keeping a program or a client linked, and the addresses the gateway keeps between starts
  agent/            the agent program, one process per home, whose files at the top make its host, serve its
                    objects, read its home and wire the modules together
    home/           what the agent alone reads of its home: where it keeps its own files, its instructions,
                    context and skills in one snapshot, its breadcrumbs, and the look for changes
    host/           owner lock, model runtime and provider login, registry, environment, storage, supervision,
                    and what the modules share of the engine: reading a kind of task a page at a time, ending
                    the tasks a session leaves open, and a tool's answer
    links/          its link to the gateway, kept as the agent, over which requests for it arrive and it holds the
                    roster and chat, who a name on the roster is, and why a call to chat failed
    access/         who is asking, from a request's stamp and the roster as it is now, and what they may do
    inputs/         what an input is, from any source, how it reads to the model, and how its turn can end
    records/        Shrimpy's own documents in the engine's storage, and the changes to a session's record
                    that another module makes in its own commit
    turns/          the task that follows one input to its end: taking it up, what is being worked on,
                    what a crash costs it, and why a turn ended without an answer, in the contract's words
    questions/      ask_agent: the tool, the questions that are open, and what closes one
    wakeups/        check_back: the tool, and the task that sleeps until a wake-up is due
    triggers/       standing triggers: follow the home's files, sleep, make occurrences, answer the API about them
    chat/           the agent's side of chat: the feed, what wakes it, replies, receipts, working marks
    sessions/       the sessions as clients see them: which there are, the window and status of each, kept live,
                    the home's model they follow, and steer, wait and stop
    message-tools/  send_message and read_messages
    context/        what every session is told, as prompt sections made from the home's files
  chat/             the chat server program, which links out to the gateway
    store/          SQLite schema and transactions: the log of events and the messages they add up to
    threads/        what the contract means: channels, threads, membership, messages, mentions, receipts, who is
                    working, who may do what, and a refusal as the contract's answer
    served/         Chat, Channel and Thread for each caller, and ChatPresence for the gateway, kept live
    offers/         the events after a member's place in its feed, at once
    identity/       who members are, from the roster chat holds at the gateway
    input/          what callers may send: limits and checks
    providers/      not built yet: the provider interface and the helpers providers share
      telegram/     not built yet: Telegram's API, with polling, sender mapping, message and media formats, sending
  gateway/          the gateway program: the roster, and Chord's relay between everyone else, on its own socket
                    and over TLS on its entry
    roster/         you, the one person, and every agent, each with a name, whether it is an admin and its ways in,
                    in one file
    hello/          who a connection is, from its hello and the door it came in by, and what the gateway answers
    programs/       the programs linked now, each link the route to its program, and the presence the gateway
                    holds at every program it knows
    served/         Roster for each caller, and what each caller may do with it
    invitations/    invitations in flight: a code that lets one agent, or one device of yours, in from apart
    listening/      why the gateway couldn't listen on an address for whoever is apart from it
    key/            the gateway's key, made whenever its data has none, whose fingerprint an invitation carries
    settings/       your settings file, followed for your name
  clients/
    console/        terminal client
      network/      one link to the gateway, kept across losses, and the objects held through it: apart from
                    tests, the only code in the console that imports Chord
      state/        where the person is and what they can do, with no terminal in it
      screen/       what is shown, as plain text and facts, with foreign text made harmless
      draw/         the only code that imports `pi-tui`
    web/            not built yet: the web client
  cli/              the `shrimpy` command
    talk/           linking to the gateway as whoever a command is, and the objects it holds there: apart from
                    tests, the only code in the CLI that imports Chord, with `me.ts` the one place that decides
                    who a command or the terminal is; and joining a gateway from apart, as a home or a machine
                    of yours
  lib/              helpers with no knowledge of Shrimpy's domain: locks, retries, listeners and waiting on them,
                    a thrown value as an error, files read and saved whole, IDs, refusals, times, config
                    checking, text made harmless for a terminal, the runtime directory, versions and test support
    link/           links for Chord: a WebSocket on a socket's path, or over TLS at an address, with the hello
                    before Chord; listening, dialing and keeping a link; and, safe for browsers, how an address
                    is written
    follow/         a value worked out from a read and a watch, as a Chord object follows it, and the type of
                    what Chord follows, for code that doesn't import Chord
    tls/            keys that prove a link's end by their fingerprint, and the certificate TLS serves them in
```

## What may import what

| Code | May import |
|---|---|
| `lib/` | nothing else in `src/` |
| `contracts/` | `lib/` |
| `agent/`, `chat/`, `gateway/`, `clients/console/`, `clients/web/` | its own code, `contracts/` and `lib/`, and never another program |
| `chat/providers/<name>/` | the chat server's provider interface and `lib/` |
| `cli/` | `contracts/` and `lib/`, plus each program's front door to start it |

- **Programs never import each other.** They talk only through `contracts/`, as [the contracts](2-contracts.md) describe.
- **The CLI loads a program only to start it.** Each command imports its program's front door when it runs, so no other command loads it, and the lint names the files that may.
- **Shared plumbing stays plumbing.** Shared code may remove repetition around Pi, but it adds no concepts of its own: no registry, discovery or lifecycle. `lib/link` wraps Chord's links once for every program and client, and `lib/follow` turns a read and a watch into what a Chord object follows. The test is whether a module could be deleted and inlined into its callers in an hour with no change in behavior. If deleting it would mean redesigning the programs, it has become the service framework this plan doesn't build. Check `lib/`'s size at each review pause.
- **Contracts carry Shrimpy's own shapes, never Pi's.** Only `agent/` imports Pi's durable runtime, and `pi-ai` with it, apart from tests. `agent/sessions/` is the one place that turns Pi's records into the session view clients see, and `agent/turns/` the one that says why a turn ended without an answer in the contract's words. A Pi upgrade can then change the agent without touching a client.
- **Inside the agent, a file that needs Pi says so in its name.** A file imports Pi's durable runtime only if it is named `*.durable.ts` or is a module's `durable.ts` door, as `*.node.ts` marks what needs Node. Inside a module, a file that isn't marked can't import one that is, so plain code never reaches the engine. The files at the top of `agent/` wire the modules together, so they may import a marked door, and still can't import the package unless they are marked themselves.
- **Chord stays where programs meet,** settled by the coordinator on 2026-11-14 with the move to Pi 1.5.2, and yours to change. It keeps replacing Chord, or keeping a fork of it, as bounded as Durable is. `contracts/` imports it, since a contract is a Chord object type, and so do `lib/link` and `lib/follow`. In a program or a client, only the modules that make its host, serve its objects or hold another program's import it, and the lint names them: the files at the top of each program, the gateway's `hello/`, `programs/` and `served/`, the chat server's `served/` and `identity/`, the agent's `links/`, the terminal's `network/` and the CLI's `talk/`. Chord's `context`, `json` and `delta` entry points go wherever Pi's durable runtime may, since the runtime is written in their types. Tests and `testing/` modules may import any of it. A rule by folder fits here, where it didn't for Durable: code that talks to another program belongs in the module that does.
- **Only `clients/console/draw/` imports `pi-tui`,** and only from the package root, because `pi-tui` has no exports map to stop deep imports. Nothing else in the console imports the drawing, so its state and its words are tested without a terminal.

## Inside each module

Keep this simple:

- Every module has one front door, `index.ts`. A file imports files in its own directory or another directory's front door, and nothing else. `contracts/`, `lib/` and `clients/` only group modules, so they have no door of their own.
- Each front door opens with a short comment saying what the module is for and what it must not know about.
- Tests sit next to the code they cover, as `*.test.ts`.
- A module whose API partly needs Node offers that part through a second door, `node.ts`, with its Node files named `*.node.ts`. A module that needs Node throughout has `node.ts` as its only door. Browser-safe code can't import either: that's the web client, the contracts' main doors, and every `lib/` module's main door with everything behind it.
- A module of the agent whose API partly needs Pi works the same way, with a second door, `durable.ts`, and its files named `*.durable.ts`. A module that is Pi throughout has `durable.ts` as its only door.
- Test support lives in a `testing/` module that only tests import.
- ESLint enforces the import table, the front doors, the Pi package rules and the tiers of the agent's modules from a module's first commit, through one local rule in `lint/boundaries.js` with its own tests. `npm run check` runs types, lint and tests.

## Where the words are

Every sentence a model or a person reads is kept in a few files, so that wording is found and changed in one place and no logic has to be read to do it.

| What | Where |
|---|---|
| What every agent is told | `agent/context/base.ts`, one function that returns the whole text |
| How an input reads to the model: a message, a wake-up, a trigger's occurrence, a question's result, breadcrumbs, and where the session is | `agent/inputs/prompt.ts` |
| What a tool says: its description, its arguments and its answers | `words.ts` in the tool's module: `agent/message-tools/`, `agent/wakeups/` and `agent/questions/` |
| The skills Shrimpy ships | `skills/<name>/SKILL.md` |
| Everything the terminal shows | `clients/console/screen/words.ts` |
| Why a turn ended without an answer, with what to do, as receipts, `/status` and `sessions read` say it | `contracts/agent/failures.ts`, since the agent and every client say it the same way |
| What a command for agents does, in the one line a client shows beside it | `contracts/chat/commands.ts`, since every client shows the same |
| What an agent says in a thread about `/model` | `agent/chat/model-command.ts` |
| A command's usage and help | The command's own file in `cli/commands/` |

`shrimpy agent context` prints what an agent would be told, put together from its home as it is now. A test holds every `shrimpy` command line in these words to the commands the CLI has.

## The agent's modules

Approved on 2026-10-05 and built that day. Each module has one job.

| Module | Its one job | Touches Pi |
|---|---|---|
| `inputs/` | What an input is, from any source, how it reads to the model, and how its turn can end. Data and words. | Never |
| `home/`, `links/`, `access/` | The home's files, the link to the gateway and what is held over it, and who may do what. | Never |
| `host/` | Opens the engine, and is the only place that does, with what the modules share of it: reading a kind of task a page at a time, ending the tasks a session leaves open, and a tool's answer. | Throughout |
| `records/` | Shrimpy's own documents in the engine's storage, and the changes to a session's record made inside another module's commit. | Throughout: it defines the documents |
| `turns/` | The task that follows one input to its end: taking it up, what is being worked on, what a crash costs it, and why a turn ended without an answer, in the contract's words. | Defines the task. Its plain door has what it asks of whoever tells an input's source |
| `questions/` | `ask_agent`: the tool, the questions that are open, and closing one on a receipt or when its time is up. | A tool and a task. Its plain door has what it asks of chat |
| `wakeups/` | `check_back`: the tool, and the task that sleeps until the wake-up is due. | A tool and a task |
| `triggers/` | Standing triggers: follow the home's files, sleep, make occurrences, and answer the API about them. | Defines the task |
| `chat/` | The agent's side of chat: read the feed, decide what wakes it, take that up, post replies, leave receipts, mark where it works. | One file, which takes a chat event up |
| `sessions/` | The sessions as clients see them: which there are, the view of each, the home's model they follow, and steer, wait and stop. | Reads Pi's view |
| `message-tools/` | `send_message` and `read_messages`. | Defines the tools |
| `context/` | What every session is told, as prompt sections made from the home's files. | Defines the sections. The preview is plain |

**Imports point one way,** in these tiers: `inputs`, `home` and `access`; then `links`, `host` and `records`; then `turns`; then `questions`; then `wakeups`, `triggers` and `chat`; then `sessions`, `message-tools` and `context`; then the files at the top of `agent/`, which wire the rest. A module imports only from the tiers before its own. What two modules of one tier both need belongs in an earlier tier, or is handed in from the top. The lint has the tiers, and a new module is refused until it is given one.

**Two functions take a transaction,** so that a source of input lives in a module of its own and still acts inside one commit. `openSession`, in `records/`, finds the session at an address or makes it. `takeUp`, in `turns/`, takes out of the session's record what it kept for its next input and creates the task that follows the input. A chat event, a wake-up, a trigger's occurrence and the result of a question each call them from their own module. A new source of input gets a module of its own and does the same.

**Why it was reshaped.** `agent/sessions/` had grown to 2,019 lines doing eight jobs. The old rule, that only three folders may import Pi, was not the main cause. The records were private to `sessions/` and no other module could take part in a commit, so "find or make the session, take what it kept, create the task" was written there three times, and a feature spanned three folders: the change that added wake-ups touched 27 files. A rule by folder also made moving code into a listed folder the cheap way to satisfy the lint, which is what filled `sessions/`. Under a rule by file name the cheap way is a new file beside the feature.

**What must not change by accident:** the names of the tasks, documents, extensions and tools, their versions, the shape of a stored input and the form of a request ID. Nothing converts records, so a drift costs a home its sessions. The reshape was checked by hand in both directions: the build before it and the build after it each ran on a home the other had left, with a wake-up and a trigger waiting.
