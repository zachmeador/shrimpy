# 🦐 What Is Open

The one list of what is open in Shrimpy: what waits on the owner, what is not built, where the code falls short of what was decided, what old Shrimpy could do that Shrimpy can't yet, ideas kept for later, and what is left out on purpose. A line leaves when it is built or dropped, in the change that does it, and a new gap is added here. Open work is kept in this file and not in GitHub issues; the words it uses are in [how-it-is-built.md](how-it-is-built.md).

## Waiting on the owner

1. **A first real sign-in.** `shrimpy providers login` has only been through a made-up sign-in and an API key, since a real one needs the owner's account. Run it in a folder of its own (`SHRIMPY_DIR`) or the owner's own, and say what a subscription's flow did: the link, the code pasted back, and whether an agent made with plain `shrimpy agent init` then answers.
2. **The lines for a machine of the owner's own.** `shrimpy members invite` with no name, and `shrimpy join <link>` on the other machine, are built as shown on 2026-10-07. The owner agreed to the way in "as long as the ux is simple and clean" (2026-10-06) and hasn't said yes or no to these lines. They are the owner's to change.
3. **The owner's name on a gateway that an account made for Shrimpy runs.** The gateway names the person for the OS account that runs it, so on the Linux machine it made a person called shrimpy, and the agent the owner asked for couldn't have that name. The person was renamed by hand in the roster's file, once. Say how it should work: a name the gateway is told when it first starts, a command that renames a person, or something else. Planned: the name becomes one of the owner's own settings.
4. **An agent hearing a thread while it works in it.** The owner's idea of 2026-10-06: what anyone says in a thread reaches an agent working there at its next step, and wakes nobody. Pi has the piece, a write that joins a busy session at its next boundary and never starts a turn, but none of it has been run. It costs tokens, may make agents herd to the first answer, helps only a turn with a step left, and needs one file of the agent's side of chat and a few tests, with no contract change. The version with no mechanism is one sentence in what every agent is told: read the thread before answering a message that went to everyone. The ten details, with what to do about each, are in `docs/REDESIGN/proposals/hearing-a-thread.md`.
5. **`shrimpy up` starts an agent that ends again, alone.** The owner confirmed on 2026-10-04 that `up` stops everything it started when any one program ends, an agent included. After the owner wrote "a user expects to be able to add an agent without having to think about restarting a service or running things" (2026-10-07), `up` with no agents named starts an agent that ends again by itself, after a pause that grows from two seconds to five minutes while it keeps failing, and stops everything only when the gateway or the chat server ends. The owner hasn't said yes or no to that part.
6. **What a refusal is in Shrimpy's contracts.** Refusals carry their reason inside Pi's error code, and clients still see Chord's and `pi-client`'s error types and codes, though contracts are to carry only Shrimpy's shapes. Nothing is broken; deciding makes it intentional. Not urgent.
7. **The mechanics of `ask_agent`,** settled and built on 2026-10-06, are the owner's to change: `to` must be an agent; 30 minutes to answer by default, from one minute to a day; a thread of its own for each question; five open questions in a session; a stop closes them without a word.
8. **The mechanics of checks and breadcrumbs,** settled and built on 2026-10-05, are the owner's to change: a trigger's `check`, `when`, `then` and `timeout` keys and their defaults; output cut at 2,000 characters; a quiet check leaving no occurrence; at most ten breadcrumb files of 1,000 characters with an input.
9. **A command with no `--agent` acts on the only agent a folder has,** in the owner's own terminal; with two or more it lists them and asks for the flag. Added by whoever coordinated the build on 2026-10-05, for the owner to strike.
10. **A reload applies an agent's model,** with nothing started again. The owner said of "hey make your default model x" that it "works good atm" (2026-10-08); an agent can't start itself again, so a reload was made to apply the change. Built on 2026-10-08, for the owner to strike.
11. **Two rows were decided in the build; the owner says so if they want them otherwise.** A reload also rebuilds the base instructions and reaches each session at its next request, a running turn included. First setup is to make one agent, named `shrimpy` unless chosen otherwise, that is an admin, and no second agent.
12. **What becomes of `docs/research/` at the release:** about thirty notes, about 85,000 words, written before the redesign, many linking into `shrimpy-old/`.

## Not built yet

What daily use shows rough decides the order. Next: the chat server's provider interface, and the home's compaction, request inspection and workspace context. Later: agents everywhere (Telegram, sandboxes, Tailscale), helpers, and what daily use asks for.

### The three programs

- Faults beyond a kill are untried: power loss, a full disk, damage to the write-ahead log, and a kill during the commit of a tool's result. Storage survives process crashes, not power loss.
- The owner lock is untried on a network file system and on a sandbox's mount. It held on a virtiofs mount.

### The contracts

- How peers stay compatible across machines is undecided. Pi's protocol promises no compatibility, so today every program must run the same version and a mismatch is reported. The other choice is a stable protocol of its own for the link that crosses machines, an agent to chat and the gateway. It shapes updating Shrimpy on several machines.
- The agent's contract lacks operations that were designed: reset, fork, withdrawing one waiting input, a thinking level, settable defaults, raw and effective context with entry queries and committed subscriptions, completion against the agent's filesystem, chat-provider status, delegation controls, and receiving attachments. Each arrives with its feature.

### Identity and addressing

- Which person gets which permission isn't modelled until there is a second person. Admin is the only role.

