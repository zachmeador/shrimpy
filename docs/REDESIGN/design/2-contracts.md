# 🦐 The contracts between them

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

A contract says what a message, a session view and a registration are. Agents on other machines, other versions and other clients depend on these.

**The design**

Clients use two APIs, each the same for local and gateway-routed use. The chat server's API covers channels, threads, members, posting and reading messages with their attachments, and subscriptions. Each agent's API is a set of concrete operations:

- session inspection and selection
- reset, fork, steer, status, wait, withdraw and stop
- model, thinking, defaults and reload
- raw and effective context, entry queries and subscriptions
- completion against the agent's filesystem
- publication and chat-provider status, trigger and delegation controls
- receiving the attachments of offered messages into the agent's home

Commands, clients and tools call the same operations. Which of them get a command follows the [rule for commands](using-it.md).

**Contracts are Chord objects,** since the move to Pi 1.5.2 decided on 2026-11-14. Pi 1.2 removed `pi-client`, `pi-server` and `pi-protocol`, which the first build used, and Chord 1.5 has one kind of contract: an object type. Its params pick which object, its members are state and methods, and every reference to it is live, the same locally and across a link. So a client follows the member list, a channel's threads, an agent's sessions or a session view by holding it, and nothing polls. Every program connects out to the gateway, which relays requests to it by address, as [the network](6-network.md) has it. Chord carries everything Shrimpy ships: the terminal, the web client, the CLI, the chat server and each agent. Plain HTTP is added only when a program that can't speak Chord needs in, and not yet. Sockets live in a short runtime directory, because macOS caps Unix socket paths at 104 bytes.

Contracts carry Shrimpy-owned shapes only: the agent builds the session view that clients draw, so no client depends on Pi's record types or values. The session view is a window over the session's whole history, with compactions and resets marked, and a client pages back through it. Clients talk through threads and watch through sessions. Attaching straight to an agent covers watching, steering and stopping, including while the gateway is down. What a client shows of finished work is stored first. A partial answer and running tool output show as they arrive and are stored within a second, so a crash can take back up to a second of what a live session view showed. Help, status and editor state stay local and never enter the transcript. Completion and shell input run against the agent's paths, never the client's cwd, so an attached console asks the agent for completions instead of reading a local directory. Clipboard files and images attach to the message you send, like any other attachment, with provenance and size limits.

**A refusal is part of the contract.** A program that says no on purpose gives words for a person, with what to do. Where a client acts differently on the case, the refusal also carries a reason that the contract lists, such as `name_taken` or `agent_running`, and a client never reads the words to tell. Chord's own errors are left for real failures: a dropped link, revoked access, a contract that doesn't match.

**Peers stay compatible within a major version, on one set of Pi packages.** From 1.0.0 any two releases of one major link when they run the same Pi packages, since the program that serves a contract keeps serving every version of it the major has shipped. So the gateway's machine updates first, and older programs and clients keep working. Chord's wire has changed without a new protocol version, so programs compare the exact set of Pi packages when they connect and refuse a mismatch, saying what to run where, and refuse another major the same way. A release that changes the Pi packages reaches every machine together. How versions count, and what waits while machines catch up, is under *Versions* below.

**A contract carries facts.** What a fact means to whoever reads it is the reader's decision. You confirmed this on 2026-10-05.

- **A fact** is something that happened or is so. It stays true whoever reads it and whenever: who wrote a message, when, and which members its text names.
- **A decision** is what one reader does about a fact: whether a message is for it, whether to wake, whether it can't wait. Two readers can decide differently about the same fact, and one reader can change its mind later.

It matters most in contracts for two reasons. Programs on other machines and of other versions read them, so a decision in a contract is made for all of them at once. And the chat store keeps what the chat contract carries, so a decision written into a message stays as it was worked out on the day the message was written.

A question to ask of any new field in a contract: could two readers want to treat it differently, or could one want to change how it treats it later? Then the contract carries the fact, and each reader decides.

*The case that showed it.* The chat server marks every message with who it is `addressed` to: the other member in a DM, and in a room those the text mentions. That is one field doing two jobs.

