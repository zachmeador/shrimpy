# 🦐 Redesign Status

Progress on the [replacement plan](PLAN.md): where the code trails the plan. What each merge and review settled is in the [log](history/LOG.md).

Record review decisions, finished phases, commands and results, and blockers here. A phase is done when its Prove list has evidence from real candidate wiring, not equivalent mocks; a passing build or deleted files don't count. A newly found experience difference stays pending until reviewed.

## Where the code trails the plan

As of 2026-10-04. Before each review pause, everything under "still open" is fixed or raised with the user.

**Still open in phase 1**

- Bare `shrimpy` opens the list of agents, or your threads with the only agent. It doesn't remember your latest thread, start programs on demand, or mark what arrived while you were away.
- The terminal lists your threads with an agent, not the agent's sessions, so a session that isn't behind one of your threads can't be reached from it.
- The terminal polls the gateway's list and your thread lists every two seconds, because the contracts have no subscription for them. The agent's client has no detach and takes no abort signal, and a hung connection is only noticed when something is sent.
- `pi-tui`'s regular mode clears the terminal's scrollback on some repaints, which the old terminal didn't do. The terminal can't scroll back past the newest 200 messages of a thread.
- Joining from another machine, which waits for a VM on the LAN to test on.
- After a crash nothing shows a notice, though the plan's row on recovery asks for one. Only a turn that is given up reaches the sender, as a failed receipt.
- A crash loop while an event is being handed over, or while chat is being told, is never broken: only a turn that was underway counts.
- A skipped receipt carries no reason, so the sender of a message skipped behind a failed turn isn't told that writing again brings it back.
- Nothing prunes the finished task that each event leaves in the agent's records, nor a wake-up's finished sleeper, and each `check_back` call scans the session's sleepers.
- Nothing shows a wake-up that is waiting: not `sessions list`, `sessions read` or the terminal. It needs a field in the agent's contract.
- The terminal's Esc says there is nothing to stop while an agent is idle, so a waiting wake-up is cancelled only by `shrimpy sessions stop`.
- A trigger that names a thread and comes due while the agent was down fires at the start before the link to chat is up, so that one occurrence fails. The next one works.
- A trigger file that doesn't check out is named by a reload and by `agent context`, and is missing from `shrimpy triggers` while the agent runs.
- Pi's storage keeps every finished task and every entry, so the file on disk only grows: about a megabyte a day for a trigger that fires every minute, and little for one that fires hourly. Compaction bounds what a model is shown, not what is stored. You judged it no concern for now on 2026-10-05. The one cost today is that listing triggers scans every finished task.
- A trigger or a wake-up that comes due during a stop's grace period can still start.
- Commands that go through the gateway warn about a version mismatch. Programs don't compare versions when they connect, and `sessions` and `agent status` don't check.
- `--no-wait` prints the IDs to follow up with, but no command waits on one.
- `run` prints only the first part of an answer posted in parts, and can't follow a message once 200 newer ones are in its thread.
- Clients see Chord's and `pi-client`'s error types and codes, though contracts are meant to carry only Shrimpy's shapes.
- Renaming and archiving a thread carry no version, though the plan says they are versioned set-to-value updates, so an old retry could overwrite a later decision.
- A message recorded in the instant between a skipped message's receipt and the session noting it is handed over without the skipped one, which then shows one turn late.
- Promises in phase 1's Prove list that are built and have no test: a real-provider turn uses only the shell tool, not the file tools; a request ID reused with different content is tested in the chat server and not at the agent; and nothing asserts what becomes of a shell child that outlives a killed owner.
- The terminal client's tests still run on a 350-line stand-in for the chat server that repeats two of its rules. The agent's and the CLI's tests run on the real one.
- Small duplicates: a pause helper in `agent/intake/` and in `lib/retry`, a helper for talking in tests in `agent/testing/` and `cli/testing/`, and two fake terminals, in `cli/testing/` and the console's `draw/testing/`.

