# 🦐 The code's layout

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

This is the layout of `src/`. Old Shrimpy sits in `shrimpy-old/` until the release deletes it, along with its tests, which test old internals.

The tree is organized by program. Shrimpy is three programs (an agent, the chat server and the gateway) plus the clients and the CLI, and the only code they share is their contracts.

```text
src/
  contracts/        the only code programs share: each contract's Chord object types and the shapes they carry,
                    and the files a home, the folder and the gateway keep that the `shrimpy` command shares
    agent/          Agent, Session and AgentPresence at agent({ id }), the shapes the agent builds, one sentence
                    for each way a turn ends without an answer, the words a session and a model are said in, and
                    linking to an agent by its home's path, with the membership a home keeps and what to do when
                    the gateway doesn't know it; a home's layout, `agent.json`, its wake and trigger files and
                    their schedules, making a home, the folder's default model and where it keeps sign-ins;
                    an agent's sigil and pigment, with the maker of both, and a home's files as a caller sees them
    chat/           Chat, Channel, Thread and ChatPresence at chat(): channels, threads, messages, events,
                    receipts and your read marks, the commands a person writes for agents, finding a member, a room or a DM by name
                    and a member's name by ID, and the words chat and every client say the same way: what a
                    receipt tells a person, how a thread, a room, a channel and its members are written, and
                    what a reader is told when they can't find or join one
    gateway/        what every contract shares (the hosts and their addresses, who is asking, the fields a member
                    is named by and the rule a name follows, a method's answer or refusal, the hello before Chord
                    and what is said to one that can't be read or comes from another version, and the helpers for
                    a call on another program's object), Roster at gateway() and the roster as a program follows
                    it, Notifications, where the chat server hands the gateway what to tell you on your devices,
                    that the roster has no such member, what a client tells a person to start when the
                    gateway, the chat server or an agent isn't linked, the invitation's link and what a
                    machine of yours keeps, and the page's door as the page sees it, with its link and where a
                    browser is told things; through node.ts, the hello every link and join starts with, a client's
                    link to the gateway or to an agent's home socket, keeping a program or a client linked and
                    saying when its link is lost and back, and the addresses the gateway keeps between starts
  agent/            the agent program, one process per home, whose files at the top make its host, serve its
                    objects, read its home and wire the modules together
    home/           what the agent alone reads of its home: where it keeps its own files, its instructions,
                    context and skills in one snapshot, its breadcrumbs, its sigil, its files as a caller may
                    look through them, and the look for changes
    host/           owner lock, model runtime and provider login, registry, environment, storage, supervision,
                    and what the modules share of the engine: reading a kind of task a page at a time, ending
                    the tasks a session leaves open, what a task ends with when it is done or aborted, ending
                    one that failed and saying so, a tool's answer, and what names a request a tool call makes
    links/          its link to the gateway, kept as the agent, over which requests for it arrive and it holds the
                    roster and chat, who a name on the roster is, and why a call to chat failed
    access/         who is asking, from a request's stamp and the roster as it is now, and what they may do
    inputs/         what an input is, from any source, how it reads to the model, and how its turn can end, with
                    what the tools that come back later tell the model of ending its turn and of how long to wait
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
    store/          SQLite schema and transactions: the log of events, the messages they add up to, and your
                    read marks
    threads/        what the contract means: channels, threads, membership, messages, mentions, receipts, who is
                    working, what is new to you, who may do what, and a refusal as the contract's answer
    served/         Chat, Channel and Thread for each caller, and ChatPresence for the gateway, kept live
    offers/         the events after a member's place in its feed, at once
    notifications/  what is worth telling you on your devices, and when: what has stayed unread for a few
                    seconds, handed over finished, with nothing of the gateway, devices or push
    identity/       who members are, from the roster chat holds at the gateway
    input/          what callers may send: limits and checks
    providers/      not built yet: the provider interface and the helpers providers share
      telegram/     not built yet: Telegram's API, with polling, sender mapping, message and media formats, sending
  gateway/          the gateway program: the roster, and Chord's relay between everyone else, on its own socket
                    and over TLS on its entry
    roster/         you, the one person, and every agent, each with a name, whether it is an admin and its ways in,
                    and where each device of yours is told things, in one file
    hello/          who a connection is, from its hello and the door it came in by, and what the gateway answers
    programs/       the programs linked now, each link the route to its program, and the presence the gateway
                    holds at every program it knows
    served/         Roster for each caller, and what each caller may do with it
    invitations/    invitations in flight: a code that lets one agent, or one device of yours, in from apart
    listening/      why the gateway couldn't listen on an address for whoever is apart from it
    key/            the gateway's keys, each made whenever its data has none: the one whose fingerprint an
                    invitation carries, and the one it signs notifications with
    settings/       your settings file, followed for your name, and read at the start for where the page's door is
    page/           the page's door, beside the entry: it serves the web client's page, lets a browser in once by
                    an invitation's code, keeps its token in a cookie, takes a link only from its own page, and
                    takes where a browser is told things
    push/           notifications by Web Push: encrypted for each device's place and signed with the gateway's
                    key, on Node's own crypto, and sent to that device's push service
  clients/
    look/           the colors of dusk and day by name, what each pigment is for, the wordmark, and a bitmap as
                    braille dots, half blocks or an SVG path
    network/        one link to the gateway, kept across losses, and the objects held through it, handed how to
                    dial, and behind its `node.ts` door, dialing from Node: apart from tests, the only client code
                    that imports Chord
    state/          what a client knows, what is open at each level, and what the person can do
    view/           what is shown, as plain text and facts, a level at a time, with foreign text made harmless
    console/        terminal client
      draw/         the only code that imports `pi-tui`
    web/            the web client: for now a placeholder page that links to the gateway and lists the roster,
                    with TypeScript settings of its own, and behind its `node.ts` door, bundling itself with esbuild
  cli/              the `shrimpy` command
    talk/           linking to the gateway as whoever a command is, and the objects it holds there: apart from
                    tests, the only code in the CLI that imports Chord, with `me.ts` the one place that decides
                    who a command or the terminal is; and joining a gateway from apart, as a home or a machine
                    of yours
    up/             what `shrimpy up` starts and how it keeps it running: what is missing, the gateway and the
                    chat server, the agents, following the folder's homes, and stopping them all
  lib/              helpers with no knowledge of Shrimpy's domain: locks, retries, listeners and waiting on them,
                    closing what was opened, last first, a thrown value as an error, files read and saved whole
                    and folders listed, IDs, refusals, times and lengths of time, config checking, text made
                    harmless for a terminal, a list written as a sentence or cut short, words ended like a
                    sentence or without their period, text on one line with single spaces or cut to a length, a
                    word quoted for a shell, the runtime directory, versions and test support
    link/           links for Chord: a WebSocket on a socket's path, or over TLS at an address, with the hello
                    before Chord; listening, dialing, telling when nothing listens at a path, and keeping a link;
                    and, safe for browsers, how an address is written and read, and what a host reports going
                    wrong
    follow/         a value worked out from a read and a watch, as a Chord object follows it, and the type of
                    what Chord follows, for code that doesn't import Chord
    tls/            keys that prove a link's end by their fingerprint, and the certificate TLS serves them in
```