| Where | What `addressed` holds | What that is |
|---|---|---|
| In a room | The members the text mentions | A fact about the message |
| In a DM | The other member, whatever the text says | The chat server's decision that a DM message is for the other member |

Five messages from you show the difference. Scout and bob are agents.

| You write | Where | `addressed` | `mentions` |
|---|---|---|---|
| `hello` | Your DM with scout | scout | nobody |
| `@scout stop that` | Your DM with scout | scout | scout |
| `hello` | A room with scout and bob | nobody | nobody |
| `@scout hello` | The room | scout | scout |
| `@all hello` | The room | scout, bob | scout, bob |

In a DM the first two rows look the same, so the fact is lost there. Your rule that a person's mention joins the turn an agent is running needs to know whether a DM message mentions the agent, and the event can't say, so the agent reads the text again with a function the chat server and the agent share through the contract. `addressed` came in with the first contract on 2026-10-03, when only DMs existed and the two jobs looked the same. The plan had said only that the chat server owns "addressing and mentions" and that agents decide what wakes them. The build filled the gap, and nobody raised it.

Leaving it had four costs. An agent's rule for DMs was written in the chat server, though agents decide what wakes them. Stored messages held the decision as the rule of their day worked it out. Two programs shared a rule for reading text. And each new reader had to work the fact out again.

*What the rule leaves alone.* The three contracts were read for another field that mixes a fact and a decision, and `addressed` is the only one. A receipt's status is the agent's own statement of what it did. Whether a member is an admin, or reachable, is a fact. The chat server refusing a room to someone who isn't an admin is a permission it enforces over what it owns, which is not the same as deciding what a message means to its reader.

*Ways it wasn't done.* Carrying both fields would fix the lost fact and leave the chat server deciding what a DM message is for, with two fields that mostly agree. Recording neither and letting each reader read the text can't be done right later: names change and members come and go, so who `@maya` or `@all` meant is known only when the message is written, by the program that has the room's members then. That is why mentions are a fact the chat server records.

**The contracts as Chord objects**

The design for the move to the latest Pi, written and settled in the build on 2026-11-14, under "decision 1 i trust your judgement on". The choices listed below are yours to strike. It builds on what was decided that day: the gateway is Chord's relay, every program links out to it, and clients hold live objects.

*Hosts.* Chord calls every participant a host, and routes each request by the address of the host that serves it. Three kinds of host have addresses:

| Host | Address | Its parent link | Takes links from |
|---|---|---|---|
| The gateway | `gateway()` | None | Clients, on its own socket and its entry, and programs, as their routes |
| The chat server | `chat()` | To the gateway | Nobody |
| An agent | `agent({ id })`, with its member ID on the roster (and a separate home-socket host at `agent({ id: "home" })` with no parent link) | To the gateway, while it is linked | Clients, on its home's own socket |

Clients are hosts with no address: the terminal, each `shrimpy` command that talks, and later the web client. A client serves nothing. It holds objects over one link, to the gateway, or by a home's path to that one agent. An object's params pick it, and its host's address is worked out from them, so every type an agent serves has an `agent` param: `Session({ agent: "mem_4k9x2m7q0b3d", session: "th_8" })` reaches that agent wherever it runs. Each program loads its object types once, when it starts, and nothing reloads.

*Who is asking.* Chord stamps a principal on every request and keeps a separate object for each principal. A host believes the principal a request carries only on its parent link, which for a program is its link from the gateway.

```ts
type Principal =
  | { kind: "person"; member: string; way: Way } // you
  | { kind: "agent"; member: string; way: Way }  // an agent's program, or a command in its shell
  | { kind: "home" }    // a client on an agent's home socket, and the agent's own requests
  | { kind: "chat" }    // the chat server's own requests
  | { kind: "gateway" } // the gateway's own requests

type Way =
  | { kind: "socket" }             // the gateway's own socket, with no token
  | { kind: "device"; id: string } // a device's token
  | { kind: "token"; id: string }  // an agent's token

type Revocation =
  | { way: string }    // a token taken back or replaced
  | { member: string } // an agent removed from the roster
```

