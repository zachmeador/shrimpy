# 🦐 What Is Open

The one list of what is open in Shrimpy: what waits on the owner, what isn't built, what falls short, what old Shrimpy had that isn't back, ideas kept, and what is left out. A line leaves when it is built or dropped, in the change that does it; open work is kept here and not in GitHub issues, and the words are in [how-it-is-built.md](how-it-is-built.md).

**A draft, made on 2026-10-08.** The owner is checking it against `docs/REDESIGN/`. Until they say it holds everything, the status list, the review list and the plan in that folder are the authority, and they are what a change updates, not this file.

## Waiting on the owner

1. **A first real sign-in.** `shrimpy providers login` has only run against a made-up sign-in and an API key. The owner runs it with a real subscription and says whether an agent then answers.
2. **The lines for a machine of the owner's own.** `shrimpy members invite` with no name and `shrimpy join <link>` are built and not yet approved. The owner agreed to the way in "as long as the ux is simple and clean" (2026-10-06).
3. **The owner's name on a gateway run by an account made for Shrimpy.** The gateway names the person for the OS account running it, which can take an agent's name. Should the name be told to the gateway at first start, set by a command, or something else?
4. **An agent hearing a thread while it works in it.** The owner's idea (2026-10-06): an agent working in a thread hears what anyone says there at its next step, waking nobody; details in `docs/REDESIGN/proposals/hearing-a-thread.md`. Yes, no, or just one sentence telling agents to read the thread first?
5. **`shrimpy up` starts an agent that ends again, alone.** The owner wrote "a user expects to be able to add an agent without having to think about restarting a service or running things" (2026-10-07), and `up` now restarts an agent that ends. The owner had confirmed (2026-10-04) that `up` stops everything when any program ends, and hasn't approved the change.
6. **What a refusal is in Shrimpy's contracts.** Refusals carry their reason inside Pi's error code, and clients see Chord's and `pi-client`'s error types. Whether contracts carry only Shrimpy's shapes is undecided and not urgent.
7. **Choices made in the build, for the owner to strike.** `ask_agent`'s rules (30-minute default, a thread per question, five open); trigger check and breadcrumb rules; `--agent` defaulting to a folder's only agent; a reload applying the model; a reload rebuilding base instructions; first setup making one admin agent.

## Not built yet

Next: the provider interface, and the home's compaction, request inspection and workspace context. Later: agents everywhere, helpers and what daily use asks for.

### The three programs

- Untried: power loss, a full disk, log damage, and a kill during a tool commit.
- The owner lock is untried on network file systems and sandbox mounts.

### The contracts

- How peers stay compatible across machines is undecided; today every program must run one version.
- The agent's contract lacks reset, fork, withdraw, thinking level, defaults, context queries, completion, provider status, delegation and attachments.

### Identity and addressing

- Per-person permissions aren't modelled; admin is the only role.

### The conversation model

- The chat server lacks source bindings and the publication and delivery operations.
- The provider interface for outside chat apps, with its shared helpers, is not built.
- A fake provider, the interface's reference, is not built.
- Untried: two small-model agents finishing a task without going round in circles.
- Untried: a fake provider driving the chat contract, so nothing Telegram-specific leaks in.
- Untried: a reaction and an edit crossing a bridge both ways.
- Leaving a room and removing a member are not built.

### The home

- Compaction with Shrimpy's guidance for dates, voice, paths and work state. Pi compacts by default and no test crosses the threshold.
- Seeing the request a turn sent is not built.
- Workspace context hosted by the gateway is not built.
- Skills for default watches, delegation, update, journals, audits, `remember`, search and web search aren't rewritten.
- Untested: context captured at consumption for queued input, steering, tool rounds, reload, compaction and restart.
- Untested: real provider input matching live and reopened raw and effective history.
- Untested: editing a context file while work is queued.
- Untested: killing the owner during blocking compaction.
- Untested: a tool call spanning a resource reload and a code or environment swap.
- Untested: early cost checks of context capture.
- Nothing limits the size of `SOUL.md`, context files, the skill list or earlier messages.

### The network