## What may import what

| Code | May import |
|---|---|
| `lib/` | nothing else in `src/` |
| `contracts/` | `lib/`; and, within `contracts/`, `gateway/` imports no other contract, `chat/` and `agent/` import `gateway/`, and `agent/` imports how a room is written from `chat/` |
| `agent/`, `chat/`, `gateway/` | its own code, `contracts/` and `lib/`, and never another program |
| `clients/look/`, `clients/network/`, `clients/state/`, `clients/view/` | `contracts/` and `lib/` by their main doors, and each other in that order: each imports only those before it. Never a client or `pi-tui`. Of them, only what is behind `network/`'s `node.ts` door, which dials from Node, reaches what needs Node, apart from tests and test support |
| `clients/console/`, `clients/web/` | its own code, `contracts/`, `lib/` and the modules both clients share, and never the other client or a program |
| `chat/providers/<name>/` | the chat server's provider interface and `lib/` |
| `cli/` | `contracts/` and `lib/`, plus each program's front door to start it, the agent's to preview a home and to sign in, and the web client's Node door to bundle the page it hands the gateway |

- **Programs never import each other.** They talk only through `contracts/`, as [the contracts](2-contracts.md) describe.
- **The CLI loads a program only to start it, plus the agent's front door to preview a home and to sign in.** Confirmed on 2026-11-20: `shrimpy agent context` previews what a home would tell its agent, and `shrimpy login` runs `pi-ai`'s sign-in. Each command imports its program's front door when it runs, so no other command loads it, and the lint names the files that may.
- **Shared plumbing stays plumbing.** Shared code may remove repetition around Pi, but it adds no concepts of its own: no registry, discovery or lifecycle. `lib/link` wraps Chord's links once for every program and client, and `lib/follow` turns a read and a watch into what a Chord object follows. The test is whether a module could be deleted and inlined into its callers in an hour with no change in behavior. If deleting it would mean redesigning the programs, it has become the service framework this plan doesn't build. Check `lib/`'s size at each review pause.
- **Contracts carry Shrimpy's own shapes, never Pi's.** Only `agent/` imports Pi's durable runtime, and `pi-ai` with it, apart from tests. `agent/sessions/` is the one place that turns Pi's records into the session view clients see, and `agent/turns/` the one that says why a turn ended without an answer in the contract's words. A Pi upgrade can then change the agent without touching a client.
- **Inside the agent, a file that needs Pi says so in its name.** A file imports Pi's durable runtime only if it is named `*.durable.ts` or is a module's `durable.ts` door, as `*.node.ts` marks what needs Node. Inside a module, a file that isn't marked can't import one that is, so plain code never reaches the engine. The files at the top of `agent/` wire the modules together, so they may import a marked door, and still can't import the package unless they are marked themselves.
- **Chord stays where programs meet,** settled in the build on 2026-11-14 with the move to Pi 1.5.2, and yours to change. It keeps replacing Chord, or keeping a fork of it, as bounded as Durable is. `contracts/` imports it, since a contract is a Chord object type, and so do `lib/link` and `lib/follow`. In a program or a client, only the modules that make its host, serve its objects or hold another program's import it, and the lint names them: the files at the top of each program, the gateway's `hello/`, `programs/` and `served/`, the chat server's `served/`, the agent's `links/`, the clients' `network/` and the CLI's `talk/`. Chord's `context`, `json` and `delta` entry points go wherever Pi's durable runtime may, since the runtime is written in their types. Tests and `testing/` modules may import any of it. A rule by folder fits here, where it didn't for Durable: code that talks to another program belongs in the module that does.
- **Only `clients/console/draw/` imports `pi-tui`,** and only from the package root, because `pi-tui` has no exports map to stop deep imports. Nothing else in the console imports the drawing, and the modules both clients share import no client, so the state and the words are tested without a terminal.