### The conversation model

- Source bindings, and the publication and delivery operations of the chat server.
- The provider interface with its shared helpers. A provider posts for the people it maps, keyed by the outside message's ID; reads its bound threads from its own cursor; reports delivery; moves attachments; and sees who is working. It needs the request IDs and versions listed under Known gaps.
- A fake provider as the provider interface's reference.
- Proof with no provider: two agents on a small local model finish something that needs both without going round in circles, with default wake policies, mentions and broadcast, sender restrictions, final text as the reply and `END` for silence, last-active addressing, and accepted versus delivered status. If instructions can't stop a loop there, it comes back to the owner before any mechanism is added. No proof run is recorded.
- Proof with the fake provider: it drives the same chat contract, so nothing Telegram-specific leaks into the shared layer.
- Proof of a bridge: a reaction and an edit cross it in both directions, and a feature the outside app lacks is left out.
- Leaving a room and removing a member wait until someone needs them.

### The home

- Compaction with Shrimpy's guidance for dates, voice, paths and work state, in place of the copied runner. Pi compacts by default and Shrimpy adds no guidance of its own; no test has a session cross the threshold. Summary quality is qualified first, and agents are told they can re-read the thread when a detail went missing.
- Seeing the request a turn sent: raw entries, effective model messages, selected tools, source revisions, omissions, budgets, and the model and settings in effect. `shrimpy agent context` is a labelled preview; a captured request is the evidence.
- Workspace context hosted by the gateway: the shared `context/` files reach agents through the API, each agent keeps a cached copy for when the gateway is unreachable, and a reload picks up changes at the cost of one prompt-cache miss.
- Skills not yet rewritten, each to come with its feature: the default watches (upkeep triggers, installed disabled), coding delegation, update, and the journals and audits that run from watches. `remember`, search and web search wait until wanted.
- Proof: context is captured at consumption for queued input, steering, tool rounds, reload, compaction and restart.
- Proof: real provider input matches live and reopened raw and effective history.
- Proof: editing a context file while work is queued, so in-flight input, newly consumed input and a resent request each use the right version.
- Proof: killing the owner during blocking compaction.
- Proof: a model tool call spanning a resource reload and an attempted code or environment swap.
- Proof: early cost checks of context capture.
- Nothing limits what an agent is told (`SOUL.md`, a context file, the list of skills, the earlier messages with an input). Confirmed for now.

### The network

- The chat server on a machine other than the gateway's.
- An agent in a container with no shared files joins with its invitation, shows in the terminal, answers in a thread, and has its session watched and stopped from the gateway's machine. Another OS user and another machine have run.
- Telegram as the first chat provider: one poller per bot account, and an explicit owner for cursors, batches and receipts.
- Reading from Tailscale where it is there: whose a person's machine is, and whether an agent connects from the machine it is expected from. Never needed, never managed.
- Sandboxes: an agent inside a container or microVM with only the gateway and its model provider reachable, keys inside the sandbox, and grants for a model server on the host and for Tailscale's `100.64.0.0/10`. Designed, untried.
- Skills, none written: an agent running `tailscale status` and `tailscale ip` to walk the person through adding a machine, and an admin agent doing a pairing over SSH.
- Encryption of Shrimpy's own: none for now. On a network that isn't a tailnet, tokens and messages travel in the clear, so the gateway should listen on an address only the owner's machines reach.
- Linux: the runtime directory is `$XDG_RUNTIME_DIR/shrimpy` where that is set and `/tmp/shrimpy-<uid>` where it isn't, so a service's gateway and a command typed in a shell may look in different places. They matched on the owner's machine.
- Proof: completion against the agent's filesystem, and moving an attachment.
- Proof: an agent inside one real sandbox or VM with the client outside and no shared files, and one whose only outbound access is the gateway and its model provider.
- Proof: a message typed in the console in a Telegram-bridged channel appears in Telegram, posted by the bot and labelled with the owner's name.
- Proof through Telegram: a reset between admission and retry, duplicate and batched updates, offline periods, first start, late replies, long formatted output, quiet notices, photos, documents, voice notes and video, fixed-target retry, and a lost send acknowledgment.

### What an agent does without being asked

- Helpers: child sessions in the agent's own process, with its home and authority. Foreground helpers join and stop with their parent; background helpers outlive it and wake the parent with their result. They show in a work view and never become agents. The view's labels, visibility and cancellation need review.
- The retained Codex workflow for delegated coding: start, inspect, continue, wait, cancel and close, with outputs. Unsupported backends are proposed removals, and renaming or removing worker commands needs review.
- Proof: delegation through the real Codex backend across caller disconnect and owner death; a background helper wakes its parent when it finishes; Pi task ownership never cancels detached external workers. A capability that can't be kept goes back to the owner before it is removed.
- A trigger that names a thread shows as a small trigger line in the thread, with its prompt or output folded before the agent's reply. It comes with a change to the chat contract.
- No real model has used `ask_agent`. Whether a small one asks, ends its turn and waits is untested.

### Using it

