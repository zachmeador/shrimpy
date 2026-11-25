# 🦐 Open

What isn't built, falls short or hasn't been tried, and what waits on the owner, a line for each and grouped by piece. A line leaves when it's done or dropped, and a new one goes in the change that finds it. What is decided and built is in the code and its commit messages. The design these lines came from is in git, in `docs/REDESIGN/` at `4c366bc5`.

## Waiting on the owner

- What wakes agents in a room with several of them. A question that mentioned nobody woke all five agents under the default `people`, and their mentions of each other doubled it: ten replies in four minutes on 2026-11-22, "too much for me to catch up on". One way: `mentions` as the default once a room holds more than two agents, and what every agent is told says room replies stay short and a brainstorm doesn't start work.
- Files copied into the owner's homes from the read-only archive kept read-only modes: 726 in career's home, `vault/.git` among them, and 4 in SCREAMO's. Agents hit `EACCES` and worked around it with `chmod`. Making them writable is a one-time change to the owner's data, and should touch only what came from the archive, since career and nervous-bob make some of their own files read-only on purpose.
- Whom a push service is told to write to about the gateway. As built it is the address of the page's door, which on a tailnet holds the tailnet's name. It could be an address the owner sets, such as an email, or nobody. Apple's service turns away a contact that isn't a URL or a mailto address and took the page's address. Whether it takes a notification that names nobody is untried.
- Whether an agent is told of a message's attachments. It isn't, so an agent of 2.0 that gets a file from a 2.x client answers as if none came, which is what putting attachments in 2.0's message shape was for. A line for each, with its name, type and size, would let it say it can't open one yet.

## 2.0

The owner agreed on 2026-11-24, hours after 1.0.0, to a 2.0 that gets the contracts' shape right while two setups run Shrimpy, and to each of its proposal's five choices. The proposal is kept outside the repo, and `AGENTS-PRIVATE.md` says where. What is left of it to build:

- Before it ships, chat's and the roster's migrations run on copies of the owner's and Kathleen's data, and an agent apart follows its gateway across the major.

## The release