## Inside each module

Keep this simple:

- Every module has one front door, `index.ts`. A file imports files in its own directory or another directory's front door, and nothing else. `contracts/`, `lib/` and `clients/` only group modules, so they have no door of their own.
- Each front door opens with a short comment saying what the module is for and what it must not know about.
- Tests sit next to the code they cover, as `*.test.ts`.
- A module whose API partly needs Node offers that part through a second door, `node.ts`, with its Node files named `*.node.ts`. A module that needs Node throughout has `node.ts` as its only door. Browser-safe code can't import either: that's the web client, the contracts' main doors, and the main door of every `lib/` module and of each module both clients share, with everything behind it.
- A module of the agent whose API partly needs Pi works the same way, with a second door, `durable.ts`, and its files named `*.durable.ts`. A module that is Pi throughout has `durable.ts` as its only door.
- Test support lives in a `testing/` module that only tests import.
- ESLint enforces the import table, the front doors, the Pi package rules and the tiers of the agent's modules from a module's first commit, through one local rule in `lint/boundaries.js` with its own tests. `npm run check` runs types, lint and tests.

## Where the words are

Every sentence a model or a person reads is kept in a few files, so that wording is found and changed in one place and no logic has to be read to do it.

| What | Where |
|---|---|
| What every agent is told | `agent/context/base.ts`, one function that returns the whole text |
| How an input reads to the model: a message, a wake-up, a trigger's occurrence, a question's result, breadcrumbs, and where the session is; and what `check_back` and `ask_agent` both tell the model of ending its turn and of a wait too short or too long | `agent/inputs/prompt.ts` |
| What a tool says: its description, its arguments and its answers | `words.ts` in the tool's module: `agent/message-tools/`, `agent/wakeups/` and `agent/questions/` |
| The skills Shrimpy ships | `skills/<name>/SKILL.md` |
| A sentence that names a client's key or gesture, such as the line of keys and how to quit | The client's own: `clients/console/draw/words.ts` for the terminal |
| Everything else a client shows | `clients/view/words.ts` |
| Why a turn ended without an answer, with what to do, as receipts, `/status` and `sessions read` say it | `contracts/agent/failures.ts`, since the agent and every client say it the same way |
| How a session is said: what it is doing, where it is, its tool calls, a reset, its model, what it has used and a wake-up it waits on, as the terminal and the `sessions` commands say it; and a model as `provider/id`, wherever the agent or a client writes one | `contracts/agent/words.ts`, since every client says it the same way |
| What to do when the gateway doesn't know a home's token, that no agent runs at a home, and that a file which must start with front matter doesn't | `contracts/agent/`: `membership.ts`, `connect.node.ts` and `frontmatter.ts`, since the agent and the commands say them the same way |
| What a receipt tells a person, as the terminal, `read` and `run` say it; how a thread, a room, a channel and its members are written, and a room as the command that adds a member takes it; and what a reader is told when they are in no such room, can't join a DM, aren't a member, or have not talked to someone yet | `contracts/chat/words.ts`, since chat's refusals, the agent and every client say them the same way |
| What a client tells a person to start when the gateway, the chat server or an agent isn't linked | `contracts/gateway/words.ts`, since the commands and the terminal say it the same way, each with a first sentence of its own |
| The rule a name follows, what is said to a hello that can't be read or comes from another version, and that the roster has no such member | `contracts/gateway/`: `names.ts`, `hello.ts` and `roster.ts`, since the gateway, chat, the agent and the clients say them the same way |
| What a command for agents does, in the one line a client shows beside it | `contracts/chat/commands.ts`, since every client shows the same |
| What an agent says in a thread about `/model` | `agent/chat/model-command.ts` |
| A command's usage and help | The command's own file in `cli/commands/` |