- Shell completion for the new commands. Old Shrimpy's is set aside, and a line in the shell's startup file still looks for it.
- Thread and session operations: reset, archive, resume, fork, naming a thread, search and export. A fork needs a session ID of its own apart from its thread.
- Chat commands for a chat app with no screen of its own: `/new`, `/help`, and `/status` answered by an agent. `/stop` and `/model` are built, and the terminal answers `/status` itself.
- Reactions, edits and deletes: keys in the clients, and tools for agents (`react`, an `edit` option on `send_message`, and a way for an agent to delete its own message). The chat server has them.
- Choosing models from the terminal: favourites, a saved default, a thinking level, and the model an agent starts with. A thread's model is `/model`, and an agent's default is changed by telling the agent (Waiting on the owner, item 10).
- Attachments on messages, clipboard files and images included. An image reaches the model with its message; every attachment also arrives as a file in the agent's home up to a size limit, and the message says where. Transcription is a separate decision.
- The search tools, and a tool that shows the model an image file. Focused `grep`, `find` and `ls` come back when missed.
- Memory breadcrumbs with the search index behind them, and the `memory-management` skill.
- Terminal affordances come back when missed (listed under "From old Shrimpy, not back"). A screen that lists every key waits until keys outgrow the line at the bottom.
- A web client for talking and watching: channels, threads, agents and sessions, with history, live view and input, beside the inspector views. Open: URLs, anchors, pagination, write permissions, and loopback, same-origin and CSRF rules once it can send input. A page the gateway serves is the person who runs the gateway and gets in with a link carrying a secret only that OS user can read; from another device it waits for the way in a person gets from another machine. The gateway's browser entry today is IPv4 loopback only, with no default port, no fallback page, no cache headers, only `nosniff` among security headers, and dotfiles served.
- Proof: keyboard, editor, file, image and shell interactions.
- Proof: agent navigation, preflight failure and several clients; a failed switch restores the previous view and draft.
- Proof: web queries and subscriptions, new IDs and anchors, and large transcripts; the web client uses the operations the terminal uses, and attaches to an agent in a separate process through the same contract as local use.
- Proof: presentation content never reaches provider input.

### The release

- Outcome: an installable release with one engine, and the old tree gone.
- Account for every CLI entry, slash command, export, setup and update recipe, service definition, template, skill, test, doc and security statement. Help and completion come from the real command surface. `SECURITY.md`, `CONTRIBUTING.md` and `THIRD_PARTY_NOTICES.md` moved into `shrimpy-old/` and go with it unless carried over.
- Very little reference documentation: "i'd actually like to move to very minimal reference documentation. shrimpy agents can just check the code if they need to. but instructions and skills should cover all of the core ux/agent-ex" (2026-10-08). The README and the developer docs are written for what the release ships, keeping the charming parts of the old ones. The keep list in `docs/REDESIGN/history/keep-list.md` collects those parts, 33 items, and needs a home before that folder goes.
- The redesign folder is deleted at the release, "only after i've gone through everything and nothing seems to have been missed" (2026-10-08).
- A decision for every command and affordance of old Shrimpy that hasn't come back: the list "From old Shrimpy, not back".
- Default locations for machine-level data, and service installation for each program. `shrimpy gateway install` installs one `shrimpy up` for a Shrimpy folder.
- Delete `shrimpy-old/`, and with it `AppRuntime`, the session pool, leases, turn wrappers, gateway execution, control and watch state, private Pi imports, and obsolete binaries, commands and dependencies. Remove any candidate scaffolding left in the new tree.
- Prove: build, lint, package, lifecycle and full test runs in an isolated checkout.
- Prove: on macOS and Linux, install, first setup, tagged update, stop and restart, and uninstall without losing home data.
- Prove: code and dependency deletion against old Shrimpy at `574bb2c` (45,536 lines in `src/` and `extensions/`, 3,099 in `web/`, 27,026 in `test/`); resource use at startup, idle and under load (an agent process took about 0.6 s and 110 MB to start cold in the spike); remaining deviations and evidence gaps, recorded in this file.
- Gate: if client and framework complexity outweigh the runtime savings, revise before going live. Docs describe only what the release implements.
- **Updating Shrimpy.** "updating shrimpy will be something we want to have a good ux on, especially for people with multi-machine setups" (2026-10-08). Nothing is built: an update is new files in the checkout and a restart of the service on each machine, by hand, and programs on different machines can run different versions in between. Decided: `shrimpy update` gives a deterministic preview by default; `--guide` runs the update skill in an ordinary thread; an exact tag or SHA apply stays explicit, with approval before consequential changes. A home whose records another version wrote is refused and nothing converts it, so an update that changes a stored shape costs a home its sessions.
- **A setup command.** Not built. A new setup is three commands, which the setup skill gives: `shrimpy providers login`, `shrimpy agent init <name>`, `shrimpy up`. Designed: one agent named `shrimpy` unless chosen otherwise, finished by talking to it; existing files survive; local endpoints, API keys and OAuth work; errors say what to do next.
- **Moving over from old Shrimpy.** Not built. Fresh homes, with credentials set up explicitly. Each agent brings over what it wants from the old workspace; nothing converts transcripts, tasks, manifests or clocks. Triggers and chat providers start disabled until their definitions, bindings and destinations are reviewed, and an old poller is stopped before a new one starts on the same bot. The old workspace is never changed or deleted. Never open a newer database with an older binary.

## Known gaps

Where the code falls short of what was decided. A line leaves when it is fixed, or when the decision changes to match the code. Before a review pause, every line is fixed, raised with the owner or left here on purpose.

### The three programs and what each owns