- The chat server on a machine other than the gateway's is not built.
- Untried: an agent in a container with no shared files joining with its invitation.
- Telegram as the first chat provider is not built.
- Reading from Tailscale who is at the other end of a connection is not built.
- Sandboxes are designed and untried, including grants for a host model server and Tailscale's `100.64.0.0/10`.
- No skill yet covers `tailscale` for adding a machine, or pairing over SSH.
- No encryption of Shrimpy's own: outside a tailnet, tokens and messages travel in the clear.
- On Linux a service and a shell may use different runtime directories.
- Untested: completion against the agent's filesystem, and moving an attachment.
- Untried: an agent in a real sandbox reaching only the gateway and its model provider.
- Untried: a console message in a Telegram-bridged channel appearing in Telegram, labelled with the sender.
- Untried through Telegram: resets, duplicates, offline periods, late replies, long output, media, lost acknowledgments.

### What an agent does without being asked

- Helpers, child sessions a parent starts, are not built.
- The retained Codex workflow for delegated coding is not built.
- Untried: delegation through the real Codex backend, and a background helper waking its parent.
- A trigger that names a thread shows no trigger line in it yet.
- Untried: a real model using `ask_agent`, asking and then waiting.

### Using it

- Shell completion is missing, and a startup line still seeks the old one.
- Missing thread operations: reset, archive, resume, fork, naming, search and export.
- Missing for chat apps without a screen: `/new`, `/help` and an agent-answered `/status`.
- Reactions, edits and deletes have no client keys and no agent tools.
- Terminal model choices are missing: favourites, a saved default, thinking level, an agent's starting model.
- Attachments, clipboard files and images included, are not built.
- The search tools and an image-viewing tool are missing.
- Memory breadcrumbs, their search index and the `memory-management` skill are not built.
- Old terminal affordances are missing, and so is a screen listing every key.
- The web client is not built, its URLs, permissions and CSRF rules are undecided, and the browser entry serves dotfiles.
- Untested: keyboard, editor, file, image and shell interactions.
- Untested: agent navigation, preflight failure and several clients.
- Untested: web queries and subscriptions, new IDs and anchors, large transcripts, and web attaching like the terminal.
- Untested: presentation content never reaching provider input.

### The release

- Outcome: an installable release with one engine, and the old tree gone.
- Account for every CLI entry, slash command, export, setup and update recipe, service definition, template, skill, test, doc and security statement.
- `SECURITY.md`, `CONTRIBUTING.md` and `THIRD_PARTY_NOTICES.md` go with `shrimpy-old/` and need writing anew.
- Very little reference documentation: skills carry the core ux, and the README describes what ships.
- The keep list, `docs/REDESIGN/history/keep-list.md`, is the source of what is kept of old Shrimpy's voice.
- The redesign folder is deleted at the release, "only after i've gone through everything and nothing seems to have been missed" (2026-10-08).
- `AGENTS.md`, `README.md`, `docs/README.md` and `lint/boundaries.js` point into the redesign folder and are repointed when it goes.
- The root `CHANGELOG.md` is old Shrimpy's; the changelog skill says how the replacing release is written.
- Every old command and affordance that hasn't come back needs a decision (see the old-Shrimpy list).
- Default locations for machine-level data, and service installation for each program, are not done.
- Eleven idea docs leave `shrimpy-old/` before it goes, for rewriting later: session-001, surface-009, agent-003, workspace-002, app-habitats, memory-design, story-worlds, promoting-browser-workflows, agent-specific-tui-surfaces, desktop-spotlight-surface, framework-design.
- Delete `shrimpy-old/`, `AppRuntime`, the session pool, leases, old binaries and dependencies, and any scaffolding in the new tree.
- Unproven: build, lint, package, lifecycle and full test runs in an isolated checkout.
- Unproven on macOS and Linux: install, setup, tagged update, restart and uninstall without losing home data.
- Unproven: code and dependency deletion against old Shrimpy at `574bb2c`, and resource use at startup, idle and under load.
- Gate: if client and framework complexity outweigh the runtime savings, revise before going live.
- Updating Shrimpy is not built; the owner wants "a good ux" "especially for people with multi-machine setups" (2026-10-08).
- A setup command is not built; a new setup takes three commands.
- Moving over from old Shrimpy is not built: fresh homes, agents bring their own data, triggers and providers start disabled.

## Known gaps

Where the code falls short of what was decided.

### The three programs and what each owns

- After a crash nothing shows a notice; only a given-up turn reaches the sender.
- A crash loop while handing over an event or telling chat is never broken.
- Programs don't compare versions when connecting, and `sessions` and `agent status` don't warn.

### The contracts between them

