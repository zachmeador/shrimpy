# 🦐 Redesign Status

Where the code falls short of the [design](README.md): promises it doesn't keep yet, and rough edges that are known. Work that hasn't started isn't listed here. Each design file has its own under "Not built yet". What was built and decided, by date, is in the [log](history/LOG.md).

As of 2026-10-05. An item leaves when it is fixed or when the design changes to match the code. Before each review pause, every item is fixed, raised with the owner or left here on purpose.

## Where the code trails the plan

### The three programs and what each owns

- After a crash nothing shows a notice, though the plan's row on recovery asks for one. Only a turn that is given up reaches the sender, as a failed receipt.
- A crash loop while an event is being handed over, or while chat is being told, is never broken: only a turn that was underway counts.
- Commands that go through the gateway warn about a version mismatch. Programs don't compare versions when they connect, and `sessions` and `agent status` don't check.

### The contracts between them

- Clients see Chord's and `pi-client`'s error types and codes, though contracts are meant to carry only Shrimpy's shapes. Refusals as a designed part of the contracts is [waiting on the owner](AUTHOR-TO-REVIEW.md).
- Renaming and archiving a thread carry no version, though the plan says they are versioned set-to-value updates, so an old retry could overwrite a later decision.
- Edits, deletes and reactions carry no request ID, so a provider replaying an old edit after a newer one would undo it.
- Only the author edits or deletes, checked against the caller, so a provider acting for a person it maps has no way to.
- The chat server's log of events never shrinks, and nothing shows a message's earlier versions.
- A skipped receipt carries no reason, so the sender of a message skipped behind a failed turn isn't told that writing again brings it back.
- The terminal polls the gateway's list and your thread lists every two seconds, because the contracts have no subscription for them. The agent's client has no detach and takes no abort signal, and a hung connection is only noticed when something is sent.
- Nothing shows a wake-up that is waiting: not `sessions list`, `sessions read` or the terminal. It needs a field in the agent's contract.
- The agent's own service is named `SessionDirectory`, though it now also reloads the home and lists and fires triggers.

### Identity and addressing

- Nothing removes a member, replaces a token or renames a person.
- A rename reaches the chat server only when that member next enters chat. The log of events doesn't help: an event names a message.
- A command run from an agent's shell prints a gateway refusal with no advice, where the agent's own link now adds what to do.
- The terminal reaches agents by name only, so with the gateway down it can't watch one. The `sessions` commands by a home's path can.
- A command's `--agent` takes the name of a home's folder, or a path, and not the name on the roster. For an agent whose name in `agent.json` differs from its folder, the line the terminal prints about stopping its work names an agent the command can't find.

### The conversation model

- A message that joined a running turn is marked answered by that turn's one reply, whether or not the reply speaks to it. You took that cost on 2026-10-05 with the rule that every message a person writes joins.
- In a room, who a message was for and the names in what was said since the agent last looked still come from what the agent remembers of the room. A member who joined and has not been mentioned is missing from them until a mention makes the agent ask again. The opening of an input, which says who is in the room, is asked afresh and has no such gap.
- When the chat store is replaced, an agent keeps its sessions behind the old store's threads, and goes on with what was unfinished in them. A wake-up that was waiting there, or a turn that was cut short, runs once more, calls the model, and then can't post: chat refuses the mark on the thread and the reply, and the agent reports each. It ends by itself. The agent knows the store was replaced, so it could stop that work and say so once.
- After a fresh start an agent has forgotten where it last looked, so its first wake in a room shows up to 20,000 characters of history, from before it joined included.
- An edit that removes a mention takes it from the original post too, for an agent that reads the feed afterwards, since an event shows its message as it now stands.
- A message recorded in the instant between a skipped message's receipt and the session noting it is handed over without the skipped one, which then shows one turn late.
- `send_message` has no `quiet` yet. It comes with chat providers, where it means a person isn't notified.
- The message tools have no timeout, so a chat server that hangs holds a turn until someone stops it.

### The home

- Pi's storage keeps every finished task and every entry, so the file on disk only grows: about a megabyte a day for a trigger that fires every minute, and little for one that fires hourly. Compaction bounds what a model is shown, not what is stored. You judged it no concern for now on 2026-10-05. The one cost today is that listing triggers scans every finished task.
- Nothing prunes the finished task that each event leaves in the agent's records, nor a wake-up's finished sleeper, and each `check_back` call scans the session's sleepers.
- The facts that come with a message are fixed when it is handed to its session, not when the session takes it up. Nothing differs yet, because each fact is fixed for a message. Pi has no hook for the moment input is taken up, so a fact that changes while a message waits needs a capture of its own.
- A reload that reads the model again, and a session's own model, are tested with a scripted model server and haven't met a real provider. Not tried: a server that a `models.json` no longer declares while a request to it runs, two reloads at once, a request running while a session's model is set, and a reload that fails halfway through moving the sessions. The models an agent says it can use are the ones Pi lists as available, which checks more than the start does, so the home's own model can be missing from the list.
- Skills are trails only. `/skill:name`, templates, required-tool filtering and choosing skills for one agent aren't built.
- The skills name what doesn't exist yet and say so: a setup command, OAuth sign-in and a command that removes an agent.
- No real sign-in has run. `shrimpy providers login` has been through a made-up sign-in and an API key, so a subscription's flow, a device code and the callback on a local port are untried, and so is a renewal at a real provider. Asking at a real terminal is not in the tests.
- Nothing lists what a folder is signed in to, or signs it out: an entry is removed from `providers/auth.json` by hand. The command signs in the folder and never one home, can't sign in to a server that a `models.json` declares, and doesn't open a browser. When it asks for a model it lists every model the provider has, whether or not the account can use it.
- A sign-in that is renewed at the provider and not saved, because the process died in between, is lost, and the folder has to be signed in again. A change to the credentials waits up to 30 seconds for another process to let go of the file, and that limit has no test. An `auth.json` that is a symbolic link is replaced by a plain file at the first renewal. A Shrimpy folder that the sign-in command makes is private to its owner, and one that `agent init` makes is not.