`shrimpy agent context` prints what an agent would be told, put together from its home as it is now. A test holds every `shrimpy` command line in these words to the commands the CLI has.

## The clients' modules

Decided on 2026-11-21, with the two mockups in front of you: "sure, track it in the docs. but i want to get building asap". The terminal and the web client are one client, drawn twice. They share what a client knows, does and says, and each keeps only its drawing and its input. The move below was built that day, with no change in behavior, then the views by level, and `look/` on 2026-11-22. The terminal still draws as it did, and the web client is a placeholder page.

Three of the terminal's four modules had no terminal in them, about 3,500 of its 4,500 lines, and moved up to be shared. Node reached them in three files. Two dialed the gateway: the link is now handed how to dial, and the console hands it the Node way, which is behind `network/`'s `node.ts` door. The third took a request's ID from `node:crypto`, and now takes it from the `crypto` that Node and a browser both have.

```text
src/clients/
  look/       the colors of dusk and day, the wordmark, and a sigil's twelve lines as dots, half blocks or a path
  network/    the link to the gateway, kept across losses, and the objects held through it: apart from tests,
              the only client code that imports Chord
  state/      what a client knows, what is open at each level, and what the person can do
  view/       what is shown, as plain text and facts, a level at a time, with the words
  console/    the terminal: `pi-tui`, which level is in front, the keys and the sentences that name them,
              and a socket or an address to dial
  web/        the browser: the page, the pointer and the keys, a WebSocket to dial, and what a phone needs
```