- After a crash nothing shows a notice, though one was decided; only a turn that is given up reaches the sender, as a failed receipt.
- A crash loop while an event is being handed over, or while chat is being told, is never broken: only a turn that was underway counts.
- Programs don't compare versions when they connect, and `sessions` and `agent status` don't check; only commands that go through the gateway warn about a mismatch.

### The contracts between them

- Renaming and archiving a thread carry no version, so an old retry could overwrite a later decision.
- Edits, deletes and reactions carry no request ID, so a provider replaying an old edit after a newer one would undo it.
- Only the author edits or deletes, checked against the caller, so a provider acting for a person it maps has no way to.
- The chat server's log of events never shrinks, and nothing shows a message's earlier versions.
- A skipped receipt carries no reason, so the sender of a message skipped behind a failed turn isn't told that writing again brings it back.
- The terminal polls the gateway's list and the person's thread lists every two seconds, since the contracts have no subscription for them. The agent's client has no detach and takes no abort signal, and a hung connection is noticed only when something is sent.
- Nothing shows a wake-up that is waiting (`sessions list`, `sessions read`, the terminal), so nothing says that `/stop` in its thread cancels it, which it does, as does `shrimpy sessions stop`. It needs a field in the agent's contract.
- The agent's own service is named `SessionDirectory`, though it also reloads the home and lists and fires triggers.

### Identity and addressing

- Nothing removes a member, replaces a token or renames a person.
- A rename reaches the chat server only when that member next enters chat. The log of events doesn't help, since an event names a message.
- A command run from an agent's shell prints a gateway refusal with no advice, where the agent's own link adds what to do.
- The terminal reaches agents by name only, so with the gateway down it can't watch one. The `sessions` commands by a home's path can.
- A command's `--agent` takes the name of a home's folder or a path, not the name on the roster. For an agent whose name in `agent.json` differs from its folder, the terminal's line about stopping its work names an agent the command can't find.

### The conversation model

- A message that joined a running turn is marked answered by that turn's one reply, whether or not the reply speaks to it. The owner took that cost with the rule that every message a person writes joins.
- In a room, who a message was for and the names in what was said since the agent last looked come from what the agent remembers of the room, so a member who joined and hasn't been mentioned is missing until a mention makes the agent ask again. The opening of an input is asked afresh and has no gap.
- When the chat store is replaced, an agent keeps its sessions behind the old store's threads and goes on with what was unfinished in them: a waiting wake-up or a cut-short turn runs once more, calls the model, then can't post, and the agent reports each. It ends by itself. Since the agent knows the store was replaced, it could stop that work and say so once.
- After a fresh start an agent has forgotten where it last looked, so its first wake in a room shows up to 20,000 characters of history, from before it joined included.
- An edit that removes a mention takes it from the original post too, for an agent that reads the feed afterwards, since an event shows its message as it now stands.
- A message recorded between a skipped message's receipt and the session noting it is handed over without the skipped one, which then shows one turn late.
- `send_message` has no `quiet`. It comes with chat providers, where it means a person isn't notified.
- The message tools have no timeout, so a chat server that hangs holds a turn until someone stops it.

### The home

- Pi's storage keeps every finished task and entry, so the file only grows: about a megabyte a day for a trigger that fires every minute, little for hourly. Compaction bounds what a model is shown, not what is stored. The owner judged it no concern for now (2026-10-05). Listing triggers scans every finished task.
- Nothing prunes the finished task each event leaves in the agent's records, nor a wake-up's finished sleeper, and each `check_back` call scans the session's sleepers.
- The facts that come with a message are fixed when it is handed to its session, not when the session takes it up. Nothing differs yet, and Pi has no hook for that moment, so a fact that changes while a message waits needs a capture of its own.
- A reload that reads the model again, and a session's own model, have run between two model servers on a LAN and not with a provider's sign-in. Untried: a server that `models.json` no longer declares while a request to it runs, two reloads at once, a request running while a session's model is set, and a reload that fails halfway through moving the sessions. The models an agent says it can use are those Pi lists as available, which checks more than the start does, so the home's own model can be missing from the list.
- Skills are trails only: `/skill:name`, templates, required-tool filtering and choosing skills for one agent aren't built.
- The skills say there is no setup command and no command that removes an agent.
- Nothing lists what a folder is signed in to, or signs it out: an entry is removed from `providers/auth.json` by hand. `providers login` signs in the folder and never one home, can't sign in to a server a `models.json` declares, and doesn't open a browser. When it asks for a model it lists every model the provider has, usable or not.
- A sign-in renewed at the provider and not saved, because the process died in between, is lost, and the folder must be signed in again. A change to the credentials waits up to 30 seconds for another process to let go of the file, and that limit has no test. An `auth.json` that is a symbolic link is replaced by a plain file at the first renewal. A folder the sign-in command makes is private to its owner, and one `agent init` makes is not.

### The network