- Thread rename and archive carry no version, so old retries could overwrite newer ones.
- Edits, deletes and reactions carry no request ID, so replays could undo newer edits.
- Only the author can edit or delete, so a provider acting for someone cannot.
- The chat server's log of events never shrinks, and nothing shows a message's earlier versions.
- A skipped receipt carries no reason, so senders aren't told that writing again retries it.
- The terminal polls lists every two seconds, and a hung connection is noticed only on sending.
- Nothing shows a waiting wake-up, nor that `/stop` cancels it.
- The agent's service, `SessionDirectory`, also reloads the home and fires triggers.

### Identity and addressing

- Nothing removes a member, replaces a token or renames a person.
- A rename reaches the chat server only when that member next enters chat.
- A gateway refusal printed in an agent's shell gives no advice.
- The terminal cannot watch an agent when the gateway is down.
- `--agent` takes a folder name, not the roster name, so some advice names an unfindable agent.

### The conversation model

- A message that joined a running turn counts as answered even if the reply ignores it.
- In a room, an agent's memory misses members who joined and weren't mentioned.
- After a chat store replacement, an agent reruns unfinished old-thread work, then can't post.
- A fresh agent's first room wake shows up to 20,000 characters of history.
- An edit that removes a mention removes it from the original post too.
- A skipped message shows a turn late if another is recorded just before the session notes it.
- `send_message` has no `quiet` option for not notifying a person.
- The message tools have no timeout, so a hung chat server holds a turn until stopped.

### The home

- Pi's storage never prunes finished tasks and entries, so its file only grows.
- Nothing prunes the finished task each event leaves or a wake-up's finished sleeper.
- Facts that come with a message are fixed at hand-over, not when the session takes it up.
- Model reload is untried with a provider sign-in, and the usable list can omit the home's model.
- Skills are trails only: no `/skill:name`, templates, required-tool filtering or per-agent choice.
- The skills admit there is no setup command and no command to remove an agent.
- Nothing lists or removes a folder's sign-ins, and `providers login` can't sign in a declared server.
- A renewed sign-in lost when the process dies must be redone, and a symlinked `auth.json` is replaced.

### The network

- Nothing lists open invitations, takes one back, shows where a gateway listens, or forgets an address.
- Only the terminal reaches an agent apart by name; `sessions`, `triggers` and `agent reload` can't.
- Nothing takes a joined machine's token back, and a joined folder with local agents conflicts.
- On Linux three browser-bundling tests failed for want of an installed dependency.
- The service installers have only run for real on Linux, never with administrator lingering.
- A service gets its installer's `PATH`, which over SSH can lack `shrimpy`'s directory.
- Two folders of one account would share one gateway.
- `shrimpy up` treats an unreadable `agent.json` as a gone home, costing the agent a restart.
- A new home starts within two seconds, so its edited `SOUL.md` needs a reload.
- A new gatewayless home in a folder whose agents belong elsewhere starts with no gateway to find.
- Untried: the gateway ending while `up` follows the folder, and a third stop mid-start.
- Where agents all use a gateway elsewhere, commands wrongly say to run `shrimpy up`.
- Untried: stopping an agent apart mid-turn with its gateway dead, and the 15-second limits.
- The version-mismatch warning on joining has no test, and the browser's entry is not pinged.
- Nothing slows wrong join codes across many connections or limits unsigned connections.
- A dead connection keeps its agent registered for 30 seconds, turning away a restart.

### What an agent does without being asked

- A thread trigger due while the agent was down fires before chat is up, and fails.
- An invalid trigger file is missing from `shrimpy triggers` while the agent runs.
- A trigger or wake-up due during a stop's grace period can still start.
- A later message in a question's thread starts a session that doesn't remember the question.
- A question is lost if the agent is killed between posting and keeping it.
- A check's standard error is kept in a file in `runtime/checks/` only because Pi merges both streams.
- A trigger run by hand during its check starts a second check, and `triggers show` omits it.

### Using it

- `/status` omits context fullness, waiting wake-ups, open questions, thinking level and the last provider error.
- The command list doesn't open after a mention or name its keys, and drops descriptions when narrow.
- The `/model` list opens late after fast keys, never after a mention, and offers an unusable `default`.
- A command for nobody gets no answer or receipt, and a `/model` session is unlisted until it speaks.
- `/stop` is a message, so the terminal can't stop an agent while chat is down.
- Bare `shrimpy` doesn't reopen your latest thread, start programs, or mark what arrived while away.
- The terminal clears scrollback on repaints, shows only the newest 200 items, and has no scrolling keys.
- An agent's work in a room's thread isn't shown as it happens, and room threads are polled.
- A session's place has two wordings, its order isn't promised, and a watch title goes stale.
- The fix for doubled key presses on Kitty-protocol terminals is untried on one.
- `threads #ops` needs quotes in a shell.
- `--no-wait` prints IDs to follow up with, but no command waits on one.
- `run` prints only a multi-part answer's first part and can't follow past 200 newer messages.