### The network

- An agent apart from the gateway is paired with three commands: `shrimpy up --listen`, `shrimpy members invite` and `shrimpy agent join`. Nothing lists the invitations that are out or takes one back, nothing shows where a gateway listens but its own start, and nothing makes it forget an address but deleting the file it keeps them in. `--listen` given to `up` when a gateway is already running only warns.
- An agent apart is reached by its name through the gateway, by the code the terminal uses, and no command reaches it: `shrimpy sessions`, `triggers` and `agent reload` find an agent by its home's folder, and `shrimpy gateway status` looks only on the machine it runs on. Two messages still say to start an agent apart with `shrimpy agent serve` on the gateway's machine, where it has no home. The browser's entry can't reach an agent apart. Nothing limits how many calls wait for one agent.
- A machine of your own comes in with `shrimpy members invite` and `shrimpy join`, and keeps its place in `machine.json` in its Shrimpy folder. Nothing takes a machine's token back at the gateway or lists your machines: leaving is deleting that file, and the gateway goes on knowing the token. A folder that has joined as you and also holds agents that belong to no gateway is at odds with itself: `shrimpy up` there starts a gateway and a chat server for them, and the commands that talk reach the gateway elsewhere and find nobody. On such a machine a command waits on a gateway that takes a connection and never answers for as long as the network does. The terminal's words still say "this machine's gateway".
- It has run for real since 2026-10-07 on a Linux machine of yours: a gateway, a chat server and two agents under one account, a third agent under another account of that machine that joined over loopback, each account's kept running by a service that `shrimpy gateway install` set up, and all on model servers on the LAN. Before that, a gateway on a Mac with Node 26 was paired with an agent, and then a machine of your own, on Linux with Node 22, through an SSH tunnel and straight over a tailnet. The tests have run on Linux, on Ubuntu 24.04 with Node 22.23, where 666 of 676 passed and three failed only for want of a dependency that was copied and not installed.
- **A person is named for the OS account that runs the gateway, and nothing renames one.** On an account made for Shrimpy that is the wrong name, and it takes the name an agent would have: the gateway under an account called shrimpy made a person called shrimpy, so no agent could be. The name was changed once by hand, in the roster's file with the gateway stopped.
- `shrimpy gateway install` and `uninstall` have run for real on Linux only, on your machine: a first install, an update of a unit written by hand and an uninstall, for the account with the gateway and for one whose agent belongs to a gateway elsewhere. Not run for real: lingering that takes an administrator, and everything on macOS, where the LaunchAgent passes `plutil -lint` and no `launchctl` command has run.
- A service gets the `PATH` of the shell that ran `shrimpy gateway install`, whatever that is. A command sent over SSH with no login shell has a shorter one than a login of the same account: on your Linux machine it has no `~/.local/bin`, where the `shrimpy` command is, so a service installed that way would leave its agents' shells without the command.
- A service gets its folder and nothing about the runtime directory, and an account has one runtime directory. So services for two folders of one account would share one gateway: the second finds the first's and starts only its agents.
- `shrimpy up` takes a home for gone whenever it can't see the home's `agent.json`, whatever the reason, and stops the agent it started there. It starts the agent again within seconds of the file being back, so a folder that can't be read for a moment costs each agent a restart.
- A home that appears is started within two seconds, so an agent made with `shrimpy agent init` starts with the `SOUL.md` it is given, and reads an edited one only when it is told to reload. The skill for making an agent says so.
- While `shrimpy up` keeps a folder running: an agent that someone else started is asked whether it still runs every two seconds. A home with no gateway of its own that appears in a folder whose agents all belong to a gateway elsewhere is started with no gateway to find, until `up` is started again.
- Not tried: the gateway ending while `up` follows the folder, though the chat server ending is in the tests, and a third stop request while an agent is starting.
- `shrimpy members`, the commands that talk and the terminal still say to start Shrimpy with `shrimpy up` when they find no gateway, which is wrong on a machine whose agents all belong to a gateway elsewhere. `shrimpy gateway status` says where that gateway is.
- A stop of an agent apart with a turn running and its gateway dead has not been tried: an idle one ends in about a second. The quarter-of-a-minute limits on connecting and on an answer ran at their real length only by hand, between two machines.
- A gateway that runs another version than the command that joins is warned of, and that warning has no test. The browser's entry is not pinged. A single frame that takes longer than half a minute to arrive could get its connection let go of.
- Five wrong codes end the joins on one connection, and nothing slows wrong codes across many connections or limits how many connections nobody has signed in on.
- To settle before the gateway's network entry: how the gateway opens a connection to a program on another machine, since today it dials a socket path; and who is asking on a connection that comes from another machine. Also how long a dead peer's registration lasts: an agent has one live body, so over a network an agent that restarts is turned away until its old connection times out.