- Pairing an agent apart takes `shrimpy up --listen`, `shrimpy members invite` and `shrimpy agent join`. Nothing lists the invitations that are out or takes one back, shows where a gateway listens but its own start, or makes it forget an address but deleting the file that keeps them. `--listen` given to `up` when a gateway is already running only warns.
- An agent apart is reached by its name through the gateway, by the code the terminal uses, and no command reaches it: `sessions`, `triggers` and `agent reload` find an agent by its home's folder, and `gateway status` looks only on its own machine. Two messages still say to start an agent apart with `agent serve` on the gateway's machine, where it has no home. The browser's entry can't reach an agent apart. Nothing limits how many calls wait for one agent.
- A machine of the owner's own comes in with `members invite` and `join` and keeps its place in `machine.json`. Nothing takes a machine's token back at the gateway or lists the machines: leaving is deleting that file, and the gateway goes on knowing the token. A folder that joined as the owner and also holds agents of no gateway is at odds with itself: `shrimpy up` there starts a gateway and a chat server for them, and the commands that talk reach the gateway elsewhere and find nobody. A command there waits on a gateway that takes a connection and never answers for as long as the network does. The terminal's words still say "this machine's gateway".
- Linux: 666 of 676 tests passed on Ubuntu 24.04 with Node 22.23. The three that bundle a contract for a browser failed for want of a dependency copied from a Mac and not installed there, and have not run after a real install.
- `shrimpy gateway install` and `uninstall` have run for real on Linux only: a first install, an update of a hand-written unit and an uninstall, for the account with the gateway and for one whose agent belongs to a gateway elsewhere. Not run for real: lingering that takes an administrator, and everything on macOS, where the LaunchAgent passes `plutil -lint` and no `launchctl` command has run.
- A service gets the `PATH` of the shell that ran `gateway install`, and a command sent over SSH with no login shell has a shorter one. On the owner's Linux machine it lacks `~/.local/bin`, where `shrimpy` is, so a service installed that way would leave its agents' shells without the command.
- A service gets its folder and nothing about the runtime directory, and an account has one runtime directory, so services for two folders of one account would share one gateway: the second finds the first's and starts only its agents.
- `shrimpy up` takes a home for gone whenever it can't see the home's `agent.json`, whatever the reason, and stops the agent it started there. It starts it again within seconds of the file being back, so a folder unreadable for a moment costs each agent a restart.
- A home that appears is started within two seconds, so an agent made with `agent init` starts with the `SOUL.md` it is given and reads an edited one only when told to reload. The skill for making an agent says so.
- While `up` keeps a folder running, an agent someone else started is asked whether it still runs every two seconds. A home with no gateway of its own that appears in a folder whose agents all belong to a gateway elsewhere is started with no gateway to find, until `up` is started again.
- Untried: the gateway ending while `up` follows the folder (the chat server ending is in the tests), and a third stop request while an agent is starting.
- `shrimpy members`, the commands that talk and the terminal still say to start Shrimpy with `shrimpy up` when they find no gateway, which is wrong on a machine whose agents all belong to a gateway elsewhere. `shrimpy gateway status` says where that gateway is.
- A stop of an agent apart with a turn running and its gateway dead has not been tried (an idle one ends in about a second). The quarter-of-a-minute limits on connecting and on an answer ran at their real length only by hand, between two machines.
- A gateway running another version than the command that joins is warned of, and that warning has no test. The browser's entry is not pinged. A single frame that takes longer than half a minute to arrive could get its connection let go of.
- Five wrong codes end the joins on one connection, and nothing slows wrong codes across many connections or limits how many connections nobody has signed in on.
- A registration lasts as long as its connection, which a dead network connection can outlive: the gateway lets one go after half a minute of silence, and an agent that restarts in that time is turned away, since an agent has one live body.

### What an agent does without being asked

- A trigger that names a thread and comes due while the agent was down fires at the start before the link to chat is up, so that one occurrence fails. The next works.
- A trigger file that doesn't check out is named by a reload and by `agent context`, and is missing from `shrimpy triggers` while the agent runs.
- A trigger or a wake-up that comes due during a stop's grace period can still start.
- A question's own thread outlives the question: a message there later starts a session behind it that has no memory of the session that asked. Every agent is told that such a thread may be a question it asked, how to read it, and to pass on news that matters. A question whose post chat refuses leaves an empty thread that nothing archives.
- An agent killed between posting a question and keeping it loses the question, and its answer wakes a session behind the question's thread like any message. Not hit in a hundred runs.
- A check's standard error goes to a file in the home's `runtime/checks/`, because Pi hands a command's output and errors over as one stream. An engine that kept them apart would need no file.
- A second run of a trigger by hand while the first's check is running starts a second check, and `triggers show` has no row for a check run by hand until it has ended.

### Using it