| Module | Its one job | Knows a terminal or a browser |
|---|---|---|
| `look/` | How Shrimpy looks, as data: each color of dusk and day by name, what each pigment is for, the wordmark, and a bitmap of twelve lines turned into braille dots, half blocks or an SVG path. | Never |
| `network/` | One link to the gateway, kept across losses, and the objects held through it. It is handed how to dial, and offers dialing from Node behind its `node.ts` door. | Never |
| `state/` | What a client knows, what is open at each level, and what the person can do. | Never |
| `view/` | What each level shows, as data, and every sentence said of it but those that name a key or a gesture. | Never |
| `console/` | Drawing in cells, which level is in front, the keys and the sentences that name them, and the socket or address to dial, which it hands the link with `network/`'s Node dial. | A terminal |
| `web/` | Drawing in the page, the pointer and the keys, dialing from a browser, installing and push. | A browser |

**What is shared is what is true and what is said.** How it is laid out and how it is touched stays with each client. The test is whether the other client would be wrong if it differed: `working · #ops` differing is a bug, and where the list sits is not. A sentence that names a key or a gesture belongs to the client that has it. Everything else a client says is in `view/`, and a sentence in either client's drawing is a mistake.

**A view is of one level,** since 2026-11-21, because both mockups show the levels side by side. The state says what is open at each level, and not which screen is in front: whose list is open, an agent's or a room's, and the thread or the session behind no thread open in it, with whose side of a thread is on show, the conversation or one agent's view of the session behind it. Opening another list closes what was open in the one before. `view/` has a view for each level, each a function of the state: agents and rooms, the open list, the open thread, and the session on show. A view carries everything a client might draw and leaves the drawing to it: every agent's work and every wake-up in a thread, what is new to the person on each thread, agent and room and in all, and how each agent looks. Each client decides how many levels it shows at once, which one is in front, and how to go back. The terminal still shows one at a time. A client says whether the person is looking, and the state moves the read mark of the thread they look at: the terminal says so while it has the thread in front.

**Imports.** `look/`, `network/`, `state/` and `view/` import `contracts/` and `lib/` by their main doors, which are safe for browsers, and each other in that order: each imports only those before it. None of the four imports `console/` or `web/`, `pi-tui` or the page, and their main doors reach no `node.ts` door. Dialing from Node is behind `network/`'s own `node.ts` door: the console hands it to the link, and their tests reach a real gateway with it. `console/` and `web/` import the four, and never each other. The helper that bundles a contract's door for a browser bundles each of their doors too.

**The web client is a thin projection.** It reads the views, calls the moves, and holds only what a page has: what is folded, where a list is scrolled, what is typed. Five choices in it are yours to strike. It is drawn with Preact in TSX, so that a component is tied to a view's type. esbuild bundles it when the gateway starts, so nothing is built by hand, and esbuild becomes a dependency where it was a development one. Its styles are the web mockup's, with the colors written from `look/`. An agent's Markdown is read with `marked`, which `pi-tui` already brings, and made into the page's elements, never set as HTML. Its face, Atkinson Hyperlegible, comes as font files in two packages, `@fontsource-variable/atkinson-hyperlegible-next` and `-mono`, which the page's door serves with the page.

**What must not change by accident.** The move changed no behavior and reworded nothing. The terminal's tests pass as they were, with their imports moved.

**A browser's link is tried.** On 2026-11-21 a real browser linked to the gateway through Shrimpy's hello, at the page's door, as [the network](6-network.md) has it. The bundle is about 424 KB, most of it Chord's.

## The agent's modules

Approved on 2026-10-05 and built that day. Each module has one job.

| Module | Its one job | Touches Pi |
|---|---|---|
| `inputs/` | What an input is, from any source, how it reads to the model, and how its turn can end, with what the tools that come back later tell the model of ending its turn and of how long to wait. Data and words. | Never |
| `home/`, `links/`, `access/` | The home's files, the link to the gateway and what is held over it, and who may do what. | Never |
| `host/` | Opens the engine, and is the only place that does, with what the modules share of it: reading a kind of task a page at a time, ending the tasks a session leaves open, what a task ends with when it is done or aborted, ending one that failed and saying so, a tool's answer, and what names a request a tool call makes. | Throughout |
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