**Core contracts, before rooms**

All three are built: the roster, member IDs and tickets; the feed of events; and connecting by name through the gateway.

Nothing can make an edit, a delete or a reaction until the terminal has keys for it or agents have a tool, since the four commands for them were removed under the new rule for commands.

Left open by the roster and by connecting by name:

- A browser can list the programs and the roster and nothing more. It can't get a ticket, so it can't reach the chat server or an agent. How a page is recognized was decided on 2026-10-04 and gets built with the web client.
- Nothing removes a member, replaces a token or renames a person.
- A rename reaches the chat server only when that member next enters chat. The log of events doesn't help: an event names a message.
- A command run from an agent's shell prints a gateway refusal with no advice, where the agent's own link now adds what to do.
- The terminal reaches agents by name only, so with the gateway down it can't watch one. The `sessions` commands by a home's path can.
- To settle before the gateway's network entry: how the gateway opens a connection to a program on another machine, since today it dials a socket path; and who is asking on a connection that comes from another machine. Also how long a dead peer's registration lasts: an agent has one live body, so over a network an agent that restarts is turned away until its old connection times out.

Left open by rooms' first step:

- The chat store keeps a column for the event a post answers, which nothing writes or reads now. It goes at the next change of the store's shape.
- After a fresh start an agent has forgotten where it last looked, so its first wake in a room shows up to 20,000 characters of history, from before it joined included.
- `threads #ops` needs quotes in a shell, or the room's name is taken for a comment and dropped.
- In a room's thread the terminal can't stop an agent or show its work as it happens, and it polls every room's threads every two seconds.
- An edit that removes a mention un-addresses the original post for an agent that reads the feed afterwards, since an event shows its message as it now stands.
- Some tests assert that nothing happened after a pause, where no later event can be waited for: about a dozen, in the console's network and state tests, the agent's chat and stop tests and the registration tests. A few bound how long something takes, which could trip on a loaded machine. Neither has failed.

Left open by the feed of events, to settle before rooms and chat providers:

- Edits, deletes and reactions carry no request ID, so a provider replaying an old edit after a newer one would undo it.
- An agent notices a replaced chat store only when its cursor is past the newest position. A store that has grown past the cursor makes it skip events. A store's ID in the cursor would close that. Event IDs already stop a new store's event being taken for an answered one.
- Only the author edits or deletes, checked against the caller, so a provider acting for a person it maps has no way to.
- In a room, every reaction wakes the message's author, and an edit that newly mentions someone wakes them.
- The log never shrinks, and nothing shows a message's earlier versions.

**Still open in phase 2**

- Not built yet: compaction guidance, seeing the request a turn sent, and workspace context from the gateway.
- The facts that come with a message are fixed when it is handed to its session, not when the session takes it up. Nothing differs yet, because each fact is fixed for a message. Pi has no hook for the moment input is taken up, so a fact that changes while a message waits needs a capture of its own.
- Skills are trails only. `/skill:name`, templates, required-tool filtering and choosing skills for one agent aren't built.
- The skills name what doesn't exist yet and say so: a setup command, OAuth sign-in, resetting a session, rooms, starting a DM, and commands to list, rename or remove an agent.
- `send_message` and `read_messages` reach this thread and the agent's DM with any member. `quiet`, `#channel`, reactions, edits and delivery status come with rooms and providers.
- The message tools have no timeout, so a chat server that hangs holds a turn until someone stops it.
- The agent's own service is named `SessionDirectory`, though it now also reloads the home.

**Planned for a later phase**

- OAuth sign-in, and a way to choose your name in chat, which is your OS username today: phase 3.
- A web client in phase 3, `chat/providers/` in phase 5, and Telegram in phase 6.
- In `agent/intake/`: chat commands, wake policies and the unread cache for rooms.
- The plan's triggers row promises one coalesced overdue run and also says a restart doesn't backfill, which reads two ways. Old Shrimpy ran a missed watch once at the next start. Phase 4 settles it.