- `/status` shows what the contracts give. It doesn't show how full the context is, a wake-up that is waiting or a question that is open, the thinking level, or what went wrong at the provider last, and in a room it says only which agents are running and working. It is a command only as the whole text, so `/status now` is a message.
- The list of commands is the editor's own. The line of keys doesn't change while it is open, so the list's keys aren't named. It doesn't open after a mention at the start, as in `@scout /st`, and on a terminal of 42 columns or fewer it shows the names without their lines.
- `/model`: its list shows a model as one label, ID then name, since the editor cuts a first column at 30 characters. `default` is listed even when the agent can't use that model now. After a burst of keys, Esc or Tab, the space after `/model` opens no list until the next letter, and no list opens after a mention, so `@scout /model` is written by hand. A thread started with a command reads "(no messages yet)" until something is said in it. Untried: more than a handful of models, a narrow terminal, and an agent that doesn't answer when asked for its models (waited for three seconds).
- A command that is for nobody, as `/model` with no mention in a room when a client other than the terminal posts it, gets no answer and no receipt: nothing tells whoever wrote it. A session that `/model` made isn't in the list of sessions until its next message. Two inputs handed to a session before its next answer both say that the model changed. An answer that failed doesn't count as the last answer. Untried: an agent that goes down between changing a model and leaving the receipt, and two inputs handed over at once.
- `/stop` is a message, so it takes the chat server: with chat down the terminal can't stop an agent, and `shrimpy sessions stop` can.
- Bare `shrimpy` opens the list of agents and rooms, or your threads with the only agent when you are in no room. It doesn't remember your latest thread, start programs on demand, or mark what arrived while you were away.
- `pi-tui`'s regular mode clears the terminal's scrollback on some repaints, which the old terminal didn't do. The terminal can't scroll back past the newest 200 messages of a thread, or the newest 200 items of a session it is watching, and has no scrolling keys of its own.
- In a room's thread an agent's work isn't shown as it happens. Its session for that thread can be watched from the agent's screen, and `/stop` written in the thread stops the agents it is for. The terminal polls every room's threads every two seconds, and an agent's sessions while that list is on show.
- Where a session is has two wordings: `shrimpy sessions list` says "DM with scout (an agent)", and the terminal's list says "DM with scout · main". The order of an agent's sessions is the order it made them, which the contract doesn't promise. While a session is watched its list isn't asked for again, so the watch's title keeps the place it had.
- The terminal ignores the release of a key, which a terminal that speaks the Kitty keyboard protocol reports and which made every press count twice there. It was fixed from reading `pi-tui` and a test, and hasn't been tried on such a terminal.
- `threads #ops` needs quotes in a shell, or the room's name is taken for a comment and dropped.
- `--no-wait` prints the IDs to follow up with, but no command waits on one.
- `run` prints only the first part of an answer posted in parts, and can't follow a message once 200 newer ones are in its thread.

### Tests

- Built promises with no test: a real-provider turn uses only the shell tool, not the file tools; a request ID reused with different content is tested in the chat server and not at the agent; nothing asserts what becomes of a shell child that outlives a killed owner.
- The terminal client's tests still run on a stand-in for the chat server, some 300 lines, that repeats two of its rules. The agent's and the CLI's tests run on the real one.
- Small duplicates: a pause helper in `agent/chat/` and in `lib/retry`, a helper for talking in tests in `agent/testing/` and `cli/testing/`, and two fake terminals, in `cli/testing/` and the console's `draw/testing/`.
- A test that holds a scripted model at a gate and fails before it lets go hangs its run until the suite's timeout. The tests of a busy agent and of questions let go on the way out, and the wake-ups' test doesn't.
- Some tests assert that nothing happened after a pause, where no later event can be waited for: about a dozen, in the console's network and state tests, the agent's chat and stop tests and the registration tests. A few bound how long something takes, which could trip on a loaded machine. One has: the test that an agent apart says once when it loses its gateway failed once with "Byte transport closed" while other builds had the machine's load between 20 and 40, and passed alone six times of six.

### Other known gaps

- A promotion or demotion reaches an agent's own check only on connections made after it.
- From an agent's shell, `agent init`, `agent serve` and `up` about another agent's home are not checked, and `gateway status` shows no admin column.
- The chat server's `head` is server-wide, so it shows how many messages exist in channels the caller isn't in.
- A hosted thread's view stays in the chat server's memory until the server stops.
- Two chat servers can hold one name for the instant of a restart, so the console keeps choosing the newest.
- The order of inputs in a session leans on how Pi's storage numbers tasks, which Pi doesn't promise. The order tests would catch a change.
- A wake-up whose turn fails, or is given up after two crashes, has no receipt to carry it, so it is reported only on standard error.
- Three quick reactions to one of an agent's messages can get two answers.
- A `/stop` that had nothing to stop looks the same as one that was ignored, and a name that is no member's counts as mentioning nobody, so `@typo /stop` stops every agent in the room.
- `models.json` takes the `openai-completions` API only; a server of another API, or an unsupported key, is an error.
- The shrimp emoji in the starter `SOUL.md` costs some silence on the small local model, which answered "Bye! 🦐" in about a third of tries after a plain goodbye. Left as a rough edge to tune.
- Small leftovers of the agent's reshape: the names `startIntake` and `stopIntake` remain in `agent/chat/`, and `host/` exports an owner lock that nothing outside it uses.
- Untried: an agent apart that stops answering while a client waits (beyond its test), and many clients asking for one agent at once.
- Terminals: the spike tried only an xterm.js replay of pseudo-terminal captures. iTerm2, Terminal.app, Linux terminals and tmux are untried, and no record names the terminal the owner uses.

## From old Shrimpy, not back

What a person or an agent could do with old Shrimpy that they can't with this one. The owner marks each line keep, later or drop. Each ends with what was decided, or "undecided".

### In outside chat apps