### Tests

- Untested: file tools in a real-provider turn, a reused request ID at the agent, an orphaned shell child.
- The terminal client's tests run on a 300-line chat server stand-in repeating two of its rules.
- Small duplicates remain: a pause helper, a talking helper in tests, and two fake terminals.
- A test that fails before releasing its scripted model's gate hangs until the suite's timeout.
- A dozen tests assert nothing happened after a pause, and some bound timing, which load can trip.

### Other known gaps

- A promotion or demotion reaches an agent's own check only on connections made after it.
- From an agent's shell, `agent init`, `agent serve` and `up` skip the admin check, and `gateway status` lists no admins.
- The chat server's `head` is server-wide, revealing message counts of channels the caller isn't in.
- A hosted thread's view stays in the chat server's memory until the server stops.
- Two chat servers can briefly hold one name at a restart, so the console picks the newest.
- Input order in a session leans on Pi's task numbering, which Pi doesn't promise.
- A failed or given-up wake-up has no receipt and is reported only on standard error.
- Three quick reactions to one of an agent's messages can get two answers.
- A `/stop` with nothing to stop looks ignored, and `@typo /stop` stops every agent in the room.
- `models.json` takes the `openai-completions` API only, and refuses other APIs or unsupported keys.
- The starter `SOUL.md`'s shrimp emoji makes the small local model answer goodbyes a third of the time.
- `startIntake` and `stopIntake` remain in `agent/chat/`, and `host/` exports an owner lock nothing uses.
- Untried: an agent apart that stops answering mid-request, and many clients asking for one agent.
- Untried terminals: iTerm2, Terminal.app, Linux terminals and tmux.

## From old Shrimpy, not back

What old Shrimpy let a person or an agent do that this one doesn't; the owner marks each keep, later or drop.

### In outside chat apps

The owner, 2026-10-08: "forget about discord, telegram, buzz, etc. not on my radar at this point. still open to the idea of chat adapters because some people might really want to use a particular platform but they're not mvp". The phone is reached by the web client.

- Talk to an agent from Telegram — not in the first release; with a chat adapter, if ever.
- Give each agent its own Telegram bot — not in the first release; with a chat adapter, if ever.
- Pick which agent answers in a Telegram chat — not in the first release; with a chat adapter, if ever.
- Limit which chats and people may talk to an agent — not in the first release; with a chat adapter, if ever.
- See typing, formatted and split replies, and sender labels — not in the first release; with a chat adapter, if ever.
- Have quick bursts of messages merged into one — not in the first release; with a chat adapter, if ever.
- Send a photo in Telegram and have the agent see it — not in the first release; with a chat adapter, if ever.
- Send a message that doesn't notify a person — not in the first release; with a chat adapter, if ever.
- Reach a person where they were last active — not in the first release; with a chat adapter, if ever.
- Bind a channel to a chat app, and unbind it — not in the first release; with a chat adapter, if ever.
- Set up Telegram with a guided command — not in the first release; with a chat adapter, if ever.
- Start fresh in a chat app with `/new` or `/clear` — not in the first release; with a chat adapter, if ever.
- Ask `/help` in a chat app, filtered to what the person may do — not in the first release; with a chat adapter, if ever.
- Set the thinking level with `/thinking` in a chat app — not in the first release; with a chat adapter, if ever.

### Conversations and sessions

Marked by the owner on 2026-10-08. Nine lines were dropped and are gone from this list.

- Archive or rename a thread — wanted: "yeah this is needed ux". The chat server does both, and nothing a person uses reaches them.
- Post to a room from the shell — wanted: "i can think of reasons this is needed. and it's not that complicated".
- Delete a room — wanted, and new: leaving a room and removing a member can wait "as long as you can delete a room". Nothing deletes one.
- Search past threads and sessions — wanted as one tool for agents: "probably makes sense to add one agent tool for this".
- Leave a room or remove a member — later.
- Compact a session by hand — later, with the compaction work.
- Copy the agent's last answer — later.

### The terminal

Marked by the owner on 2026-10-08. Fourteen lines were dropped and are gone from this list.

