# 🦐 Pi Durable Replacement Plan

Updated: 2026-11-15
Status: experience decisions reviewed on 2026-10-03. The plan was reshaped around the core pieces on 2026-10-05, and the design moved into a file for each piece the same day. The new Shrimpy is the repo's root on `wip`, and old Shrimpy is in `shrimpy-old/`. A few interface and command details are left for the work that builds them.

Shrimpy's session machinery gets replaced with `pi-durable`. Each agent becomes an independent program: one resident process owns its home and its Pi storage. People talk to agents in threads kept by a chat server, from the console, the web app or chat providers such as Telegram, and clients can attach to an agent to watch and steer its work. Pi owns admission, queues, transcripts, task lifetimes, cancellation, compaction, recovery and committed observation. Shrimpy owns the home, the agent's context and tools, the clients, and the routes in.

The aim is fewer state machines, clearer ownership, and a smaller, better organized codebase. Switching engines doesn't license quiet changes to how people or agents use Shrimpy: every visible change is a row in a piece's Decisions table, under [the design](#the-design).

This file owns why, the direction, the words and the order of work. The [design files](#the-design) own the architecture and the experience decisions, and each one's Not built yet holds what isn't built of its piece. [STATUS.md](STATUS.md) lists where built code trails them, [your list](AUTHOR-TO-REVIEW.md) holds what waits on you, and the commit messages record what was built and why. Each of these has one home, and other files link to it instead of saying it again. [Reference docs](../../shrimpy-old/docs/reference/README.md) describe old Shrimpy.

## Why

Old Shrimpy's shape was discovered, not designed. It found good UX along the way and mostly works. This redesign keeps that UX and changes two things the old shape can't reach:

- **Agents everywhere.** Old Shrimpy needs its agents to share one runtime and one environment. The goal is lots of weird little agent friends on compute nearby and afar, united in Shrimpy land: each runs where it makes sense and networks to a gateway.
- **An intentional shape.** The code should be small, in distinct separate pieces with clear separation of concerns. LLM agents do most of the development, and they handle monoliths badly.

Four more reasons shape the design:

- Opening a terminal or web app and jumping into any agent's sessions is core UX. Staying coupled to Pi's terminal app prevents it.
- Pi's developers have more time for runtime architecture than Shrimpy does, so Shrimpy reshapes around their durable runtime.
- Keep it shrimple: rely on agents and Markdown where possible, and don't invent every wheel.
- Agents use chat rooms the way people do, and the end game is a real chat app.

## Direction

Confirmed during review:

- **Agents run independently.** Each agent runs in its own process, outside any gateway, and keeps working when clients or the gateway go away.
- **Every conversation is a thread in a channel.** A channel is a place: a DM with an agent, or a room with people and agents. It has a main thread, and side threads hold parallel topics. The console, the web app, Telegram and a future desktop app are all clients of channels; there's no separate way of talking to an agent from the console.
- **Sessions sit behind threads.** Each agent taking part in a thread keeps one current session for it: its private work. Work with no thread, such as a helper's, has a session too. Opening the terminal or web app, picking an authorized agent and entering any of its sessions to watch, steer or stop it is core UX, locally or through a gateway.
- **A chat server keeps channels.** It's a service of its own that holds channels with their threads, messages and attachments, and bridges chat providers in: the shared record of what was said. Agents keep their sessions, their own private work. That's the split between channels and sessions Shrimpy has today.
- **The gateway only connects things.** It handles discovery, access and routing between clients, agents and the chat server, and keeps the workspace's configuration: registrations, tokens and workspace context. It never hosts agents or conversations. Tailscale is the network to recommend for it, and is never needed.
- **Shrimpy leaves Pi's terminal app.** Shrimpy owns its session-client contract and presentation, reusing public `pi-tui` components where they fit.
- **Pi's durable runtime is the engine.** Shrimpy reshapes around it instead of wrapping it. Since 2026-11-14 that means Pi 1.5.2: Durable in each agent, and Chord's objects and relay between the programs. Earendil commits only its agent library and coding agent to MIT, and plans Fair Source and closed additions, so Shrimpy uses Pi's MIT libraries alone, as "Not building" below says, behind seams, with the pins and license check that [the programs](design/1-programs.md) describe. You aren't worried about ever having to fork: "i think in 1-2 years it'll be very simple to maintain something like that".
- **Chat providers are interchangeable.** Telegram is one chat provider among possible others, such as Discord or iMessage. Shrimpy's chat behavior lives in the chat server, and each provider only translates its own API. A desktop chat app, possibly a fork Shrimpy maintains someday, would plug in the same way; it isn't part of this plan.
- **Your phone is reached by Shrimpy's own client.** Decided in talk on 2026-10-08. Telegram was the convenient choice six months before, and you asked whether Shrimpy should supply it at all. The web client is built for a phone first, as a web app that is installed to the home screen and gets push notifications, so it reaches you where Telegram did and shows everything the terminal does. A companion app comes later and wraps the same pages with what the phone's system offers: "basically a browser view with ios integration stuff", and "home assistant's mobile app approach to me is perfect". A desk may get the same, as you said on 2026-11-21: "i think we should be open to a shrimpy electron (or idk if there's a better equivalent thing) in the near future. basically just the web app". It wraps the same pages. You chose Electron for it that day, and put a Mac app on the list to build: "then electron will be the choice. let's also add a native mac electron app to the list to build". No outside chat app is in the first release or planned after it: "forget about discord, telegram, buzz, etc. not on my radar at this point. still open to the idea of chat adapters because some people might really want to use a particular platform but they're not mvp".
- **Agents decide what wakes them.** The chat server offers each new channel message to member agents, and each agent's wake policy decides whether it starts a turn, as `channelPolicy` does today. By default an agent wakes for DMs, for mentions and for a person's message in a room that mentions nobody, and an included skill teaches agents to tune their own policy. Loop protection lives there too; nothing upstream filters conversation.
- **Sandboxing is a deployment choice.** An agent runs the same with or without a sandbox. When it is sandboxed, the sandbox wraps the whole agent process. Shrimpy doesn't sandbox individual tools, so agents keep a real shell.

This direction comes from the `REDESIGN` branch (2026-09-19): independent agent homes, a front door on Tailscale, one API for every client, and skills in place of subsystems. Its contracts built on Pi's `AgentSession` and its `shrimpy2/` scaffold are superseded here. It differs in one place: triggers, today's watches, stay in the agent's runtime instead of moving to OS schedulers ([see below](design/7-on-its-own.md)).

## Words

| Word | Means here |
|---|---|
| Agent | An enduring identity with its own home. Pi uses "agent" for the configuration a conversation runs with. |
| Channel | A place where people and agents talk, such as a DM or a room, kept by the chat server. |
| Thread | One conversation inside a channel. Every channel has a main thread. |
| Session | An agent's private work behind a thread, or behind work with no thread. Pi calls this a conversation. |
| Helper | A child session an agent starts to split up its own work. Pi calls these subagents. |
| Trigger | Anything other than a message that wakes an agent: a time, an interval or a check whose output changed. Today's watches. |
| Breadcrumb | A fact that comes with an agent's next input, once, when it is new to that session. It is one small file in the agent's home. |
| Chat provider | A bridge between a channel and an outside chat app, such as Telegram. |
| Chat server | Keeps channels, threads, messages and attachments, and bridges chat providers in. |
| Gateway | Connects clients, agents and the chat server, and keeps the workspace's configuration. It never hosts agents or conversations. |
| Workspace context | The shared `context/` files every agent reads, hosted by the gateway. |
| Member | You or an agent on the network: a network has one person, its owner, and any number of agents. A member has an ID that never changes and means nothing, and a name that can change. |
| Roster | The gateway's list of every member, with each one's ways in and who is reachable now. |
| Way in | What the gateway recognizes a member by: an agent's token, a device's token, or the gateway's own socket, which is you. |
| Device | One of your machines' Shrimpy folders, or a browser, let in as you with a token of its own. |
| Relay | The gateway's part in Chord: it routes a request to a program by address, over the link that program keeps open, stamped with who is asking. It replaces the first build's tickets. |

## The design

Each row has a decision status:

- **Keep:** the outcome stays the same. Its phase still has to prove it.
- **Change:** a recommendation waiting for your call.
- **Confirmed:** decided in review.
- **Open:** not decided yet.
- **Decided in the build:** a small mechanic the build settled under [core first](#order-of-work). Say so if you want it otherwise.

If implementation finds another visible difference, add a row before shipping it. That covers tool text and results, prompts, defaults, keys, command names, JSON, context, lifetime, retention, delivery, timing and cost. A prototype may skip features to answer a narrow question, but it must list what it skipped. Live cutover needs every affected capability kept or explicitly changed.

The design is in one file for each piece:

| Piece | What it covers |
|---|---|
| [The three programs and what each owns](design/1-programs.md) | An agent owns one home and its private work, the chat server owns the shared record of what was said, and the gateway owns who is on the network and how to reach them. They share only contracts. |
| [The contracts between them](design/2-contracts.md) | What a message, a session view and a registration are. Agents on other machines, other versions and other clients depend on these. |
| [Identity and addressing](design/3-identity.md) | Who a member is, how something is named and found, and who may message, watch, control or administer. |
| [The conversation model](design/4-conversation.md) | Channels, threads, a session behind each thread, receipts, and how an agent decides to wake and answer. |
| [The home](design/5-home.md) | An agent is a folder that works on its own. |
| [The network](design/6-network.md) | How an agent somewhere else joins and is reached, with nothing inbound. |
| [What an agent does without being asked](design/7-on-its-own.md) | Waking itself later, standing triggers, breadcrumbs, asking another agent and helpers. |
| [Using it](design/using-it.md) | The terminal, the web client, the commands, setup and sign-in. It is tuned through use. |
| [The code's layout](design/code-layout.md) | How `src/` is laid out, what may import what, and the rules inside each module. |

## Order of work

**Use it early.** Old Shrimpy's shape was discovered by using it, and this one gets the same chance. The new Shrimpy is used for real conversations while it is built. What turns out rough or missing decides the order of the work after that. Tests and review pauses don't replace this.

**The new Shrimpy is the repo's root.** Since 2026-10-04, on `wip`, old Shrimpy sits in `shrimpy-old/` as one unit: its code, tests and docs. Nothing there is built, tested or edited, nobody building the new Shrimpy reads its tests, and the release deletes it. Until then the new tree was a side folder, `next/`, which protected a live install that no longer exists; leaving old Shrimpy at the root meant its `AGENTS.md`, docs and tests reached every agent that worked here.

Development uses its own homes, sockets and data paths, so nothing touches a setup in use or the old workspace. `main` stays on old Shrimpy and Pi `0.84.4` until the release replaces it; there's no interim upgrade.

**Core first.** The new Shrimpy focuses on getting the core architecture and design right. A feature of old Shrimpy that isn't part of that waits until daily use asks for it. Until then agents are trusted to use the tools they have: searching Shrimpy's state with the shell, for one, instead of being handed memory breadcrumbs. The same goes for how things are worded and how a model behaves with the words: they are made correct and plain, then tuned through use. Effort goes to what has to be designed well because it is hard to change later. That is the shape. You named six pieces on 2026-10-04 and confirmed a seventh on 2026-10-05:

1. **The three programs and what each owns.** An agent owns one home and its private work, the chat server owns the shared record of what was said, and the gateway owns who is on the network and how to reach them. They share only contracts.
2. **The contracts between them.** What a message, a session view and a registration are. Agents on other machines, other versions and other clients depend on these.
3. **Identity and addressing.** Who a member is, how something is named and found, and who may message, watch, control or administer.
4. **The conversation model.** Channels, threads, a session behind each thread, receipts, and how an agent decides to wake and answer.
5. **The home.** An agent is a folder that works on its own.
6. **The network.** How an agent somewhere else joins and is reached, with nothing inbound.
7. **What an agent does without being asked.** Waking itself later, standing triggers, breadcrumbs, asking another agent and helpers.

Everything else sits on top of these and can change without touching them: wording, which extra tools an agent has, skills, memory features, terminal affordances and tests.

**No shortcuts reach a commit.** A boundary crossed for convenience, a missing front door, tests left for later and lint that isn't set up yet all get fixed before the commit, not after it. The quality work for a module, meaning its boundary lint, its front door and the tests that [earn their place](#order-of-work), exists before that module's first commit. A module whose behavior is covered by a test through the real path needs none of its own. A shortcut found later is fixed before anything else is committed.

**Tests earn their place.** A test protects something that would be missed: a seam between programs, starting, stopping, crashing and recovering, a promise this plan makes, or a bug that was actually seen. Nothing else needs one. A test doesn't pin wording or an internal shape. There are no tests of test support, of trivial helpers or of every permutation, and one test through the real path beats several on its pieces. When a change breaks a test that only recorded how things were, the test goes, not the change. Old Shrimpy's tests are a guide to nothing: they are deleted with the old tree, and nobody building the new one reads them.

**The README stays small.** It says how to run and check Shrimpy, the layout rules in short and the commands, in a table written from the CLI. Nobody adds behavior to it, and no copy of what the code does is kept anywhere else: the code, its tests and `--help` say it and stay current, and a copy that nothing keeps current misleads. It was cut back on 2026-10-05, from about 8,200 words, after each change had added to it.

**The build follows this plan, and every mismatch gets raised.** Slop piles up when code quietly drifts from the design. Whoever builds, a person or an agent, builds what this plan says. When the plan is wrong, unclear or silent, or the code can't follow it, that is raised with the user. It is never settled quietly in the code. Then the plan changes or the code does, so the two don't stay apart. A visible choice made alone in a build isn't decided. One that changes the design goes to [the author's list](AUTHOR-TO-REVIEW.md), a small one is noted in the message of the commit that made it, and a known gap goes into the list in [STATUS.md](STATUS.md).

Each review pause has a shape review against the [layout rules](design/code-layout.md) and a look at how large `src/` and its `lib/` have grown. [STATUS.md](STATUS.md) lists where the code trails this plan.

The order follows what daily use shows is rough or missing. Two things are built side by side when they barely share code, as rooms and triggers were. What is built, in order, is `git log`.

**Now:**

- Putting the move to Pi 1.5.2 on a setup in use: what Shrimpy wrote before it goes into an archive beside the Shrimpy folder, an agent elsewhere joins again with a new invitation, and your name goes in `settings.json`, as [the home](design/5-home.md) has it.
- In the terminal, `/devices invite`. [Not built yet](design/using-it.md)
- The clients. Built by 2026-11-22 and on `wip` since that day, when you opened them, found the web client short of its mockup, and had both gone through against their mockups and brought in line: the modules the terminal and the web client share, the terminal as its mockup has it, and the web client, built for a phone first, with push notifications. What is left is trying the web client on a phone, with a certificate and push, and a Mac app that wraps it. The web client doesn't hold up the release. [Not built yet](design/using-it.md)
- Cleaning up for the release, which you said on 2026-10-08 is close: the skills cover what a person and an agent do with Shrimpy, the reference documentation shrinks to very little, and old Shrimpy is replaced.
- Living with it: what you notice goes on the list in [using it](design/using-it.md), and decides what is built next.

**Next:**

- The home: compaction, the request a turn sent, and workspace context. [Not built yet](design/5-home.md)
- The conversation model: hearing a thread while working in it, and the demo that decides whether it stays. [Not built yet](design/4-conversation.md)

**Later:**

- The conversation model: an interface for chat adapters, with a fake one as its reference, kept as an idea as the direction says. [Not built yet](design/4-conversation.md)
- The network: agents everywhere. [Not built yet](design/6-network.md)
- What an agent does without being asked: helpers. [Not built yet](design/7-on-its-own.md)
- Using it: what daily use asks for. [Not built yet](design/using-it.md)

*Deferred on purpose.*

Work this plan defers on purpose, to pick up after cutover:

- Notifications on the desktop or in a chat app when work finishes while you're away. Your phone gets them with the web client.
- Codemode, as a [later experiment](design/4-conversation.md).
- A plain HTTP entry point, once a program that can't speak Chord needs in.
- Each context file as a prompt section of its own, so that a changed file is sent alone.
- A desktop chat app as the native client for channels.
- Seams that would let more of Shrimpy be built in parallel, to look at once the core contracts have settled: extensions in the agent as folders with one entry point that are handed the same few things; the chat provider interface with a fake provider as its reference; a client core that the terminal and the web client share; and landing a contract change on its own before the programs that follow it. No seam where only one thing will ever plug in: the gateway stays one piece.
- Events from outside apps, such as MCP events or webhooks. They would arrive as a chat provider's messages, not as triggers, so agents keep taking nothing inbound. Look again when all three hold: events are in an accepted proposal or a revision of MCP's spec, `pi-mcp` speaks protocol `2026-07-28`, and there is a server whose events an agent should react to.

**Not building**

This plan deliberately leaves these out, so they don't creep back in:

- Sandboxing for individual tools, as the [direction](#direction) says.
- A second run queue, transcript, task manager, outcome journal or activity cache beside Pi's.
- A receipt store beside Pi's that compares the content of retried requests. A request ID's first use wins.
- A compatibility layer for Pi's ordinary `ExtensionAPI`, or a generic service framework.
- A controller lease between clients, unless a real need appears.
- Heartbeat-based lock takeover or a PID ledger.
- A global scheduler, universal worker registry or network-wide job ledger.
- Automatic migration of old transcripts, tasks, manifests or clocks.
- Model calls to route ordinary input.
- Loop or flood control in the chat server or gateway, as [the conversation model](design/4-conversation.md) has it.
- Native MCP, per-request model routing, cache warming, vector memory, journaling daemons and transcription. Each is a separate future decision; codemode is a [later experiment](design/4-conversation.md).
- A gateway that more than one person shares, as [identity](design/3-identity.md) has it.
- Logins with a password, or a token for you on the gateway's own socket, as [identity](design/3-identity.md) has it.
- Depending on Chord's app kit, Pi's own apps or Earendil's hosted services such as Radius, or on anything that needs an Earendil account. Decided on 2026-11-14.
- A mesh protocol, ACP product, visual redesign or mandatory hosting platform.

**Release**

**Outcome:** an installable release with one engine, and the old tree is gone. You named it on 2026-10-09: **A Rising Tide**. "feels optimistic and it's reflecting on how much the FOSS agent harness world has flourished the last few months, and enabled this reshape". The terminal's first screen says it, with the version, which you expect to be `1.0.0`: "i think this is gonna be 1.0.0 actually". The code says `0.0.0` until the release is cut.

**Build**

- Account for every CLI entry, slash command, export, setup and update recipe, service definition, template, skill, test, doc and security statement. Help and completion come from the real command surface.
- Very little reference documentation. You said on 2026-10-08: "i'd actually like to move to very minimal reference documentation. shrimpy agents can just check the code if they need to. but instructions and skills should cover all of the core ux/agent-ex". So what an agent is told and the skills that ship carry how Shrimpy is used, by a person and by an agent, and the README and the developer docs are written for what the release ships, keeping the charming parts of today's. This folder goes at the release, as [its front page](README.md#when-this-folder-goes) says.
- A decision for every command and affordance of today's Shrimpy that hasn't come back, from what [using it](design/using-it.md) has of them.
- Updating Shrimpy, setting up through `shrimpy`, and moving over from old Shrimpy, from the list from living with it in [using it](design/using-it.md).
- Choosing the model an agent starts with from the terminal, which you called a priority before the release on 2026-10-06 ([using it](design/using-it.md)).
- `SECURITY.md`, `CONTRIBUTING.md` and `THIRD_PARTY_NOTICES.md` go with `shrimpy-old/` and are written anew, from [the keep list](keep-list.md).
- `AGENTS.md`, `README.md`, `docs/README.md` and `lint/boundaries.js` point into this folder, and are repointed when it goes.
- Default locations for machine-level data, and service installation for each program.
- The changelog starts over. On 2026-10-08 you had the notes of old Shrimpy's releases and its unreleased entries removed from `CHANGELOG.md`: "i say we purge all the old stuff". The [changelog skill](../../dev-skills/shrimpy-dev-changelog/SKILL.md) says how the release that replaces old Shrimpy is written, and that from then on a change adds its line in the same change. `AGENTS.md` is to say so too, from that release.
- Before `shrimpy-old/` goes, eleven of its idea docs come out of it. You want them rewritten for the new Shrimpy later, and left alone until then: "eventually i'll want to update these to reflect new shrimpy but not atm", 2026-10-08. From `docs/backlog/proposals/`: `session-001-generation-throughput-metrics`, `surface-009-telegram-managed-bot-skill`, `agent-003-shareable-agent-packages` and `workspace-002-tiered-checkpoint-retention`. From `docs/musings/`: `app-habitats`, `memory-design`, `story-worlds`, `promoting-browser-workflows`, `agent-specific-tui-surfaces`, `desktop-spotlight-surface` and `framework-design`. The other seventeen proposals and musings go with the folder.
- Delete `shrimpy-old/`, and with it `AppRuntime`, the session pool, leases, turn wrappers, gateway execution, control and watch state, private Pi imports and obsolete binaries, commands and dependencies. Remove any candidate scaffolding left in the new tree.

**Prove**

- Build, lint, package, lifecycle and full test runs in the isolated checkout.
- On macOS and Linux: install, first setup, tagged update, stop and restart, and uninstall without losing home data.
- Code and dependency deletion against old Shrimpy at `574bb2c`, resource use at startup, idle and under load, and remaining deviations and evidence gaps, all recorded in [STATUS.md](STATUS.md). Old Shrimpy there has 45,536 lines in `src/` and `extensions/`, 3,099 in `web/` and 27,026 in `test/`, blanks and comments included. On 2026-11-17 the new `src/` had 30,378 lines of product code, 13,795 of tests and 3,960 of test support.

**Gate:** if client and framework complexity outweigh the runtime savings, revise before going live. Reference docs describe only what the candidate implements.

**Moving from the old Shrimpy.** Create fresh homes and set up credentials explicitly. Each agent brings over its own data, reading what it wants from the old workspace; Shrimpy converts no transcripts, tasks, manifests or clocks. Triggers and chat providers start disabled until their definitions, bindings and destinations are reviewed, and an old poller is stopped before a new one starts on the same bot. Shrimpy never changes or deletes the old workspace. Never open a newer database with an older binary.

## Early thinking

Ideas that are not decisions. Nothing here is scheduled, and nothing gets built from it until it has been through review.

### A fact held in the prompt

**State:** early thinking from 2026-10-04, not decided. Nothing asks for it yet.

[Breadcrumbs](design/7-on-its-own.md) cover a fact that moves: it comes with an input, once. They don't cover a fact that should be in every request and that the agent couldn't look up, because only Shrimpy knows it: who is reachable, or which questions to other agents are open. That would be a document behind a prompt section. Pi keeps track of what each conversation has been shown, and after compaction it writes the whole prompt again, so the current value would always be in the request. Each change would cost what [a change to the prompt costs](design/5-home.md), so it would suit only a fact that rarely changes.

Fable was asked about this shape on 2026-10-04 and argued against it. An agent trusts a value in its prompt and stops looking. When the check behind the value dies, the agent acts on a stale one and nothing errors, where a lookup fails loudly. An app-agent doesn't need it either. What makes an accountant is not the numbers held in their head. It is knowing which accounts exist, which is `context/`, and when to look, which is skills.

**Also open.**

- Whether each context file should be a section of its own. You would rather have several small files than one big one such as a `MEMORY.md`. Today that saves nothing, because all of `context/` is one section. With a section for each file, a changed file would be sent alone to the models that take a change in place. On the others any change still costs a full read.
- Whether a message that wakes nobody is the same flag as `quiet` on `send_message`, which so far means a person isn't notified. It would be the way to leave something in a thread for an agent's next turn there, where people see it too.

### The agent's tools, as an agent meets them

**State:** a bucket, kept since 2026-10-06. You have thoughts on what agents' tools should be called and how they should feel to use, and want to test them once the core is there. Questions of that kind are collected here and not put to you one at a time.

- What the tools are called: `send_message`, `read_messages`, `check_back` and `ask_agent`, beside Pi's own `read`, `write`, `edit` and `bash`.
- What a channel's default thread is called. It is `main` today, and you may want a clearer name.
- `send_message` and `read_messages` can't name a thread of a DM, only a room's. A result of `ask_agent` points to `shrimpy read <thread>` in the shell for that.
- Whether input steered into a session by `shrimpy sessions steer` should say who sent it.
- `react`, an `edit` option and `quiet` on `send_message`, as the design names them.
- Watching one job to its end. `check_back` waits for a time, and a trigger's check goes on until the trigger is removed, so an agent that starts a long job adds a trigger for it and removes it after.

### A member that is neither a person nor an agent

**State:** your idea from 2026-10-05, set aside. Nothing asks for it yet.

Something like the channel bots of IRC. One kind is a plain script that answers messages. Another is a model that isn't trained to follow instructions and still answers a query, such as the one you serve locally as talkie. Neither has a home, a session or tools. It would be a third kind of member: a program with a token that reads the feed and posts.

The rules there are would cover it: its message would wake an agent only when it mentions one, as an agent's does. To settle if it is built: what wakes it, a mention or a prefix as on IRC; whether an agent is told a message came from one, so that it reads it as data; and whether it leaves receipts. Until then the chat contract shouldn't come to assume that a member is a person or an agent.