- Version 1.0.0, A Rising Tide: Shrimpy says `1.0.0`, `nightly` says the next minor with `-dev`, and the release writes the contracts it serves in `src/contracts/released.json`.
- A release candidate, tagged as a prerelease, that an admin agent updates everywhere to 1.0.0, which proves the tagged update.
- A fixture of each store at 1.0.0 and at each release after it, and a test that opens every fixture of this major and the last.
- Choosing the model an agent starts with, from the terminal.
- Moving over from old Shrimpy. Nothing is built. Meant to be: fresh homes, and credentials set up by hand; each agent reads what it wants from the old workspace, and nothing converts transcripts, tasks, manifests or clocks; triggers and chat providers start off until reviewed, and an old poller stops before a new one starts on the same bot; the old workspace is never changed; a newer database is never opened with an older binary.
- The owner's machines move from checkouts to the installed layout, by hand.
- Every CLI entry, slash command, export, setup and update recipe, service definition, template, skill, test, doc and security statement accounted for, with help and completion from the real commands.
- A decision on each old Shrimpy capability or affordance that isn't back and that no mark settles: those marked undecided under [old Shrimpy](#old-shrimpy-as-the-owner-marked-it), and the old terminal's affordances under [using it](#using-it) that no mark covers.
- What is left of setting up through `shrimpy`, under [using it](#using-it).
- The skills that ship and what every agent is told covering how a person and an agent use Shrimpy.
- Default locations for machine-level data, and service installation for each program.
- Proving on macOS and Linux: install, first setup, a tagged update, stop and restart, and uninstall without losing home data. Build, lint, package, lifecycle and full test runs in an isolated checkout.
- Measuring against old Shrimpy at `574bb2c`: the code and dependencies deleted, and resource use at startup, idle and under load. Old Shrimpy there has 45,536 lines in `src/` and `extensions/`, 3,099 in `web/` and 27,026 in `test/`.
- The gate: if client and framework complexity outweigh what the runtime saves, revise before going live, and the docs describe only what the release implements.
- Rewriting old Shrimpy's eleven idea docs for the new Shrimpy. They wait unchanged in the owner's journal.
- Before 1.1 reaches a setup in use, each trigger there that tells someone something with `send_message` to `@name` gets a thread with `--thread`, or every run starts a new thread: the owner's triggers, and Kathleen's 17. Each agent can point its own when asked.

## Next

Daily use decides what comes after the release. The last order was compaction and the request a turn sent, under [the home](#the-home), then hearing a thread and its demo, under [the conversation model](#the-conversation-model). Later came the chat provider interface, agents everywhere under [the network](#the-network), helpers, and what daily use asks for. The web client's leftovers don't hold up the release.

## The three programs

**Not built**

- `shrimpy up` starting the gateway or the chat server again alone when one ends, as it does an agent, and doing the same with agents named. Today it stops everything when either ends, and with agents named when anything does.
- Cancelling all of a home's work at once, without stopping the agent. Today work is stopped one session at a time.

**Falls short**

- `up`'s start lines name whichever agent started first in "Talk to an agent with", and repeat the line about `listen.json`, at every start of the service.
- A service that `shrimpy update` installs from an agent's shell has `~/.local/bin` once more in its `PATH` with each update, since it copies the shell's `PATH`.
- A turn that a crash cut short says so only on an answer's receipt. One that ends with `END`, or is stopped, says nothing of the crash.
- Pi counts every task running at an unclean end, not only the one that killed it. A stop while chat is away waits for chat in place, so five unclean ends before chat is back end it without a receipt.
- A trigger whose task five unclean ends in a row cut off, as while its check runs, has no task until the agent next reads its files.
- A turn at Pi's limit may make one more model call or start one more tool before the agent stops it after the restart. Its session then says `stopped`, and its receipt says the agent stopped unexpectedly too many times.
- A save that a crash cuts short leaves a hidden file beside the file it was saving, and nothing removes it.
- A store refused for being newer names the copy beside it without checking that this release can open the copy. After two releases that each migrated it, the copy is in the format of the release between them.

**Untried**

- Running between two accounts of one machine, and an agent on macOS joined to a gateway elsewhere.
- Power loss, a full disk, log damage, and a kill during a tool commit.
- The lock an agent takes on its home, on network file systems and sandbox mounts.
- Migrating stored data for real: only the tests have done it, with steps they make up.

## The contracts

**Not built**

- The rest of the agent's operations, as members of `Agent` and `Session`, as daily use asks for them: withdraw, thinking level, defaults, context queries, completion against the agent's files, provider status, delegation and attachments.
- Clients holding a lagging agent's `Agent` and `Session` at the versions its release served, from `released.json`. A client at a newer version waits on an older agent with `contract_mismatch`, even for members the older version has, and agents update after the gateway's machine. The evolve trial of 2026-11-24 found it, and it's needed by the first time either contract evolves in 2.x.

**Falls short**

- After a deploy, a client from the build before waits on every contract whose shape changed, and the log says `shrimpy.chat.channel v2 does not match the served v2` without naming the client. The client says to update both to the same build, where reloading would do. Nightly builds all say the same version, so this comes back at each deploy.
- Only a message's author edits or deletes it, so a chat provider acting for a person it maps can't.
- Chat's log of events never shrinks, and nothing shows a message's earlier versions.
- A message waiting behind a turn that Pi's restart limit ended is withdrawn by the agent's stop, so its skipped receipt has no reason. The terminal, `read` and `run` say its work was stopped as if someone had, and `run` exits 130.
- A program newer than the gateway warns only in its own log, though the roster's versions let the clients and `shrimpy status` say so. A page newer than the gateway is told to update the gateway's machine, where reloading the page would do.
- The roster lists a program turned away for its release until the gateway restarts, and lists no other refusal. A turned-away agent is named only when the roster knows its token.
- A session that waits on another version says so only on its agent's list and the levels after it, so one behind a room's thread says nothing when no agent's list is open.

**Untried**

- A hold that waits on an older program, seen to bind once that program updates. The page reloading itself, and offering a reload, in a browser. Two releases of different majors met for real on 2026-11-24, and the gateway turned the older one away in the right words.
- An agent following its gateway after a release that changes the Pi packages or the major, and the terminal's `/update`, for real: only stand-ins have run. The update skill has run for real, from 1.0.0-rc.1 to 1.0.0 across two machines.

**Open question**

- For Pi's developers: will Chord raise its protocol version for every wire change, and from when? Until it does, a Pi release reaches every machine together.

**The owner's to strike**

- A Unix socket carries a WebSocket, so Shrimpy frames nothing itself.
- The gateway holds a `Presence` at every program it knows, so a request for one that isn't linked fails at once with words, and binds when it links.
- Admin is read from the live roster by the program that is asked, never stamped on a request.
- `needs_admin` and `read_only` carry no reason. A thread's `readOnly` is what a client acts on.
- The feed is `head`, kept live, and `events`, which answers at once, in place of a call that waits.
- A device is labelled with the name of the machine it joins from.
- A connection makes one try at an invitation's code, in place of a guard of five wrong codes on one connection.
- A refusal is an answer, not a thrown error.

## Identity and addressing

**Falls short**

- `agent init` with no gateway running here makes the home unchecked, so a name the roster already holds still shows only in the service's log, and `agent status` says only that the agent isn't running.
- What every agent is told doesn't say that the `shrimpy` in its shell acts as the agent. One believed it acted as the person (2026-11-22). A program of an agent's own that opens the gateway's socket is taken for the person, as the design has it.
- The terminal reaches agents by name only, so with the gateway down it can't watch one. The `sessions` commands can, by a home's path.
- From an agent's shell, `agent init`, `agent serve` and `up` skip the admin check, and `status` lists no admins.
- A removed agent's DM with the person leaves the clients with the agent's row, and `shrimpy threads <name>` no longer finds it, so its threads are read only by ID, with `shrimpy read`. Its DMs with other agents stay under them, and its rooms keep listing it as a member.
- The person's DM with a removed agent stays open to writing, though nothing will answer there.
- The gateway ends a removed agent's links before it answers, so an agent can't remove itself, and `shrimpy members remove` refuses it.

**The owner's to strike**

- A page on the gateway's machine gets in by an invitation's link, as any browser does, where the design had a link of its own carrying a secret.

## The conversation model

**Not built**

- Hearing a thread while working in it: a message that wakes nobody, in a thread where the agent's session is busy, is written into that session as an entry of Shrimpy's own kind that starts no turn, up to 20,000 characters a turn, and what every agent is told gains two sentences on it. A demo decides whether it stays: three agents in a room on a LAN model, asked the same thing with nothing, with one sentence telling them to read the thread first, and with hearing.
- Whether Pi's public `submit(tx, draft)` makes the handover of an input one commit, keeping the feed's order.
- Attachments, as both mockups draw them, the [web client's](web-client-mockup.html) and the [terminal's](terminal-mockup.html). Each travels with its message, the chat server keeps it with the thread, and it is copied into the agent's home, in `attachments/` with a folder for each day, when the message is offered. A message carries up to 25 MB, and the copy into a home has the same limit. An image goes to the model with its message. Clipboard files and images attach to a message, on Ctrl+V in the terminal, which is to be checked against Pi's own key. A click opens one, and no key does. How an agent attaches a file of its own isn't drawn, and `send_message` can't attach one yet. Since 2.0 a message carries a list of its attachments, which stays empty since chat takes no files. None of the rest is built, the bytes included, which are to move in pieces through chat.
- Notifications that tell only the devices the person isn't using; quiet hours, and silencing a thread or a room; every message of a room, where today only those that name the person count.
- Pinning in the clients and by agents. Chat has the channel's pin, and the clients show it as a tag. How the clients set pins isn't drawn, and how an agent pins and whether it is told to post in pinned threads wait with the tool questions.
- The chat provider interface, kept as an idea: a provider posts for the people it maps, keyed by the outside message's ID, reads its bound threads from its own cursor, reports delivery as pending, delivered, failed or uncertain, moves attachments, sees who is working, and edits or deletes for a person it maps. A fake provider is its reference and proves nothing outside-app-specific leaks into the shared layer, a reaction and an edit cross a bridge both ways, and a feature the outside app lacks is left out. No outside chat app is planned.
- The proof that goes with it: two homes talking in a channel with no provider, on real models including a small local one, winding down instead of going round in circles, with mentions and broadcast, sender restrictions, the final text as the reply and `END` for silence, last-active addressing, and accepted versus delivered status. If instructions can't stop a loop, that goes to the owner before any mechanism is added.
- Proofs through a real chat app, if one is written: a message typed in another client mirrored into it, a reset between admission and retry, duplicate and batched updates, offline periods, first start, late replies, long formatted output, quiet notices, photos, documents, voice notes and video, and a lost send acknowledgment.

**Falls short**

- An answer to a `send_message` that asked another agent something wakes a new session behind the thread the message started, not the session that asked. That session is shown the question but not why it was asked, and tells the person in a new thread of their DM, away from where they asked. `ask_agent` brings an answer back to the session that asked, and agents don't always reach for it.
- What a session posted in its own thread without a receipt, which is what it sent there with `send_message` and its reply to a wake-up or a question's result, is shown to it once more among what was said since it last looked. Its replies to messages and triggers are left out, since their receipts name them.
- A `send_message` to `@name` makes its thread before it posts, so a post that chat refuses, or that never arrives because the link dropped, leaves an empty thread in the DM.
- In a DM, two messages a few seconds apart get two answers when the first turn uses no tools, and the first answer says the message looks cut off.
- An agent doesn't know what it said in its other threads, and `shrimpy threads` with no argument refuses instead of listing them.
- A message that joined a running turn is marked answered by that turn's one reply, whether or not the reply speaks to it.
- When the chat store is replaced, an agent goes on with unfinished work behind the old store's threads: a waiting wake-up or a cut-short turn runs once more, calls the model, can't post, and is reported. The agent knows the store was replaced, so it could stop that work and say so once.
- After a fresh start an agent's first wake in a room shows up to 20,000 characters of history, from before it joined included.
- A message recorded between a skipped message's receipt and the session noting it is handed over without the skipped one, which shows one turn late.
- Pi takes back the inputs behind a turn that fails, but not those behind a run it ends as faulted or orphaned, so they wait for the session's next input.
- An agent tells Pi storage from before Pi 1.5.2 by Pi's `durable_schema` table, and a document another version wrote by the words Durable refuses it with. Pi promises neither. A home's endpoint file from before then makes `up` stop with an error that doesn't say to move it away.
- The message tools have no timeout, so a chat server that stays linked and never answers holds a turn until someone stops it.
- Input order in a session leans on Pi's task numbering, which Pi doesn't promise.
- Three quick reactions to one of an agent's messages can get two answers.
- A receipt that says a message failed is told to the person's devices even while its thread is on show, since a receipt moves no read mark. Only a newer message there, read within five seconds, stops it.

**Untried**

- Google's and Mozilla's push services.

## The home

**Not built**

- Shrimpy's guidance for compaction's summary, on dates, voice, paths and the state of work, and a test of a session crossing the threshold. What every agent is told doesn't yet say it can read the thread again when a detail went missing.
- Seeing exactly what the model received for a request, and why: raw entries, effective messages, selected tools, source revisions, omissions and budgets, and the effective model and settings.
- A capture of the facts that come with a message at the moment its session takes it up. They are fixed when it is handed over, and Pi has no hook for the later moment. Nothing differs yet, since each fact is fixed for a message.
- Required-tool filtering for skills, and choosing skills for one agent.
- Listing what a folder is signed in to, and signing it out: an entry leaves `providers/auth.json` by hand.
- `shrimpy login` signing in one home, signing in to a server that a `models.json` declares, and opening a browser.
- `models.json` taking an API other than `openai-completions`.

**Falls short**

- What every agent is told doesn't say that each bash call starts in the home, so a relative path after an earlier `cd` misses.
- The rule for ending a turn with `END` sends small models into long deliberation over a one-word reply.
- A call to a tool that doesn't exist is refused without naming the tools that do. The words are Pi's.
- A sigil that doesn't check out is reported as "twelve lines of twelve # or . characters", where `AGENTS.md` writes 12×12.
- Pi's storage only grows: about a megabyte a day for a trigger that fires every minute. The list of triggers reads the task of every input the agent has taken up, and a client holding the list reads them all again at each commit that touches a trigger.
- Nothing prunes the finished task each event leaves in the agent's records, or a wake-up's finished sleeper, and each `check_back` scans the session's sleepers.
- A `triggers/` folder that exists and can't be listed ends every trigger.
- Each change to a context note costs every session one miss of the prompt cache. A file whose permissions change is read again.
- The models an agent says it can use are those Pi lists as available, which checks more than the start does, so the home's own model can be missing from the list, and `setModel` can refuse a model the agent would start with.
- The gateway takes a `context/` it can't find for an empty one, so a Shrimpy folder on a share that drops for a moment empties every agent's copy of the workspace context until it is back.
- When `shrimpy login` asks for a model it lists every model the provider has, whether or not the account can use it.
- A sign-in renewed at the provider and not saved, because the process died between, is lost. An `auth.json` that is a symbolic link becomes a plain file at the first renewal. A Shrimpy folder that `agent init` makes isn't private to its account, where one the sign-in makes is.
- The starter `SOUL.md`'s shrimp emoji makes the small local model answer goodbyes a third of the time.

**Untried**

- Reading a home's files again after a change on a folder shared from another machine: only a local disk has seen a change.
- Reloading the model: with a provider's sign-in, a request running to a server that `models.json` no longer declares, two reloads at once, a request running while a session's model is set, and a reload that fails halfway through moving the sessions.
- The workspace context outside the tests.
- Any provider's sign-in but OpenAI's subscription, a renewal anyone watched, asking at a terminal in the tests, and the 30-second wait for another process to let go of the credentials.
- Context captured when input is taken up, across queued input, steering, tool rounds, a reload, compaction and a restart; real provider input matching the live and reopened history; editing a context file while work is queued; killing the agent during blocking compaction; a tool call spanning a reload and an attempted code or environment swap; and the cost of capturing context.

**The owner's to strike**

- The sigil's form, the pigment chosen at random, and the look worked out from a member ID.
- `shrimpy login` leaving out OpenAI's legacy Codex sign-in, and holding back Copilot, Kimi, Meta and xAI until their terms are checked.

## The network

**Not built**

- The line `shrimpy invite <name>` prints starting with the install, at the gateway's version.
- The skill for a browser's certificate, on a tailnet or a plain LAN.
- An invitation as a code to scan, and a field that takes a code on a page that isn't let in.
- Renewing a browser's cookie before its 400 days are up.
- A way in for an app installed to a phone's home screen, which keeps storage of its own: unless the phone copies the browser's cookie at install, it has none. How the iPhone's got in wasn't looked at, and other phones are untried.
- A desktop app that wraps the page checking the gateway's key by its fingerprint, as a machine does, so it needs no certificate.
- The chat server on a machine other than the gateway's.
- Reading from Tailscale where it's there: which device of the owner's a machine is, whether an agent connects from the machine it is expected from, maybe who is an admin from the tailnet's policy, and a Tailscale login standing in for a device's token.
- A skill for adding a machine with Tailscale, and for pairing over SSH.
- Nothing lists the invitations that are out or takes one back, nothing shows where a gateway listens but its own start, and nothing forgets an address but deleting the file that keeps them.

**Falls short**

- `--listen` given to `up` while a gateway runs only warns.
- On a machine whose agents belong to a gateway elsewhere and that hasn't joined as the owner's, a command names those agents only by their homes' paths.
- A folder that has joined as the owner's and also holds agents of no gateway is at odds with itself: `up` starts a gateway and a chat server for them, and the commands that talk reach the gateway elsewhere. The terminal still says "this machine's gateway".
- `shrimpy members`, the commands that talk and the terminal say to run `shrimpy up` when they find no gateway, which is wrong on a machine whose agents all belong to a gateway elsewhere.
- A service gets the `PATH` of the shell that ran `shrimpy install`, and agents' shells look for every command but `shrimpy` on it. A command sent over SSH with no login shell has a shorter one.
- On macOS nothing runs after a restart until the account logs in, which an account with no secure token can't do by itself under FileVault. Running with nobody logged in takes root.
- On macOS, when `up` dies under launchd, a gateway that still answers as the new `up` looks is used as it is, and once it ends nothing starts a gateway until the service restarts. Not ruled out, and not seen in six tries.
- A service installed from a checkout on Homebrew's Node names Homebrew's version folder, so a `brew upgrade node` likely stops it.
- On Linux, stopping or restarting the service kills whatever an agent's shell left running, without telling it, unless it runs in a unit of its own, as `systemd-run --user` makes. Cleanup is to be proved under whatever keeps Shrimpy running.
- Services for two folders of one account share its one runtime directory, so the second finds the first's gateway and starts only its agents.
- `up` takes a home for gone whenever it can't see its `agent.json`, so a folder that can't be read for a moment costs each agent a restart.
- `up` asks an agent someone else started whether it still runs every two seconds.
- A home with no gateway of its own that appears in a folder whose agents all belong elsewhere is started with no gateway to find, until `up` starts again.
- A single message that takes over half a minute to arrive could have its link closed by Chord's heartbeat.
- Nothing slows wrong invitation codes across many connections, and connections still in their TLS handshake aren't counted with those waiting to say hello.
- Over a network, an agent that restarts is turned away until Chord's heartbeat closes its old link.
- The gateway's route to a program leans on Chord calling `resolve` synchronously, which Chord doesn't promise.
- The runtime directory is `$XDG_RUNTIME_DIR/shrimpy` where that is set and `/tmp/shrimpy-<uid>` where it isn't, so a gateway a service started and a command typed in a shell may look in different places.

**Untried**

- Lingering on Linux when it takes an administrator.
- On macOS, `shrimpy install` before the account's first login, which leaves the LaunchAgent for launchd to start at that login.
- A job an agent's shell started outliving `up`, when `up` was started from a terminal.
- The gateway ending while `up` follows the folder, and a third stop request while an agent is starting.
- Stopping an agent apart with a turn running and its gateway dead, and the dial's quarter-minute wait at its real length.
- An agent apart that stops answering in the middle of a request, and many clients asking for one agent.
- An agent in a real sandbox, container or VM with the client outside and no shared files, and one whose only outbound access is the gateway and its model provider.
- Through the gateway: switching agents and sessions, allowed and denied access, disconnects and reconnects of each side, a retry to a fixed target, completion against the agent's files and moving an attachment. A gateway or chat server failure leaving accepted work with the agent, and clients recovering from what is stored.

## What an agent does unasked

**Not built**

- Helpers: child sessions in the agent's process, with its home and authority. Foreground ones join and stop with their parent, and background ones outlive it and wake it with their result. They show in a work view whose labels, visibility and cancellation are still to decide.

**Falls short**

- A wake-up set with `check_back` can't be withdrawn once it isn't needed, so it still fires and spends a turn.
- A question's thread is named by cutting the question mid-word, with no ellipsis.
- A trigger that names a thread and comes due while the agent was down fires before the link to chat is up, so that one occurrence fails.
- A trigger file that doesn't check out is named on standard error, in a breadcrumb and by `agent context`, and is missing from `shrimpy triggers` while the agent runs.
- A trigger or a wake-up that comes due during a stop's grace period can still start.
- A question's own thread outlives the question, and a later message there starts a session with no memory of the one that asked. A question whose post chat refuses leaves an empty thread that nothing archives.
- An agent killed between posting a question and keeping it loses the question, and the answer wakes the question's thread like any message.
- A check's standard error goes to a file in `state/runtime/checks/`, since Pi hands output and errors over as one stream.
- A second run of a trigger by hand, while the first one's check runs, starts a second check. `triggers show` has no row for a check run by hand until it ends.
- A wake-up that fails or is given up has no receipt, and is reported on standard error.

**Untried**

- A real model using `ask_agent`: whether a small model asks, ends its turn and waits.

**The owner's to strike**

- How asking another agent works: `ask_agent` with `within`, 30 minutes by default and from a minute to a day; a thread for each question; up to five open in a session; a stop closing them.
- How checks and breadcrumbs work: `when` is `changed` and `then` is `wake` by default, a check's timeout is a minute and at most ten, its output is cut at 2,000 characters, and an input carries at most ten breadcrumbs, each cut at 1,000.

## Using it

**Not built**

- An agent page and two views of an agent's threads, for both clients, as their mockups draw them, the [web client's](web-client-mockup.html) and the [terminal's](terminal-mockup.html), which the owner approved on 2026-11-24: chat and observe as tabs, in place of the "everything" and "yours" switch, and the page where a thread would stand while none is open, with how the agent stands, its machine, its model, its version, its triggers and its home. Its machine and model come with 2.0.
- `/devices invite` in the terminal, which lets another machine of the owner's in.
- What is left of setting up through `shrimpy`: the terminal's first screen saying when a program is down and being started again, `/` commands for signing in again, and `shrimpy --help` led by `shrimpy` alone, with the rest under "for scripts and agents".
- Color in what the commands print, as the [terminal mockup](terminal-mockup.html)'s sheet on the commands has it: a name or a command bold, a state in a color and a failure in red, on a terminal that shows color. The plain lines and tables agents read stay.
- Reactions, edits and deletes: keys in the clients, and tools for agents, `react` and an `edit` option on `send_message`, and how an agent deletes its own message isn't designed yet.
- Chat commands for a chat app with no screen of its own: `/new`, `/status` and `/help`.
- Focused `grep`, `find` and `ls` tools, when they're missed.
- Memory breadcrumbs, with a search index behind them and the `memory-management` skill.
- The person's own settings, beyond their name.
- Of the old terminal's affordances, those no mark below settles: multiline input, recovering a draft, and pasting clipboard text.
- The web client's rough edges on an iPhone, once they are listed.
- In the web client, what its mockup doesn't draw: reacting, editing and deleting, searching, settings, and paging back through a long thread or session. The rest of the inspector: an agent's context, the request a turn sent, and its runtime.
- A Mac app that wraps the web client, in Electron.
- A companion app on the phone that wraps the same pages with what the phone's system offers. A web view has no push of its own, so it needs Apple's push service, through a relay that holds the app's key for an App Store build, or with the owner's key on the gateway for a build they sign. Which, and whether the project runs a relay, is settled when the app comes.
- Deleting a thread, which chat can't do. It would be asked of an agent, not offered by the clients, and Pi can't delete a conversation, so the session behind it could only be hidden.

**Falls short in the terminal**

- `/status` doesn't show how full the context is, a question that is open or the thinking level. It is a command only as the whole text, so `/status now` is a message.
- The list of commands is the editor's own: its line of keys doesn't change while it is open, so the list's keys aren't named, and it names Esc for going back where Esc first closes the list. It doesn't open after a mention at the start, as in `@scout /st`, and at 42 columns or fewer it shows names without their lines.
- The list of commands, and of models after `/model `, shows every entry at once.
- `/model`'s list shows a model as one label, its ID and then its name, since the editor cuts a first column at 30 characters, and lists `default` even when the agent can't use that model now. After a burst of keys, Esc or Tab, the space after `/model` opens no list until the next letter, and no list opens after a mention, so `@scout /model` is written by hand.
- Until something is said in a thread started with a command, its title reads "(no messages yet)".
- A command that is for nobody, as `/model` with no mention in a room is when a client other than the terminal posts it, gets no answer and no receipt.
- A session that `/model` made isn't in the list of sessions until its next message. Two inputs handed to a session before its next answer both say the model changed. An answer that failed doesn't count as the last answer.
- `/stop` is a message, so with chat down the terminal can't stop an agent. `shrimpy sessions stop` can.
- A `/stop` with nothing to stop looks ignored, and `@typo /stop` stops every agent in the room.
- On an agent's screen a trigger's own session has no time and comes last. "With you" means the person's DM with the agent, so a room they are both in shows only under everything.
- Leaving the terminal, the line about work that goes on names only the person's own threads, and from a thread they only read it says to write `/stop`, which they can't there.
- The terminal holds every channel the person only reads, with its threads, on every screen: with n agents that can be n(n−1)/2 DMs. A room they only read shows what was said and no agent's work, where a thread opened from an agent's screen shows that agent's.
- Bare `shrimpy` opens the list of agents and rooms, or the person's threads with the only agent when they're in no room. It doesn't remember their latest thread or start programs on demand.
- The terminal can't scroll back past the newest 200 messages of a thread, or the newest 200 items of a session it watches.
- A long title cuts its `main` tag before it cuts itself, where the mockup keeps the tag.
- Markdown's list markers are in the third ink, where the mockup has coral.
- The corners of the list of keys take the ground of the level under their column, not of a chosen row or the input under them.
- A mention in an agent's Markdown is marked with two characters that take no room, and what follows it inside bold, a heading or a quote loses that style.
- A command inside a sentence is set apart by finding it, so a room's name with a comma in it is set apart only up to the comma.
- The tide and the lanterns move only while an agent works, where the mockup moves them always.
- The thread printed back on leaving keeps the spaces its Markdown was padded with, and nothing is printed back when no thread is open.
- The terminal calls the person's DM with an agent "your DM", where `shrimpy sessions list` says "DM with" and their name.

**Falls short in the web client**

- The button for an agent's view shows once an agent has a session behind the thread, where both mockups have it on every thread with agents in it. The client can't tell a thread with no session from one whose session it hasn't read.
- A message streaming into a thread has no caret, and chat's contract says nothing of streaming.
- The line over an agent's home says `agents/<name>/`, which is wrong for a home kept elsewhere.
- In brief, the page says how many earlier lines of a tool's output are left out, which its mockup doesn't draw.
- The address of an agent's view names no agent, so reloading it in a room shows whichever agent's session is known first.
- Esc in an agent's view goes back to the conversation, where the terminal's goes back to the list.
- Where a thread can be started the page names Ctrl+N on a phone too.
- A trigger's card holds everything `shrimpy triggers` says of it, which is long at the list's width.
- The page's door serves every file to be fetched afresh, so each load takes about 800 KB.
- A trigger's line folds open to what the check printed, where its mockup draws the sentence the agent is shown. The receipt under the line, and the note in chat's words when chat refuses a rename or an archive, are in neither mockup.
- An archived thread that is open stays in its list's shut group, so its row isn't on show until the group is opened.

**Falls short in the commands**

- `shrimpy status` lists the person as not reachable, since reachable means only that an agent's program is linked.
- Commands agents guess don't exist: `shrimpy agent <name>` and `shrimpy sessions <name>`. `shrimpy read '#room'` doesn't print the room's pinned thread.
- `shrimpy threads` can't name a DM between two agents, so from a shell its thread's ID comes from `shrimpy sessions list`.
- `shrimpy update`'s preview calls going from a release candidate to its release a patch.
- `shrimpy sessions list`, and the triggers' rows on an agent's screen, are in the order the agent made them, which the contract doesn't promise.
- `triggers on` and `off` by an agent's name need the agent running, where by its home's path they change the file of an agent that is off.
- `threads #ops` needs quotes in a shell, or the room's name is taken for a comment.
- `run --no-wait` prints the IDs to follow up with, but no command waits on one.
- `run` prints only the first part of an answer posted in parts, and can't follow a message once 200 newer ones are in its thread.
- `shrimpy login` reading its answers from a pipe keeps running after it says it's done, until the pipe closes.
- A service that fails to start during setup says to run `shrimpy install` again, where running `shrimpy` again does the same.

**Untried**

- Terminals: iTerm2, Terminal.app, Linux terminals, one that speaks the Kitty keyboard protocol, where key releases are now ignored and the arrows haven't run, one with a light background, and the mouse at a real terminal. Braille sigils depend on the terminal's font.
- In the terminal: a list longer than its pane, an agent on another machine, more than a handful of models, `/model` on a narrow terminal, an agent that doesn't answer when asked for its models, an agent that goes down between changing a model and leaving the receipt, and two inputs handed over at once.
- The web client in Firefox and Safari on a desktop, and its Content-Security-Policy anywhere but Chromium and the iPhone.
- A trigger's line, renaming and archiving on an iPhone, in a DM between two agents, and with an agent whose model answers.
- Signing in from a shell, as the setup skill has it, got as far as the link and a pasted address.
- `shrimpy update` from a real release, and restarting a real Shrimpy service that way on macOS.
- Setting up through a bare `shrimpy` with a subscription's sign-in, under launchd, and with a person at a real terminal: only the tests have run it, with an API key and a stand-in for systemd.
- Keyboard, editor, file, image and shell interactions; navigating agents with several clients open, and a failed preflight; a failed switch putting back the previous view and draft; large transcripts; the web client's queries, subscriptions, IDs and anchors on the same operations as the terminal; and presentation never reaching a provider's input.

**The owner's to strike**

- Setup makes one agent, an admin named `shrimpy` unless the person chooses otherwise, and every new agent's starter `SOUL.md` says it enjoys the shrimp emoji.
- In a shell that isn't an agent's, when the Shrimpy folder has exactly one agent, a command with no `--agent` acts on that one.
- On an agent's list, Tab switches between everything and the person's own threads, and Enter opens a row as Right does.
- The terminal paints its ground in the web client's dusk or day where it has true color, and keeps the terminal's own ground and sixteen colors where it hasn't.
- The web client is drawn with Preact in TSX.
- esbuild bundles the page when the gateway starts, so esbuild is a dependency where it was a development one.
- The page's styles are the web mockup's, with the colors written from `clients/look/`.
- An agent's Markdown is read with `marked` and made into the page's elements, never set as HTML.
- The face is Atkinson Hyperlegible, from two font packages the page's door serves.
- The page's Content-Security-Policy: `default-src 'self'`, with pictures also from `data:`.

## The code's layout

**The owner's to strike**

- Chord is imported only where programs meet: `contracts/`, `lib/link`, `lib/follow`, the files at the top of each program and the modules the lint names.

## Tests

- A test in `src/gateway/you.test.ts` failed once in a full run while another check ran in the same container, and has passed since.
- Built and untested: a real-provider turn using only the shell tool, a request ID reused with different content at the agent, and what becomes of a shell child that outlives a killed agent.
- Nothing tests how a session's status shows images, usage, its own model and a retry, or that a cut-off answer's tool calls show as not run. A test through the real engine could. Nothing tests most of `/status`, or how the terminal shows edits, deletes and reactions.
- No test covers a link that goes silent, which Chord's heartbeat closes after half a minute, or `run` stopped while its message is being sent, which needs a chat server that takes a post and never answers.
- A test that opens a DM with an agent through `talkTo` can be refused, since `talkTo` waits for the roster to have the agent and chat may not have heard of it yet. Nothing a person holds of chat says when chat has heard of a member.

## Deferred

- Notifications on a desktop, from the terminal or in a chat app, when work finishes while the person is away.
- Codemode, as an experiment once the core tools work: Durable's code mode, where the model writes a short script that calls the other tools and only its output enters context. A tool whose rules assume one call at a time checks them in its own commit first. When it's built, the owner chooses whether a crash mid-script reports the script as interrupted or replays it, as Pi's code mode does.
- A plain HTTP entry point, once a program that can't speak Chord needs in.
- Each context file as a prompt section of its own, so a changed file is sent alone to models that take a change in place.
- A desktop chat app as the native client for channels.
- Extensions in the agent as folders with one entry point, handed the same few things.
- Landing a contract change on its own, before the programs that follow it.
- Events from outside apps, such as MCP events or webhooks, arriving as a chat provider's messages. Look again when they are in an accepted proposal or a revision of MCP's spec, `pi-mcp` speaks protocol `2026-07-28`, and a server's events are worth an agent reacting to.

## Early thinking

Ideas, not decisions. Nothing here is built until it has been through review.

- A fact held in the prompt: a document behind a prompt section, for a fact only Shrimpy knows, such as who is reachable or which questions are open. Fable argued against it: an agent trusts a value in its prompt and stops looking, and acts on a stale one when the check behind it dies. Nothing asks for it.
- Whether a message that wakes nobody is the same flag as `quiet` on `send_message`, to leave something in a thread for an agent's next turn there.
- A member that is neither a person nor an agent, like an IRC bot: a script, or a model that isn't trained to follow instructions, with a token, reading the feed and posting. To settle: what wakes it, whether an agent is told a message came from one, and whether it leaves receipts. Until then the chat contract shouldn't assume a member is a person or an agent.

**The agent's tools, as an agent meets them.** The owner wants to test these once the core is there.

- What the tools are called: `send_message`, `read_messages`, `check_back` and `ask_agent`, beside Pi's `read`, `write`, `edit` and `bash`.
- What a channel's default thread is called: `main` today.
- `send_message` and `read_messages` can name a room's thread but not a DM's, so a result of `ask_agent` points to `shrimpy read <thread>`.
- Whether input steered in with `shrimpy sessions steer` says who sent it.
- How `react`, an `edit` option and `quiet` on `send_message` are named and feel.
- Watching one job to its end: today an agent adds a trigger for a long job and removes it after.
- Agents tidying their own threads: no tool renames or archives a thread, and each `ask_agent` question opens a thread of its own. Reusing one thread for recurring work is recommended, not enforced.

## Old Shrimpy, as the owner marked it

What old Shrimpy could do that isn't back, by what a person or an agent could do with it.

**In outside chat apps.** None is in the first release, and each comes with a chat adapter if one is written: talking to an agent from Telegram, a bot for each agent, choosing which agent answers in a chat, limiting which chats and people may talk to an agent, typing, formatted and split replies and sender labels, merging quick bursts, photos the agent sees, a message that doesn't notify, reaching a person where they were last active, binding and unbinding a channel, guided Telegram setup, and `/new`, `/clear`, `/help` and `/thinking` there.

**Conversations and sessions**

- Post to a room from the shell: wanted.
- Delete a room: wanted. Leaving a room and removing a member can wait as long as a room can be deleted.
- Search past threads and sessions: wanted, as one tool for agents.
- Leave a room or remove a member: later.
- Compact a session by hand: later, with compaction.
- Copy the agent's last answer: later.
- Dropped: resetting or restoring a session, forking or cloning one, choosing a model, thinking level or skill for one `run`, following a channel from the shell, exporting a conversation, importing an old session, naming a session and showing its details, an agent's text along the way while `run` waits, and nudging an agent that said nothing.

**The terminal**

- Reopen the latest thread with the latest agent: later.
- Open settings: later, with something to set.
- Set an agent's thinking level with `/thinking`: later, working as `/model` does.
- Sign in or out from the terminal: wanted, as a `/` command.
- Paste clipboard images into a message: later, with attachments.
- Edit a message the agent hasn't picked up yet: later, with edits and reactions.
- Dropped: `/reload`, `/skill:name` and prompt templates, a shrimp that swims while an agent works, recalling an earlier message with Up, an external editor, suspending and copying with keys, `/changelog`, `/quit`, `/agents`, `/trust`, a shell line with `!`, completing file paths, hidden context with a header, a footer and constant usage, favourite models, and starting the terminal with a first message.

**Models and signing in**

- Name several candidate models for an agent and use the first available: kept.
- See which model an agent resolves to, and add a provider by command: undecided.

**Agents, skills and memory**

- Show, inspect, rename, remove and configure an agent by command: removing keeps the home's data.
- List, show, add, update, remove and validate skills by command: undecided.
- Search the whole workspace's files, track their changes and see its status: undecided.
- Have an agent keep memory notes in its own voice: with memory breadcrumbs.
- Default upkeep triggers, daily journals, journal compaction and hygiene audits: with their features.
- Ask an agent to remember, search or search the web: when wanted.
- Hand a coding task to Codex, then follow, steer and cancel it: later, through the agent's shell and a trigger, with one skill for every such program.
- Dropped or replaced: a second starter agent, searching every agent's memory (an admin agent uses SSH), a command's output added to every turn (breadcrumbs), fleet status and other sessions' activity told unasked, and extensions that add tools and commands.

**Looking after Shrimpy**

- Restart or stop the gateway, read its logs, and run a service for each program: undecided.
- Complete commands, agents and options with Tab in the shell: planned. A line in the shell's startup file still looks for old Shrimpy's completion.

## Not building

Left out on purpose, so they don't creep back:

- Sandboxing for individual tools. A sandbox wraps the whole agent.
- A second run queue, transcript, task manager, outcome journal or activity cache beside Pi's.
- A receipt store beside Pi's that compares the content of retried requests: a request ID's first use wins.
- A compatibility layer for Pi's `ExtensionAPI`, or a generic service framework.
- A seam where only one thing will ever plug in. The gateway stays one piece.
- A controller lease between clients, unless a real need appears.
- Heartbeat-based lock takeover or a PID ledger.
- A global scheduler, universal worker registry or network-wide job ledger.
- Automatic migration of old Shrimpy's transcripts, tasks, manifests or clocks.
- Model calls to route ordinary input.
- Loop or flood control in the chat server or the gateway.
- Native MCP, per-request model routing, cache warming, vector memory, journaling daemons and transcription, each a future decision of its own.
- A gateway that more than one person shares.
- Logins with a password, or a token for the person on the gateway's own socket.
- Depending on Chord's app kit, Pi's own apps or Earendil's hosted services, or on anything that needs an Earendil account.
- A way to install other than the script, such as Homebrew, distribution packages, a container image or an npm package, and one install for several accounts.
- Checking for updates in the background. An agent can, with a trigger whose check is `shrimpy update`.
- A mesh protocol, an ACP product, a visual redesign or a mandatory hosting platform.