| Link | Who stamps it | With |
|---|---|---|
| A client's, to the gateway | The gateway, from the client's way in | `person` or `agent` |
| A program's, to the gateway | The gateway, from the program's hello | `agent` or `chat` |
| The gateway's, to a program | The gateway, on each request it relays | Whoever asked |
| A client's, to an agent's home socket | The agent | `home` |

- No principal carries a name or whether it is an admin. Names change and a promotion counts at once, so the program that is asked reads both from the roster, which it holds live.
- `way` is the provenance. Two of your devices hold separate objects, and taking one device's token back ends only what it holds.
- `revokedBy` gives `[{ member }]` for a person or an agent, plus `{ way: id }` for a device's token or an agent's, and nothing for the rest, which the operating system guards. Taking a token back or replacing it revokes `{ way }`; removing an agent revokes `{ member }`. Chord's `revoke` at the gateway ends every matching object there at once, closes matching clients' links, and passes down to every program, which ends matching objects too. Its objects at the gateway end as `forbidden/revoked`, which a client shows as access revoked. Chord closes the client's link in the same turn, so its holds at programs end with the link rather than as revoked. Chord leaves a route link open, so for an agent's token or a removed agent the gateway closes the agent's own link as well.

*Answers and refusals.* A method answers `{ kind: "done", value }` or `{ kind: "refused", words, reason }`. The words are for a person and say what to do. The reason is null unless the contract lists the case. `Channel`, `Thread`, `Agent` and `Session` each have a `refusal` member: null, or a refusal like a method's when the object doesn't exist or the caller may not see it, and then the rest of its state is empty. It follows the live roster, so a promotion shows at once. Chord's own errors stay for a dropped link, revoked access, a contract that doesn't fit and a program that isn't connected.

The contracts list three reasons. All three come when connecting, and the agent answers each with advice about the home's files: `name_taken`, `unknown_token` and `agent_running`. The CLI connects as a client, which only `unknown_token` turns away, and answers it with advice for an agent's home and for a machine of yours. `needs_admin` and `read_only` go, since no client acts on them. Their refusals still say who the admins are, and a thread says whether its caller only reads it.

*The gateway's contract.* `register`, `calls`, `ticket`, `redeem` and `version` go. A program's link is its registration, requests reach it over that link, the relay's stamp says who is asking, and the hello and Chord's heartbeat do what `version` did. `join`, `joinMachine` and `signIn` become the hello, below.

`Roster`, at `gateway()`, with no params:

| Member | What it is | Today |
|---|---|---|
| `id` | The roster's ID, made once with its file, which each home keeps | Added on 2026-11-20 |
| `you` | The member the caller is, or null for a program that isn't one | What `signIn` answered |
| `members` | Everyone on the roster, oldest first, each with whether it is an admin and whether it is reachable | `members` |
| `programs` | The programs linked now: kind, name, member and the Shrimpy version each gave in its hello | `list` |
| `turnedAway` | The programs the gateway turned away for the release they run, each with the Shrimpy version and Pi packages its hello gave, until it links: an agent whose token the roster knows, and the chat server on the gateway's socket. A client says from them which machine to update | New on 2026-11-23 |
| `ways` | Each way in, with its ID, its member and a device's label: all of them for you, the agents' for an admin, and none for anyone else | New, from [identity](3-identity.md) |
| `invite({ name })` | An invitation for a new agent, or to replace an existing agent's token on its entry. Only you or an admin, refusing the person's name, while the gateway listens on an address | `invite` |
| `inviteDevice()` | An invitation for a device of yours, with the address of the page's door for a browser. Only you. The device is named for the machine it joins from | `inviteMachine` |
| `promote({ member })`, `demote({ member })` | The agent as it now is. Only you or an admin | The same |
| `remove({ member })` | Removes an agent, revoking `{ member }`, dropping its link, withdrawing its invitations and freeing its name. Only you or an admin; you can't be removed | Added on 2026-11-20 |
| `takeBack({ way })` | Ends a way in at once. You take back any, and an admin an agent's | New, from [identity](3-identity.md) |

`Notifications`, at `gateway()`, with no params, is where the chat server hands the gateway what to tell you on your devices, as [the conversation model](4-conversation.md) has it:

| Member | What it is | Today |
|---|---|---|
| `notify({ from, room, line, thread, unread })` | Sends a finished notification to each device of yours that has a place to be told things, and answers once every push service has answered or given up. Only the chat server | New on 2026-11-21 |

`WorkspaceContext`, at `gateway()`, with no params, is the [workspace context](5-home.md):

| Member | What it is | Today |
|---|---|---|
| `files` | The Markdown files of `context/` in the Shrimpy folder where the gateway runs, each with its full path on the gateway's machine and its text, in order of path. The same for every caller | New on 2026-11-23 |

*The chat contract.* `enter` goes: the relay says who is asking, and `you` says whom chat takes the caller for. Holding a `Thread` is what attaching to it was.

`Chat`, at `chat()`, with no params, is the caller as a member of chat:

| Member | What it is | Today |
|---|---|---|
| `you` | Whom chat takes the caller for | What `enter` answered |
| `channels` | The caller's channels, oldest first | `channels` |
| `readOnlyChannels` | The channels the caller reads and isn't in: every other one for you, none for an agent | `readOnlyChannels` |
| `head` | The position of the newest event in the caller's channels | `head`, which was the whole server's |
| `store` | The chat store's ID | `store` |
| `events({ after, limit })` | The events after a position, oldest first, at once, and maybe none. An agent watches `head` and asks when it passes its place | `feed`, which waited |
| `leaveReceipt({ events, receipt })` | Leaves the caller's receipt on events | `leaveReceipt` |
| `setWorking({ thread, working })` | Marks the caller at work in a thread, until it says otherwise or the hold on `Chat` of the program that set it ends, as when its link drops. An agent and a command in its shell are two holds | `setWorking` |
| `openDm({ member })` | The DM with a member, made on first use | `openDm` |
| `createRoom({ name, members })` | A new room. Only an admin | `createRoom` |

`Channel`, at `chat()`, with params `{ channel }`:

| Member | What it is | Today |
|---|---|---|
| `refusal` | Null, or why the caller can't have this channel | Each call's refusals |
| `channel` | The channel: its kind, name and members | In `channels` |
| `threads` | Its threads, archived ones too, the most recently updated first, each with who is working in it | `threads`, which clients polled |
| `unread` | How many messages are new to the caller in each of its threads, by the thread's ID, from the caller's read marks. Null for an agent | New on 2026-11-21 |
| `createThread({ name })` | A new thread | `createThread` |
| `addMembers({ members })` | Adds members to a room. Only an admin | `addMembers` |

`Thread`, at `chat()`, with params `{ thread }`:

| Member | What it is | Today |
|---|---|---|
| `refusal` | Null, or why the caller can't have this thread | `attach`'s refusals |
| `thread` | The thread, with who is working in it | The thread view's `thread` |
| `messages` | Its newest messages, at most 200 | The thread view's `messages` |
| `earlier` | How many older messages there are | The thread view's `earlier` |
| `readOnly` | Whether the caller only reads it | Worked out from `readOnlyChannels` |
| `unread` | How many messages others wrote after the caller's read mark. Null for an agent | New on 2026-11-21 |
| `markRead({ message })` | Moves the caller's read mark up to a message, and never back. An agent is refused | New on 2026-11-21 |
| `read({ before, limit })` | Older messages, oldest first | `read` |
| `post({ text, request, quiet })` | Posts a message. A request ID's first use wins. One posted with `quiet` is told to nobody's devices | `post`, and `quiet` is new on 2026-11-21 |
| `edit`, `delete`, `react` and `unreact` | As today, each naming its message, and each answering with the message as it now stands. Each carries a request ID, whose first use wins, as a post's does | The same, and the request ID is new on 2026-11-23 |
| `rename({ name, revision })`, `archive({ archived, revision })` | The thread as it now stands. Each names the thread's revision it was decided on, and is refused once the thread has moved on, unless the thread already holds what it asks | `renameThread`, `archiveThread`, and `revision` is new on 2026-11-23 |

`Presence`, at `chat()`, has no params and no members. The gateway holds it, as below.