- Talk to an agent from Telegram — the first chat provider, later.
- Give each agent its own Telegram bot, so messaging a bot is messaging that agent — decided; comes with Telegram.
- Pick which agent answers in a Telegram chat — goes; a bot for each agent replaces it.
- Limit which chats and people may talk to an agent — each provider maps allowed chats and senders; comes with Telegram.
- See typing, formatted and split replies, and sender labels in the chat app — each provider does its own; comes with Telegram.
- Have quick bursts of messages merged into one — shared by every provider; comes with Telegram.
- Send a photo in Telegram and have the agent see it — an image goes to the model with its message; attachments are not built.
- Send a message that doesn't notify a person (low-urgency `notify`) — becomes `quiet` on `send_message`, with providers.
- Reach a person where they were last active — kept; needs an outside chat to reach them in.
- Bind a channel to a chat app, and unbind it — explicit provider bindings; comes with Telegram.
- Set up Telegram with a guided command — provider setup that keeps existing files; comes with Telegram.
- Start a fresh conversation in a chat app with `/new` or `/clear` — `/new` is on the list, as a reset where there are no threads; `/clear` goes.
- Ask `/help` in a chat app, filtered to what the person may do — on the list of chat commands.
- Set the thinking level with `/thinking` in a chat app — waits.

### Conversations and sessions

- Reset a session, or restore an earlier one — reset and resume are designed; no way in yet.
- Archive or rename a thread — the chat server has them; no way in yet.
- Fork or clone a conversation and walk its tree (`/fork`, `/clone`, `/tree`) — kept, on Pi's session semantics; not built.
- Search past sessions and channels — on the list of thread operations; undecided.
- Follow a channel live from the shell (`tail`) — undecided.
- Post to a channel from the shell — rooms are made from the shell but nothing posts in one, since `run` is the DM client; undecided.
- Leave a room or remove a member — waits until someone needs it.
- Export a conversation as readable text (`/export`) — kept, with no promise of Pi's JSONL format.
- Import an old-format session (`/import`) — dropped, pending the owner's review.
- Name a session (`/name`) and show its details (`/session`) — keep the intent.
- Compact a session by hand (`/compact`) — keep the intent; Pi's compaction with Shrimpy's guidance comes first.
- Copy the agent's last answer (`/copy`) — keep the intent.
- See an agent's intermediate text while `run` waits — dropped; `run` prints the final settled answer.
- Ask `run` for an answer from a chosen model, thinking level or skill — explicit overrides were to be reviewed; undecided.
- Have a silent agent nudged to answer a person's message — removed; the final text is the reply by default.

### The terminal

- Open the settings screen (`/settings`), and Shrimpy's own settings (`/shrimpy`) — keep the intent.
- Show the keys (`/hotkeys`) — keep the intent; the bottom line names the keys, and a screen that lists them waits.
- Read what changed in a release (`/changelog`) — keep the intent.
- Set an agent's thinking level with `/thinking` in the terminal — keep the intent; not built.
- Quit with `/quit` — keep the intent; Ctrl+C twice and Ctrl+D quit today.
- Sign in or out with `/login` and `/logout` — keep the intent; `shrimpy providers login` signs in, and nothing signs out.
- Reload with `/reload` — keep the intent; `shrimpy agent reload` or asking the agent does it today.
- Switch between agents and chats with `/agents` — keep the intent; the list of agents and rooms does it today.
- Trust a project (`/trust`) — review against deliberate home resources; ambient project instructions stay off.
- Use a skill with `/skill:name`, and expand prompt templates — kept; not built.
- Run a shell line from the editor with `!` and `!!` — kept; not built.
- Recall earlier messages with the editor's history — comes back when missed.
- Complete file paths while typing — comes back when missed; it has to ask the agent's filesystem.
- Paste clipboard text and images into a message — comes back when missed.
- Edit in an external editor, suspend, and copy with keys — come back when missed.
- Edit a message the agent hasn't picked up yet — comes back when missed.
- Use a fullscreen mode — comes back when missed.
- See hidden turn context, a header and footer, and the model and usage at all times — come back when missed; `/status` shows the model, tokens and cost on request.
- Watch a shrimp swim while an agent works — not for now (2026-10-04); the working line is good enough.
- See the shrimp in the terminal's tab title — kept by the keep list; not built.
- Mark favourite models, apply one with Enter, save a default with Ctrl+S — same gestures promised; not built.
- Start the terminal with a first message, or through `chat`, `agent tui` and `agent run` — undecided.
- Reopen the latest thread with the latest agent, starting its service on demand — decided for bare `shrimpy`; not built.
- See which replies and work arrived while the terminal was closed — decided; not built.

### Models and signing in

- Name several candidate models for an agent and use the first available — kept; not built.
- See which model an agent resolves to, and add a provider by command — undecided.

### Agents, skills and memory

- Set up Shrimpy with one guided command — tracked under the release; decided as one agent, finished by talking to it.
- Get a second starter agent, the mechanic, for setup and repairs — dropped; the first agent is an admin and every agent is shown the setup skills.
- Update Shrimpy with a preview, a guided update, and an exact tag or SHA apply — tracked under the release.
- Show, inspect, rename and remove an agent, and set its configuration, by command — remove stays explicit and keeps data; no command yet.
- List, show, add, update, remove and validate skills by command — undecided.
- Search every agent's memory from the mechanic — replaced; an admin agent reaches other homes over SSH.
- Track, search and index the files of the whole workspace, and see its status — ordinary file search, checkpoints and derived indexes; shared global scope needs review; undecided.
- See which sources made up an agent's context, and the exact request a turn sent — `agent context` is a labelled preview; captured requests and source evidence are next.
- Edit shared context files once for every agent — comes with workspace context from the gateway, next.
- Have an agent write memory in its own voice (`memory-management`) — comes back with memory breadcrumbs.
- Get default upkeep watches, daily journals, journal compaction and hygiene audits — come back with the features they depend on; upkeep triggers install disabled.
- Ask an agent to remember something (`remember`), to search, or to search the web — wait until wanted.
- Run a command before each turn to add its output to the context — gone; breadcrumbs replace it.
- Be told automatically about fleet and gateway status, other sessions' activity, and worker and watch summaries — dropped; agents look when they need to.
- Hand a coding task to Codex, and list, read, send to, tail, wait for, cancel and close it — later, with helpers; unsupported backends are proposed removals.
- Add Pi extensions and packages to an agent — dropped, since durable can't run them.

