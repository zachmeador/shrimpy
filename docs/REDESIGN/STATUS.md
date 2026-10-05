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

- After a fresh start an agent has forgotten where it last looked, so its first wake in a room shows up to 20,000 characters of history, from before it joined included.
- An edit that removes a mention takes it from the original post too, for an agent that reads the feed afterwards, since an event shows its message as it now stands.
- A message recorded in the instant between a skipped message's receipt and the session noting it is handed over without the skipped one, which then shows one turn late.
- `send_message` has no `quiet` yet. It comes with chat providers, where it means a person isn't notified.
- The message tools have no timeout, so a chat server that hangs holds a turn until someone stops it.

### The home

- Pi's storage keeps every finished task and every entry, so the file on disk only grows: about a megabyte a day for a trigger that fires every minute, and little for one that fires hourly. Compaction bounds what a model is shown, not what is stored. You judged it no concern for now on 2026-10-05. The one cost today is that listing triggers scans every finished task.
- Nothing prunes the finished task that each event leaves in the agent's records, nor a wake-up's finished sleeper, and each `check_back` call scans the session's sleepers.
- The facts that come with a message are fixed when it is handed to its session, not when the session takes it up. Nothing differs yet, because each fact is fixed for a message. Pi has no hook for the moment input is taken up, so a fact that changes while a message waits needs a capture of its own.
- Skills are trails only. `/skill:name`, templates, required-tool filtering and choosing skills for one agent aren't built.
- The skills name what doesn't exist yet and say so: a setup command, OAuth sign-in and a command that removes an agent.

### The network

- Joining from another machine waits for a VM on the LAN to test on.
- To settle before the gateway's network entry: how the gateway opens a connection to a program on another machine, since today it dials a socket path; and who is asking on a connection that comes from another machine. Also how long a dead peer's registration lasts: an agent has one live body, so over a network an agent that restarts is turned away until its old connection times out.

### What an agent does without being asked

- A trigger that names a thread and comes due while the agent was down fires at the start before the link to chat is up, so that one occurrence fails. The next one works.
- A trigger file that doesn't check out is named by a reload and by `agent context`, and is missing from `shrimpy triggers` while the agent runs.
- A trigger or a wake-up that comes due during a stop's grace period can still start.
- The terminal's Esc says there is nothing to stop while an agent is idle, so a waiting wake-up is cancelled only by `/stop` in its thread or by `shrimpy sessions stop`.

### Using it

- Bare `shrimpy` opens the list of agents and rooms, or your threads with the only agent when you are in no room. It doesn't remember your latest thread, start programs on demand, or mark what arrived while you were away.
- The terminal lists your threads with an agent, not the agent's sessions, so a session that isn't behind one of your threads can't be reached from it.
- `pi-tui`'s regular mode clears the terminal's scrollback on some repaints, which the old terminal didn't do. The terminal can't scroll back past the newest 200 messages of a thread.
- In a room's thread the terminal's Esc does nothing, and an agent's work isn't shown as it happens. `/stop` written in the thread stops them. The terminal polls every room's threads every two seconds.
- `threads #ops` needs quotes in a shell, or the room's name is taken for a comment and dropped.
- `--no-wait` prints the IDs to follow up with, but no command waits on one.
- `run` prints only the first part of an answer posted in parts, and can't follow a message once 200 newer ones are in its thread.

### Tests

- Promises in the first build's Prove list that are built and have no test: a real-provider turn uses only the shell tool, not the file tools; a request ID reused with different content is tested in the chat server and not at the agent; and nothing asserts what becomes of a shell child that outlives a killed owner.
- The terminal client's tests still run on a stand-in for the chat server, some 300 lines, that repeats two of its rules. The agent's and the CLI's tests run on the real one.
- Small duplicates: a pause helper in `agent/chat/` and in `lib/retry`, a helper for talking in tests in `agent/testing/` and `cli/testing/`, and two fake terminals, in `cli/testing/` and the console's `draw/testing/`.
- Some tests assert that nothing happened after a pause, where no later event can be waited for: about a dozen, in the console's network and state tests, the agent's chat and stop tests and the registration tests. A few bound how long something takes, which could trip on a loaded machine. Neither has failed.