- A way to show the keys — wanted: the line of keys at the bottom "is getting a bit crowded. some way to display keys is needed". The owner means to restyle the terminal a little at some point.
- The shrimp in the terminal's tab title — wanted, and soon: "move this bad boy up the priority stack".
- See what arrived while the terminal was closed — later, and soon.
- Reopen the latest thread with the latest agent — later.
- Open settings — later; there is nothing to set yet.
- Set an agent's thinking level with `/thinking` — later; it would work as `/model` does.
- Sign in or out from the terminal — later; `shrimpy providers login` does it from a shell.
- Paste clipboard images into a message — later, with attachments.
- Edit a message the agent hasn't picked up yet — later, with the ways in for edits and reactions.
- Use a fullscreen mode — later.

### Models and signing in

- Name several candidate models for an agent and use the first available — kept.
- See which model an agent resolves to, and add a provider by command — undecided.

### Agents, skills and memory

- Set up Shrimpy with one guided command — tracked under the release.
- Get a second starter agent, the mechanic — dropped; the first agent is an admin.
- Update Shrimpy with a preview, a guided update, or an exact tag — tracked under the release.
- Show, inspect, rename, remove and configure an agent by command — remove keeps data.
- List, show, add, update, remove and validate skills by command — undecided.
- Search every agent's memory from the mechanic — replaced by an admin agent using SSH.
- Search the files of the whole workspace, track their changes, and see its status — undecided.
- See what made up an agent's context and the exact request a turn sent — next.
- Edit shared context files once for every agent — next.
- Have an agent keep memory notes in its own voice — comes back with memory breadcrumbs.
- Get default upkeep watches, daily journals, journal compaction and hygiene audits — come back with their features.
- Ask an agent to remember, search or search the web — wait until wanted.
- Add a command's output to an agent's context each turn — gone; small fact files replace it.
- Be told fleet status, other sessions' activity and worker summaries unasked — dropped.
- Hand a coding task to Codex, then follow, steer and cancel it — later, with helpers.
- Give an agent extra tools and commands through extensions — dropped.

### Looking after Shrimpy

- Restart or stop the gateway, read its logs, and run services for each program — undecided.
- Complete commands, agents and options with Tab in the shell — planned.
- See the version and release name with `--version`, in help and in the header — kept.

### In a browser

- Browse an agent's files, tree, context, channels, triggers, runtime and transcripts — comes back with the web client.

### Reading

- Read a gentle getting-started guide, the reference docs and a security statement — reference docs shrink.

## Ideas kept

Nothing here is scheduled.

- Notifications when work finishes while away; need a chat or desktop app to deliver them.
- Codemode: the model writes a script calling the agent's other tools; needs the core tools first.
- A plain HTTP entry point, once a program that can't speak Pi's protocol needs in.
- A desktop chat app as the native client for channels; starts after chat providers exist.
- Seams for building in parallel (agent extensions, a provider reference, a shared client core), once contracts settle.
- Events from outside apps as chat messages; revisit when a spec, client support and a use exist.
- A fact held in the prompt, for what only Shrimpy knows; starts when a lookup isn't enough.
- Each context file as its own prompt section, so a changed file is sent alone.
- A message that wakes nobody, perhaps the same flag as `quiet`, to leave notes for an agent.
- Tool names, default thread name, DM thread addressing and steered input's sender, tested once the core exists.
- A member that is neither person nor agent, like an IRC bot; starts when something asks.
- Tailscale policy read as who is an admin, and an agent with its own tailnet node; needs Tailscale.
- Hearing a thread while working in it is under Waiting on the owner, item 4.

## Not building

Left out on purpose, so none of it creeps back.

- Sandboxing for individual tools; agents keep a real shell.
- A second run queue, transcript, task manager, outcome journal or activity cache beside Pi's.
- A receipt store beside Pi's that compares the content of retried requests; a request ID's first use wins.
- A compatibility layer for Pi's ordinary `ExtensionAPI`, or a generic service framework.
- A controller lease between clients, unless a real need appears.
- Heartbeat-based lock takeover or a PID ledger.
- A global scheduler, universal worker registry or network-wide job ledger.
- Automatic migration of old transcripts, tasks, manifests or clocks.
- Model calls to route ordinary input.
- Loop or flood control in the chat server or gateway; agents' wake policies, instructions and `END` handle it.
- Native MCP, per-request model routing, cache warming, vector memory, journaling daemons and transcription; each is a separate future decision.
- A mesh protocol, ACP product, visual redesign or mandatory hosting platform.