*The agent's contract.* `enter` goes: a request through the gateway carries its stamp, and one on the home's socket is `home`. Holding a `Session` is what attaching to it was.

`Agent`, at `agent({ id: agent })`, with params `{ agent }` (the agent's member ID through the gateway, or `"home"` on its home's own socket):

| Member | What it is | Today |
|---|---|---|
| `refusal` | Null, or why the caller may not watch this agent | Each call's check |
| `sessions` | Its sessions, each with where it is and whether it is working | `list` |
| `triggers` | Its triggers, each with when it is due and how its last occurrence ended | `triggers`, now live |
| `models()` | The models it can use now, and the one its sessions follow | `models` |
| `trigger({ name })` | One trigger, with its definition and its recent occurrences | `trigger` |
| `fire({ name })` | Fires a trigger once, now | `fire` |
| `reload()` | Reads the home's files again, now | `reload` |
| `sigil`, `pigment` | The agent's look: its sigil's twelve lines, or null when its home has none it can use, and its pigment | New on 2026-11-21 |
| `folder({ path })`, `file({ path })` | A folder of the home as a list, and one file as text or as an image. Read-only, for whoever may watch the agent | New on 2026-11-21 |

`Session`, at `agent({ id: agent })`, with params `{ agent, session }`, where `session` is its address at the agent: a thread's ID, or `trigger:` and a trigger's name.

| Member | What it is | Today |
|---|---|---|
| `refusal` | Null, or why the caller can't have this session: the agent hasn't made it yet, or the caller may not watch | `attach`'s refusals |
| `window` | The newest items, each naming the entry it came from, and the entry just before them, or null at the session's start. A partial answer shows before it is stored | The session view's `items` and `entries` |
| `status` | What it is doing, what waits, the wake-ups it waits on, why its last turn ended without an answer, its model and its usage | The session view's `status` |
| `read({ before, limit })` | The items from an entry back, that entry included, and the entry before them, so pages chain from `window.before` | New: paging |
| `steer({ text, request })` | Puts input into the session. A request ID's first use wins | `steer` |
| `wait({ submission })` | How an input ended, once it has. A dropped link fails the call, and the caller asks again | `wait` |
| `stop()` | Stops the session's work | `stop` |

`Presence`, at `agent({ id: agent })`, with params `{ agent }`, has no members. The gateway holds it.

Server IDs go, with the paths that carried tickets and answered calls, `reachProgram`, `keepRegistered`, and an agent's second socket, the one the gateway piped to. The invitation's link, `machine.json`, a home's `state/member.json`, `SHRIMPY_AGENT_HOME` and the commands for agents stay. A home's `state/runtime/endpoint.json` keeps its socket's path, pid and name for `agent status` and `up`; clients on the home's socket hold objects at `agent({ id: "home" })`.

*Versions.* A change to a type bumps its version with Chord's `evolve`, and the program that serves the type maps each older version it still takes with `checkAccepts`. Chord checks a contract's fingerprint, a hash of its params and members, as well as its number, so two builds that disagree on what a version is wait on each other instead of misreading each other. A mapping gives an older caller what its own release did, and refuses a call only where that would be unsafe, with words saying to update. `Presence` has no members, so it never needs a new version.

Until the release, contracts change in place, since the only older programs are on your own machines, which update together. `Thread` is at version 3 and `Channel`, `Agent` and `Roster` at 2, each declared once at that number with no mappings, which kept its fingerprint. At 1.0.0 each contract keeps the number it has as its baseline, and a build from before it says `0.0.0`, so the hello refuses it as another major. After 1.0.0 a contract's version goes up by one with its first change after a release, and later changes before the next release edit that version in place. Every version a release of the major shipped stays served until the next major.

A consumer newer than the program that serves it waits with `contract_mismatch`. So every update goes to the gateway's machine first, since it serves chat and the roster to everyone, then to agents apart, then to your devices, and nothing should be newer than the gateway. While machines lag, talking works everywhere. What waits is a newer client, such as the page, watching an agent apart that hasn't updated, when the release changed `Agent` or `Session`. It shows words naming the agent and its version, and binds once that machine updates, as Chord's design says; that hasn't been tried across machines. Updating agents apart first would break talking instead.