### What an agent does without being asked

- A trigger that names a thread and comes due while the agent was down fires at the start before the link to chat is up, so that one occurrence fails. The next one works.
- A trigger file that doesn't check out is named by a reload and by `agent context`, and is missing from `shrimpy triggers` while the agent runs.
- A trigger or a wake-up that comes due during a stop's grace period can still start.
- A question's own thread outlives the question. A message that comes there later starts a session behind it, which has no memory of the session that asked. What every agent is told says that such a thread may be a question it asked, how to read it, and to pass on news that matters. A question whose post chat refuses leaves an empty thread that nothing archives.
- If an agent is killed between posting a question and keeping it, the question is not kept, and its answer wakes a session behind the question's thread like any message. It wasn't hit in a hundred runs.
- A check's standard error goes to a file in the home's `runtime/checks/`, because Pi hands a command's output and errors over as one stream. An engine that kept them apart would need no file.
- A second run of a trigger by hand, while the check of the first is running, starts a second check. `triggers show` has no row for a check run by hand until it has ended.
- Nothing shows that a wake-up is waiting, so nothing says that `/stop` written in its thread cancels it, which it does, and so does `shrimpy sessions stop`.

### Using it

- `/status` in the terminal shows what the contracts give. It doesn't show how full the context is, a wake-up that is waiting or a question that is open, the thinking level, or what went wrong at the provider last, and in a room it says only which agents are running and working. It is a command only as the whole text, so `/status now` is a message.
- The list of commands is the editor's own. The line of keys doesn't change while it is open, so the keys of the list aren't named. It doesn't open after a mention at the start, as in `@scout /st`, and on a terminal of 42 columns or fewer it shows the names without their lines. It and `/status` are tested on a fake terminal with the real editor, and were tried once in a pseudo-terminal by a script. Nobody has used them at a real terminal yet.
- `/stop` is a message, so it takes the chat server: with chat down the terminal can't stop an agent, and `shrimpy sessions stop` can.
- Bare `shrimpy` opens the list of agents and rooms, or your threads with the only agent when you are in no room. It doesn't remember your latest thread, start programs on demand, or mark what arrived while you were away.
- `pi-tui`'s regular mode clears the terminal's scrollback on some repaints, which the old terminal didn't do. The terminal can't scroll back past the newest 200 messages of a thread, or the newest 200 items of a session it is watching, and has no scrolling keys of its own.
- In a room's thread an agent's work isn't shown as it happens. Its session for that thread can be watched from the agent's screen, and `/stop` written in the thread stops the agents it is for. The terminal polls every room's threads every two seconds, and an agent's sessions while that list is on show.
- Where a session is has two wordings: `shrimpy sessions list` says "DM with scout (an agent)", and the terminal's list says "DM with scout · main". The order of an agent's sessions is the order it made them, which the contract doesn't promise. While a session is watched its list isn't asked for again, so the watch's title keeps the place it had.
- The terminal now ignores the release of a key, which a terminal that speaks the Kitty keyboard protocol reports and which made every press count twice there. It was fixed from reading `pi-tui` and a test, and hasn't been tried on such a terminal.
- `threads #ops` needs quotes in a shell, or the room's name is taken for a comment and dropped.
- `--no-wait` prints the IDs to follow up with, but no command waits on one.
- `run` prints only the first part of an answer posted in parts, and can't follow a message once 200 newer ones are in its thread.

### Tests

- Promises in the first build's Prove list that are built and have no test: a real-provider turn uses only the shell tool, not the file tools; a request ID reused with different content is tested in the chat server and not at the agent; and nothing asserts what becomes of a shell child that outlives a killed owner.
- The terminal client's tests still run on a stand-in for the chat server, some 300 lines, that repeats two of its rules. The agent's and the CLI's tests run on the real one.
- Small duplicates: a pause helper in `agent/chat/` and in `lib/retry`, a helper for talking in tests in `agent/testing/` and `cli/testing/`, and two fake terminals, in `cli/testing/` and the console's `draw/testing/`.
- A test that holds a scripted model at a gate and fails before it lets go hangs its run until the suite's timeout. The tests of a busy agent and of questions let go on the way out, and the wake-ups' test doesn't.
- Some tests assert that nothing happened after a pause, where no later event can be waited for: about a dozen, in the console's network and state tests, the agent's chat and stop tests and the registration tests. A few bound how long something takes, which could trip on a loaded machine. Neither has failed.