### Looking after Shrimpy

- Restart or stop the gateway, read its logs, and run a service for each agent and the chat server — service operations for each program; command names and independent shutdown need review.
- Complete commands, agents and options with Tab in the shell — home-aware completion, generated from the real commands; on the list.
- See the version and the release name with `--version`, in help and in the terminal's header — kept by the keep list; not built.

### In a browser

- Browse an agent's files, tree, context, channels, triggers, runtime and transcripts, with folded output, images, thinking, usage and follow-latest — comes back in the web client, later.

### Reading

- Read a getting-started guide written for someone nervous, the reference docs, and a security statement — reference docs shrink to very little; skills and instructions carry the core; the release accounts for the rest.

## Ideas kept

Nothing here is scheduled, and nothing is built from it until it has been through review.

- Notifications wherever the owner wants them, on a desktop, in chat or on a phone, when work finishes while away. To start: something to deliver through, a chat provider or a desktop app. The working marks in each thread already say when work ends.
- Codemode: the model writes a short script that calls the agent's other tools in parallel, and only its output enters the context. To start: the core tools work. A durable tool wraps the standalone `pi-codemode` package, nested calls get the same validation and tool policy and show in clients, and a crash mid-script reports the whole script as interrupted. MCP through `pi-mcp` would build on it.
- A plain HTTP entry point. To start: a program that can't speak Pi's protocol needs in.
- A desktop chat app as the native client for channels, possibly a fork Shrimpy maintains. To start: chat providers, since it would plug in as one.
- Seams for building more of Shrimpy in parallel: extensions in the agent as folders with one entry point handed the same few things; the chat provider interface with a fake provider as its reference; a client core that the terminal and the web client share; landing a contract change on its own before the programs that follow it. To start: the core contracts have settled. No seam where only one thing will plug in, so the gateway stays one piece.
- Events from outside apps, such as MCP events or webhooks. They would arrive as a chat provider's messages and not as triggers, so agents keep taking nothing inbound. To start, all three: events are in an accepted proposal or a spec revision, `pi-mcp` speaks protocol `2026-07-28`, and a specific server's events are worth an agent reacting to (`docs/research/mcp-events-and-triggers-2026-10-04.md`).
- A fact held in the prompt: a document behind a prompt section for a fact only Shrimpy knows, such as who is reachable or which questions are open, that belongs in every request. To start: a case where a lookup isn't enough and the fact rarely changes, since each change costs a prompt-cache miss. Argued against: an agent trusts a value in its prompt and stops looking.
- Each context file as a prompt section of its own, so a changed file is sent alone to the models that take a change in place. The owner would rather have several small files than one `MEMORY.md`; today all of `context/` is one section.
- A message that wakes nobody, as the same flag as `quiet` on `send_message`, to leave something in a thread for an agent's next turn where people see it too. To settle: whether it is the same flag.
- The agent's tools as an agent meets them: their names (`send_message`, `read_messages`, `check_back`, `ask_agent`), what a channel's default thread is called (`main` today), naming a thread of a DM in `send_message` and `read_messages`, telling an agent to read a thread before it answers a message that went to everyone, and whether steered input says who sent it. To start: the owner tests them once the core is there. Questions of this kind are collected here and not asked one at a time.
- A member that is neither a person nor an agent, like the channel bots of IRC: a plain script that answers, or a model not trained to follow instructions (such as the one served locally as talkie), with a token that reads the feed and posts. To start: something asks for it. To settle: what wakes it, a mention or a prefix; whether an agent is told a message came from one, so it reads it as data; whether it leaves receipts. Until then the chat contract must not assume a member is a person or an agent.
- Tailscale carrying more: its policy can carry application permissions that Shrimpy could read as who is an admin, and an agent could have its own tailnet node with Tailscale inside its sandbox. To start: Tailscale present. Each saves a step and replaces nothing.
- Hearing a thread while working in it is under "Waiting on the owner", item 4.

## Not building

Left out on purpose, so that none of it creeps back in.

- Sandboxing for individual tools. Agents keep a real shell.
- A second run queue, transcript, task manager, outcome journal or activity cache beside Pi's.
- A receipt store beside Pi's that compares the content of retried requests. A request ID's first use wins.
- A compatibility layer for Pi's ordinary `ExtensionAPI`, or a generic service framework.
- A controller lease between clients, unless a real need appears.
- Heartbeat-based lock takeover or a PID ledger.
- A global scheduler, universal worker registry or network-wide job ledger.
- Automatic migration of old transcripts, tasks, manifests or clocks.
- Model calls to route ordinary input.
- Loop or flood control in the chat server or gateway. Agents' wake policies, instructions and `END` handle it.
- Native MCP, per-request model routing, cache warming, vector memory, journaling daemons and transcription. Each is a separate future decision; codemode is a later experiment.
- A mesh protocol, ACP product, visual redesign or mandatory hosting platform.