A release that changes the Pi packages reaches every machine together. Chord keeps its protocol version at 1 while its wire changes: 1.5.1 added a flag to calls, and the normal form of fingerprints, which Chord counts as part of the link protocol, is at 2. And Pi releases every package at one version, so any Pi release changes Chord's. Shrimpy takes a Pi release only in a minor, and only when it needs something in it. Once Chord raises its protocol version for every wire change, programs compare that instead of the packages.

*Release numbers.* A patch holds fixes and changes no contract, stored format or Pi package, so patches mix freely and going back one always works. A minor may add contract versions while serving the old ones, migrate stored formats, and take a Pi release, which then reaches every machine. A major may remove things: the previous major's contract versions stop being served, the two majors refuse to link, and stores from two majors back stop migrating. Between releases `wip` says the next minor with `-dev`, such as `1.1.0-dev`, so a build from it is never taken for a release.

*Files.* `contracts/` also holds the files the `shrimpy` command shares with a program: a home's layout, `agent.json`, its wake and trigger files and its membership, the folder's default model, what a machine of yours keeps, and the addresses the gateway keeps. They aren't Chord objects and carry no version, since each is written and read on one machine by the command and the programs installed with it. A later release reads what an earlier one wrote, so they change only as [the home](5-home.md) says its files do.

*Words and calls.* `contracts/` also holds what more than one program or client says the same way: why a turn ended without an answer, how a session and a model are said, what a receipt tells a person, how a thread, a room and a channel are written, what a reader is told when they can't find or join one, what a client tells a person to start, and what is said of a name, a hello, a member the roster doesn't have and a home's membership. Each frames those words its own way. And `contracts/gateway` has the helpers for a call on another program's object, which the clients, the agent's link to chat and the tests use: the context the call runs in, its answer or its refusal, whether it was lost with its link, and an object held for as long as one piece of work runs.

*Connecting.* Before any of Chord's traffic, a caller and the gateway trade one JSON text frame each.

**The transport** is a WebSocket: over the gateway's Unix socket on its machine, over its entry from anywhere else, and later over its entry for a browser.

**The hello** gives the caller's Shrimpy version, the exact set of Pi packages it runs, and who it is:

| Who it is | Means | Where |
|---|---|---|
| `{ kind: "agent", name, token, roster }` | An agent's program. Linking never renames a recognized agent. A token the gateway doesn't know is refused as `unknown_token` over the entry, and on the gateway's socket when `roster` matches this roster's ID; otherwise it joins or reclaims a tokenless entry of that name | Either |
| `{ kind: "chat" }` | The chat server, which shows no token | The gateway's socket |
| `{ kind: "client", token }` | A client: you with no token or a device's token, and an agent with its token | Either. With no token, the gateway's socket only |
| `{ kind: "join", name, token, code, machine }` | `shrimpy join`. The agent `name` (new or existing), or a device of yours when it is null, joins with an invitation, and the gateway closes the connection. `machine` is the joining machine's name, which a device is labelled with | The entry |

**The answer** is `{ kind: "welcome", you, roster }` or `{ kind: "refused", words, reason }`, either one with the gateway's Shrimpy version and its Pi packages. A different set of Pi packages is refused with what to run where, and so is another major, a second program for one agent (`agent_running`) or a second chat server. A caller newer than the gateway is let in, and says so itself, from the version in the answer.

**Then Chord.** The caller wraps the socket as a Chord link and connects with the gateway as its parent. An agent learns its member ID from `welcome.you.id` and makes its network host at `agent({ id })` before connecting (replacing it if a new roster gives it another ID). The gateway accepts a client's link, stamped with its principal, and takes a program's link as its route.

An agent's home socket takes the same hello, with no token, and answers `welcome(null, null)`. The agent compares the Pi packages there too, and serves its objects on a separate host at `agent({ id: "home" })` with no parent link, stamping `home`. A client on the home socket works whether or not a gateway runs, and holds only this agent's objects.

