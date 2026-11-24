# 🦐 How Shrimpy Is Built

For anyone about to read the code. How to run it is in [CONTRIBUTING.md](../CONTRIBUTING.md), and what isn't built yet is in [the open list](open.md).

## Three programs

- **The agent** is one process for each home. It owns the home's files, its Pi storage and its private work, one session for each thread it takes part in. Only it opens the storage, behind a lock taken first, because opening is a write.
- **The chat server** owns the shared record of what was said: channels, threads, messages, mentions, reactions, edits, receipts, read marks and who is working, in its own SQLite store.
- **The gateway** owns who is on the network and how to reach them: the roster, invitations and the relay. It also serves the web client's page, and the workspace context, the notes every agent is shown, from `context/` in the Shrimpy folder it runs in. It never hosts agents or conversations.

The clients, in `clients/`, and the `shrimpy` command, in `cli/`, use the programs and own nothing.

## What they share

Programs never import each other, because they run apart: an agent can be on another machine, under another account, or on another release of the same major. They share only `src/contracts/` and `src/lib/`. The contracts are Chord objects, which a caller holds live through the gateway or on an agent's own socket, and they carry Shrimpy's own shapes and never Pi's, so a Pi upgrade changes the agent without touching a client. `lib/` holds helpers that know nothing of Shrimpy's domain.

## Words

| Word | Means |
|---|---|
| Agent | An enduring identity with a home, which is a folder. Pi uses "agent" for the configuration a conversation runs with. |
| Channel | A place where people and agents talk: a DM or a room. |
| Thread | One conversation in a channel. A room has a main thread. Chat makes one in a DM too, which agents at 1.0.0 post in, and to agents and clients it is an ordinary thread. |
| Session | An agent's private work behind a thread, or behind work with no thread, such as a trigger's. Pi calls it a conversation. |
| Receipt | What an agent did with an event in a thread: answered, silent, stopped, skipped or failed. |
| Member | The person or an agent, with an ID that never changes and a name that can. A network has one person, its owner. |
| Roster | The gateway's list of members, each one's ways in, and who is reachable now. |
| Way in | What the gateway knows a member by: an agent's token, a device's token, or the gateway's own socket, which is the person. |
| Device | A Shrimpy folder on another of the person's machines, or a browser, let in with a token of its own. |
| Relay | The gateway's part between the programs. Each program keeps one link to it, and the gateway passes every request for that program over the link, stamped with who is asking. |
| Trigger | Anything but a message that wakes an agent: a time, an interval, or a check whose output changed. |
| Breadcrumb | A small file in the home holding a fact that moves. It comes with the agent's next input, once, when it is new to that session. |

## Layout rules

`lint/boundaries.js` checks the imports in `npm run check`.

| Code | May import |
|---|---|
| `lib/` | Nothing else in `src/` |
| `contracts/` | `lib/`. Inside it, `gateway/` imports no other contract, `chat/` and `agent/` import `gateway/`, and `agent/` imports how a room is written from `chat/` |
| `agent/`, `chat/`, `gateway/` | Their own code, `contracts/` and `lib/` |
| `clients/look/`, `network/`, `state/`, `view/` | `contracts/`, `lib/`, and those before them in that order. Never a client or `pi-tui` |
| `clients/console/`, `clients/web/` | Their own code, `contracts/`, `lib/` and the four shared modules. Never each other |
| `cli/` | `contracts/` and `lib/`, each program's front door to start it, the agent's to preview a home and to sign in, and the web client's Node door to bundle the page |

