# 🦐 How Shrimpy Is Built

For anyone about to read the code. How to run it is in the [README](../README.md).

## Three programs

- **The agent** is one process for each home. It owns the home's files, its Pi storage and its private work, one session for each thread it takes part in. Only it opens the storage, behind a lock taken first, because opening is a write.
- **The chat server** owns the shared record of what was said: channels, threads, messages, attachments, mentions, reactions, edits, receipts and who is working, in its own SQLite store.
- **The gateway** owns who is on the network and how to reach them: the roster, invitations and the relay. It never hosts agents or conversations.

Clients and the `shrimpy` command use the programs and own nothing.

## What they share

Only `src/contracts/`, which carry Shrimpy's own shapes and never Pi's, and `src/lib/`, helpers that know nothing of Shrimpy's domain. Programs never import each other. They talk through contracts, Chord objects that a caller holds live through the gateway, or on an agent's own socket.

## Words

- **Agent:** an enduring identity with a home, which is a folder.
- **Channel:** a place where people and agents talk, a DM or a room.
- **Thread:** one conversation in a channel. Every channel has a main thread.
- **Session:** an agent's private work behind a thread.
- **Member:** you or an agent, with an ID that never changes and a name that can. A network has one person, its owner.
- **Roster:** the gateway's list of members, each one's ways in, and who is reachable now.
- **Way in:** what the gateway knows a member by: an agent's token, a device's token, or its own socket, which is you.
- **Relay:** the gateway's part between the programs. Each program keeps one link to it, and the gateway passes every request for that program over the link, stamped with who is asking.
- **Trigger:** anything but a message that wakes an agent: a time, an interval, or a check whose output changed.
- **Breadcrumb:** a small file in the home holding a fact that moves. It comes with an agent's next input, once, when new to that session.

## Layout rules

`lint/boundaries.js` enforces these in `npm run check`.

- `lib/` imports nothing else in `src/`; `contracts/` only `lib/`; each program its own code, `contracts/` and `lib/`; `cli/` also each program's front door.
- Every module has one front door, `index.ts`. A file imports files in its own directory, or another module's front door, and nothing else.
- Node code sits behind `node.ts` and `*.node.ts`. Browser-safe code can't import it.
- Only `agent/` imports Pi's durable runtime, and there only `*.durable.ts` files or a module's `durable.ts` door. A plain file can't import a marked one in its module.
- Chord is imported only by `contracts/`, `lib/link`, `lib/follow`, the files at the top of each program and the modules the lint names, apart from its `context`, `json` and `delta`, which go wherever Pi's durable runtime may.
- Only `clients/console/draw/` imports `pi-tui`.
- Inside `agent/`, imports point one way through tiers: `inputs`, `home`, `access`; `links`, `host`, `records`; `turns`; `questions`; `wakeups`, `triggers`, `chat`; `sessions`, `message-tools`, `context`.
- Tests sit beside the code as `*.test.ts`. Test support lives in a `testing/` module that only tests import.
- Shared code stays plumbing: a `lib/` module must be deletable by inlining it into its callers.

## Where the words are

- What every agent is told: `agent/context/base.ts`.
- How an input reads to the model: `agent/inputs/prompt.ts`.
- A tool's description and answers: `words.ts` in its module.
- Skills: `skills/<name>/SKILL.md`.
- Everything the terminal shows: `clients/view/words.ts`.
- Why a turn ended without an answer: `contracts/agent/failures.ts`.
- A chat command's one line: `contracts/chat/commands.ts`.
- A command's usage and help: its file in `cli/commands/`.

`shrimpy agent context` prints what an agent would be told.

## Checking a change

`npm run check` runs types, lint and every test. [AGENTS.md](../AGENTS.md) says what a test is for.