Agents are addressed by their member ID (`agent({ id })`). Clients look up the member ID on the roster and show the agent's name from there, and a hold to an agent that is removed never binds to a new agent that takes its name later. Once the gateway has its key, the entry is TLS checked against the fingerprint a member keeps, and the hello happens inside it.

*A program's link as its route.* The gateway has a Chord route for each kind of program, `agent` and `chat`. Chord resolves an address only when something holds an object there, and a program closes a link whose handshake goes unanswered for 30 seconds. So the gateway holds the `Presence` of every program it knows, every agent on the roster and the chat server, from when it starts or an agent joins:

1. When a program's hello is welcomed, the gateway keeps its socket, wrapped as a link, as the one waiting for that address, and retries the address.
2. The route's `resolve` answers with the waiting link, stamped with the program's principal. With none waiting it refuses, saying the program isn't connected, and every holder waits with those words.
3. From then on the link carries the program's own requests up and every request for it down. The gateway's hold of its `Presence` being live is what `reachable` says.
4. When the link drops, Chord resolves the address once more, finds nothing waiting, and holders wait until the program's next hello.

`authorize` lets any principal through: what a caller may do is up to the program it asks.

*Links.* Chord provides `webSocketLink`, which takes Node's `ws` or a browser's WebSocket, `ipcLink`, and `memoryLinkPair`, which tests use. Over any link it brings its binary codec, the heartbeat, which pings after 15 seconds of silence and closes after 30, flow control, limits on each part and compression. It has no link for a Unix socket and no listener: an entry point checks who is calling and hands the link to the host. Shrimpy writes the rest, in a small module of `lib/`:

- A listener: an HTTP server on a Unix socket's path or an address, which upgrades to a WebSocket and turns away a web page that doesn't belong there.
- Dialing: a WebSocket to a socket's path, with `ws+unix:`, or to an address.
- The text frames before Chord, then `webSocketLink`, which takes binary frames only. The hello's shapes belong to the gateway's contract.
- Keeping a link: dialing again after a drop, after a pause that grows, and dropping the socket at once when the program stops.

So every link is a WebSocket, on one machine as well. Every link is untrusted, so Chord checks every message. `lib/connection` and `lib/offer` go with `pi-client` and `pi-server`.

*Choices you may want to see.*

1. The Unix socket carries a WebSocket, so Shrimpy frames nothing itself. Raw frames on the socket would be as small, and a second path to keep.
2. The gateway holds a `Presence` at every program it knows, so a program's route is there the moment it connects, and a request for one that isn't connected fails at once with words and binds when it connects.
3. Admin is read from the live roster by the program that is asked, never stamped, so a promotion or demotion counts at once on links made before it too, and an object's `refusal` changes with it. That closes a line on [status](../STATUS.md#identity-and-addressing).
4. `needs_admin` and `read_only` lose their reasons. `readOnly` on a thread is the fact a client acts on.
5. The feed is `head`, kept live, and `events`, which answers at once, in place of a call that waits, as Chord advises. `head` is the caller's own, which closes a line on [status](../STATUS.md#the-contracts-between-them). `wait` stays a call that waits.
6. A device is labelled with the name of the machine it joins from, so `shrimpy invite` takes nothing more, as one command for a person asks.
7. A connection makes one try at a code, so the guard of five wrong codes on one connection goes. A code's length and its fifteen minutes stay.
8. A refusal is an answer, not a thrown error. Chord's `PluginError` could carry one, but its details are outside the contract's schema.

*Open.*