- Every module has one front door, `index.ts`, which opens with a comment saying what the module is for and what it must not know. A file imports files in its own directory or another module's front door, and nothing else. `contracts/`, `lib/` and `clients/` only group modules, so they have no door.
- Node code sits behind a second door, `node.ts`, in files named `*.node.ts`, so code that runs in a browser can't reach it: the web client, the contracts' main doors, and the main doors of every `lib/` module and of the shared client modules.
- Only `agent/` imports Pi's durable runtime and `pi-ai`, and there only from `*.durable.ts` files or a module's `durable.ts` door. A plain file can't import a marked one in its module, so plain code never reaches the engine. `agent/sessions/` alone turns Pi's records into the session view clients see.
- Chord is imported only where programs meet, so replacing it, or keeping a fork, stays bounded: `contracts/`, `lib/link`, `lib/follow`, the files at the top of each program, and the modules that make a host, serve objects or hold another program's, which the lint names. Its `context`, `json` and `delta` go wherever Pi's durable runtime may.
- Only `clients/console/draw/` imports `pi-tui`, and only from the package root, since `pi-tui` has no exports map to stop deep imports.
- The two clients share what is true and what is said. A sentence that names a key belongs to the client that has it. Anything the other client would be wrong to say differently lives in `clients/state/` or `clients/view/`.
- Inside `agent/`, imports point one way through tiers: `inputs`, `home`, `access`; `links`, `host`, `records`; `turns`; `questions`; `wakeups`, `triggers`, `chat`; `sessions`, `message-tools`, `context`. What two modules of one tier both need belongs in an earlier tier, and a new module is refused until it has one. A new source of input gets a module of its own, and calls `openSession` from `records/` and `takeUp` from `turns/` inside its own commit.
- Shared code stays plumbing: a `lib/` module must be deletable by inlining it into its callers.
- Tests sit beside the code as `*.test.ts`. Test support lives in a `testing/` module that only tests import.
- From 1.0.0, the names of the agent's tasks, documents, extensions and tools, their versions, the shape of a stored input and the form of a request ID change only with a migration and a new version of the agent's storage. Otherwise a home loses its sessions.

## Where the words are

Every sentence a model or a person reads lives in a few files, so wording changes in one place, with no logic to read.

| What | Where |
|---|---|
| What every agent is told | `agent/context/base.ts` |
| How an input reads to the model | `agent/inputs/prompt.ts` |
| A tool's description, arguments and answers | `words.ts` in its module |
| What an agent says in a thread about `/model` | `agent/chat/model-command.ts` |
| The skills Shrimpy ships | `skills/<name>/SKILL.md` |
| A sentence that names a client's key or gesture | `clients/console/draw/words.ts` and `clients/web/words.ts` |
| Everything else a client shows | `clients/view/words.ts` |
| Why a turn ended without an answer | `contracts/agent/failures.ts` |
| How a session, a trigger and a model are said | `contracts/agent/words.ts` |
| What a receipt tells a person, how a thread, a room and its members are written, and what a reader who can't find or join one is told | `contracts/chat/words.ts` |
| A chat command's one line | `contracts/chat/commands.ts` |
| What a client says to start when a program isn't linked | `contracts/gateway/words.ts` |
| A command's usage and help | Its file in `cli/commands/` |

A few sentences that a program and the commands both say sit beside their code in `contracts/`, such as what to do when the gateway doesn't know a home's token, in `contracts/agent/membership.ts`. `shrimpy agent context` prints what an agent would be told, and a test holds every `shrimpy` command line in it and in the skills to the commands the CLI has.

## The terminal's keys

Four rules decide a key, so the terminal stays learnable as it grows:

1. One key means one thing on every screen.
2. Right and Enter go in, and Left and Esc go out. The screens are levels: agents and rooms, then what one of them takes part in, then one thread or one session. In a thread, Left moves through what is typed and goes back from its start. Esc goes back from anywhere, whatever is typed, and going back never does anything else, such as stopping work. `/stop` stops it.
3. Pi's key where Pi has one, since the editor is Pi's.
4. Every key is findable. A key that acts on one thing is named beside it, the last line names the keys that move you, and Ctrl+G lists them all.

`/` written in a thread is always a command, so a key never stands in for one. The [terminal's mockup](terminal-mockup.html) draws every key in use.

## Checking a change

`npm run check` runs types, lint and every test. [AGENTS.md](../AGENTS.md) says what a test is for.