- The rest of the agent's operations become members of `Agent` and `Session` as they are built.
- For Pi's developers: will Chord raise its protocol version for every wire change, and from when? Until it does, a Pi release reaches every machine together.

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Who a message is for | The chat server marks each message with who it is `addressed` to: in a room the members its text mentions, and in a DM the other member, whatever the text says. | A message records `mentions`: the members its text names as `@name`, and everyone in the channel but the author when it says `@all`, in a DM as in a room. What a mention means, and what a DM means, is each reader's decision: an agent's wake policy, its rule for a mention that joins a running turn, `/stop`, and what a client marks as for you. | Confirmed and built on 2026-10-05. |
| The transport | `pi-server`, `pi-client` and `pi-protocol` over Unix sockets, with services and replicated state, and a WebSocket bridge for a browser | Chord 1.5 objects with live state, over links that every program opens to the gateway, as the design above has it. | Confirmed on 2026-11-14, with the move to Pi 1.5.2: "that's a given" |
| How peers stay compatible | Every program runs the same version, and a mismatch is reported and nothing refused | Versioned contracts with mappings, and the exact set of Pi packages compared on connecting, with a mismatch refused. From 1.0.0 every release of a major links with every other on the same Pi packages, the gateway's machine updates first, and a Pi release comes only in a minor and reaches every machine together. Contracts change in place until then, and count from where they are at 1.0.0. | Confirmed on 2026-11-14, and the rest on 2026-11-23: "sounds good" for the window and the order, "alright" for Pi, and "yep" for where versions start. Until then this was the open question to decide first |
| What a release's number means | Every build says `0.0.0` | Patch, minor and major as *Release numbers* above has them, with `-dev` on builds between releases. | Confirmed on 2026-11-23: "yep" |
| Refusals | The reason rides inside the old Chord's error code, which passed any string | Refusals are the contracts' own shapes, with a reason only where a client acts differently. | Confirmed on 2026-11-14 |
| What a live view shows | Only what is stored: clients render committed views | Finished work is stored before it shows. A partial answer and running tool output show at once and are stored within a second, Pi's default. | Changed on 2026-11-14 |

**Not built yet**

*The rest of the agent's operations,* as daily use asks for them: reset, fork, withdraw, thinking level, defaults, context queries, completion, provider status, delegation and attachments.

*Versions,* as decided on 2026-11-23. By the release, Shrimpy says `1.0.0`, and `wip` the next minor with `-dev`, and the release writes its contracts down in `src/contracts/released.json`, as the test of the contracts asks at a release.

**Built on 2026-10-05**

- In the contract, a message has `mentions`: the IDs of the members its text names as `@name`, and everyone in the channel but the author when it says `@all`, as the members were when it was written or last edited. Never its author. In a DM it is empty unless the text names the other member, and `@all` there mentions the other member. Only the chat server reads text for mentions, so the function that finds one is its own.
- The chat server works out mentions the same way in a DM and a room. The store's version is 7: it has `mentions`, lost the unused `answers_seq` column of `messages`, and has an ID. A store of another version is refused, and the refusal says to move the folder aside.
- In the agent, each rule says what it means:

| Rule | Before, with `addressed` | Now, with `mentions` |
|---|---|---|
| What wakes it in a DM | `addressed` includes it, which is always, because the chat server put it there | It is a DM and the other member wrote the message |
| What wakes it in a room | `addressed` includes it. Or the policy is `people`, a person wrote it and `addressed` is empty. Or the policy is `all` | The same, read from `mentions` |
| A person's mention joins the running turn | In a room, `addressed` includes it. In a DM, the text is read again | `mentions` includes it, in a room and a DM alike. Later the same day the rule became that any message a person writes joins it, which reads no mentions |
| `/stop` | For the agent when `addressed` is empty or includes it | In a DM, always. In a room, when `mentions` is empty or includes it. Since 2026-10-08 the chat contract says of each command who it is for in a room when it mentions nobody: `/stop` is for everyone, and `/model` for nobody |
| An answer wakes whoever asked | The agent's own message was `addressed` to the member who answered | In a room, its own message mentioned them. In a DM the reply wakes it anyway, so chat isn't asked for it |
| Who a message in a room was for, as the model is told | Worked out from `addressed` | Worked out from `mentions`, in the same words |

- The terminal doesn't read the field. `shrimpy read --json` prints every message whole, so its output has the new name.
- **The store's ID.** The chat store gets an ID when it is made, and the chat contract answers it with `store`. An agent keeps, with its place in the feed, the ID of the store that place is for, and asks for the ID each time it connects. A place kept for another store, or for none, is dropped: the agent reads the new store from its start and says so. A place past the end of the same store means the store went back to an earlier state, as when restored from a backup, and the agent reads it from the start too. So replacing the chat store needs nothing done to an agent's records.

