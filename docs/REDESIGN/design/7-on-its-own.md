# 🦐 What an agent does without being asked

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

It covers waking itself later, standing triggers, breadcrumbs, asking another agent and helpers.

**The design**

**Design, confirmed on 2026-10-04.** It builds on the task that follows a chat event to its receipt.

1. **One task follows any input.** Today the task follows a chat event. It becomes the task that follows an input from any source: a chat event, a trigger's occurrence, a wake-up the agent asked for, or the answer to a question it asked another agent. In every case it hands the input over in order, waits for the turn that answers it, whatever the session goes on to do afterwards, posts the final text to the session's thread if it has one, and tells the source how it ended. Working marks, stop and recovery then cover all four with no code of their own.
2. **A wake-up is a tool, not a command.** `check_back({in, at, note})` wakes the session that called it, once, after a delay or at a time: "in 5 minutes, check that build". It belongs to a conversation, and a tool knows which session called it. Pi's durable sleep is the timer, so it survives a restart.
3. **A standing trigger is one small Markdown file** in the home's `triggers/`, named for the trigger. Its front matter holds the schedule, `every: 1h` or `cron: "0 3 * * *"` with a timezone, and its body is the prompt. Commands write the file and check it first, so a small local model that gets a schedule wrong is told at once. An edit by hand takes effect on reload, and an invalid file keeps the last valid definition. This takes the place of `triggers.json`.
4. **A trigger has a session of its own unless it names a thread.** Its own session lives on from one occurrence to the next, which is the heartbeat pattern, and you watch it like any session. Its final text goes nowhere: it uses `send_message` when it has something to say. With `thread:` the occurrence goes to the session behind that thread and the reply is posted there. The small trigger line in the thread comes later, with a change to the chat contract.
5. **A check decides whether there is news, and what news does.** With `check:` a command runs at each occurrence and no model is called unless there is news. `when:` says what news is: `changed` since last time, which is the default, any `output`, or `always`. `then:` says what news does: `wake` the agent with the prompt and the output, marked as data, or `note` it as a [breadcrumb](7-on-its-own.md) in `breadcrumbs/<trigger>.md`, which wakes nobody. A check that fails is news, and says so the same way.
6. **Commands,** which act on the agent whose shell they run in, and take `--agent <name>` elsewhere: `shrimpy triggers` lists them with the next run and the last outcome, `add` makes or replaces one, `show` prints one with its recent occurrences, `run` fires one now, `on` and `off` enable and disable, and `remove` deletes one.
**Asking another agent, agreed tentatively on 2026-10-05, and built on 2026-10-06.** You said to go ahead and add it to the design, and that you may reshape it later. Agents can already DM each other. What is missing is the answer coming back to the conversation that needed it: today a reply in a DM wakes the session behind that DM, and the session that was talking to you never hears it.

- A tool, `ask({to, text})`, posts the question in the agent's DM with another agent, as `send_message` would. The asking agent's turn goes on, and it ends it when it has nothing else to do.
- When the other agent has answered, or can't, the result arrives in the session that asked, as an input from a fourth source, and the agent carries on from it. It is told the answer, or that the other agent read the question and said nothing, or that its turn failed and why, or that it hasn't answered after a time limit and may not be running.
- Only an agent can be asked. A person leaves nothing that says they have answered, so the tool says to use `send_message` and carry on when they write back.
- The question has to stand alone: the other agent sees nothing of the thread it was asked from.
- In a room none of this is needed: an agent that mentions another is woken by the answer in the same session.
- The spike on the branch `spike/ask-and-resume` showed the plumbing holds through kills and chat outages, with scripted models. No real model has used the tool, so whether a small one asks, ends its turn and waits is untested.

**Mechanics of asking,** settled by the coordinator on 2026-10-06, built that day, and yours to change. Two things the spike found awkward have gone since: a receipt is an event in the feed now, so no second connection to chat is needed, and one task follows any input, so an answer is taken up like any other input, with its reply, its working mark and its stop.

1. `ask_agent({to, text, within?})`. The name says who can be asked, and matches `send_message` and `read_messages`: a bare `ask` invites a model to reach for it when it wants to ask a person something, which is only a reply. `to` is `@name`, and the name has to be an agent's. `within` is how long to wait, such as `5m` or `2h`: 30 minutes if left out, from one minute to a day. The tool answers at once that the question is asked and that the answer will come here as a new input.
2. Each question gets a thread of its own in the agent's DM with the other agent, named for how the question starts, and is posted there. The other agent takes it up as it takes up any DM message, in a session of its own for that thread. You asked whether a question made a new thread, and it turned out it should: see 4. The first version of this mechanic posted in the DM's main thread.
3. The agent keeps each question that is open in its records: who was asked, which session asked, the question's message and when it gives up.
4. While a question is open, what the asked agent posts in the question's thread belongs to the question and wakes no turn there. That is what keeps two agents from answering each other in circles, as the spike saw. With a thread for each question the rule is exact, because nothing else is ever in that thread. In the main thread it wasn't: an agent can't tell an answer from anything else the other agent posts until the receipt names it, so two agents that asked each other at the same moment each passed over the other's question and waited out their time.
5. The question closes when the asked agent leaves its receipt on it. In one commit the agent closes the question and takes the result up as an input of the session that asked: the reply, when the receipt says answered; that the other agent read it and said nothing; that its turn failed, and why; or that it was stopped. A receipt that says skipped leaves the question open, since the other agent will be shown it with its next message.
6. A question that is still open when its time is up closes the same way, and the session is told the other agent hasn't answered and may not be running. Before it says so the agent reads the question from chat once, and closes with the receipt if the asked agent has left one, so an answer whose receipt the feed hasn't brought yet is still told as the answer. With chat away it waits for chat. An answer that comes after a question has closed is an ordinary message in that thread.
7. The result waits for the turn that is running, as any agent's message does, and its turn's reply is posted to the asking session's thread like any other.
8. A session may have five questions open at once. Stopping a session's work closes its open questions and says nothing more: the DM still has whatever is answered. A result that is skipped, by a stop or because the turn ahead of it failed, is kept and shown with the session's next input, as a skipped message is.
9. What every agent is told gains a line on when to ask and when to send a message, and one for the agent that is asked: a question comes in a thread of its own, so when it seems to follow from earlier ones, `shrimpy threads <name>` lists the threads with that agent and `shrimpy read <thread>` shows one. That is your answer to the asked agent starting each question with no memory of the last.


7. **Order of building:** the one task and `check_back`; then standing triggers with a prompt; then checks and breadcrumbs. Asking another agent waited for [rooms](4-conversation.md), which are built now, since how two agents talk without going round in circles is one question in a DM and in a room. Helpers and the trigger line in chat follow.

- A standing trigger is defined by a file in the home's `triggers/`: front matter for the schedule and the check, and the prompt as its body. The files are read at the start and on reload, and commands that write one check it first.
- A trigger and each of its occurrences are separate durable tasks. A trigger's task belongs to a conversation of the agent's own that is no session, and an occurrence belongs to the session it goes to. Occurrences are marked `background: true`, so changing or cancelling a trigger doesn't cancel a running occurrence.
- The trigger's task keeps its revision and its next occurrence. The definition, with its thread, prompt and overlap, is kept in Shrimpy's records and read at each occurrence. Admit prompt work with a stable trigger and occurrence ID.
- **What a trigger brings in is data, not instructions.** The trigger's own prompt is the instruction, and it comes from whoever wrote the trigger. What a firing brings with it, a command's output today and perhaps an outside event's payload later, reaches the model marked as something to read, never as something to obey. Old Shrimpy pasted a command's output into a message its skill called an instruction; this one doesn't.
- **An occurrence keeps its payload apart from the prompt.** It carries an ID from its source, when it fired and a payload, beside the trigger's prompt and never merged into it, so the two can be told apart in storage, in what the model is shown and in what a client draws. Both rules come from the [MCP events research](../../research/mcp-events-and-triggers-2026-10-04.md).
- Command occurrences record intent before running. If an unsafe command had started when the owner died, the occurrence reports interrupted and isn't rerun. A finished result and emission decision are kept, so an admission retry doesn't repeat the check.
- The extension owns coalescing, overlap, timeouts, emission, reload and cancellation policy. Pi owns checkpoints, outcomes and observation. The host only installs code and seeds selected definitions.
- Cancelling all work in a home includes running occurrences and helpers, not enabled triggers.
- Reuse the existing calendar and output-filter helpers.

**Breadcrumbs.** A fact that moves reaches an agent with its next input, once, when it is new to that session. You asked for it because a model in a long session stops making a check it has made hundreds of times to no result: "injecting context that prompts it to be more alert to environmental changes feels useful to prevent this".

- Each fact is one small file in a folder of the home: a line or two, and how to look closer. A trigger's check, a script or the agent may write one.
- When an input is handed to a session, Shrimpy compares each file with what that session last saw, adds the ones that differ to the input, and commits what it showed with the input. A session that was idle through several changes is told the latest once.
- Nothing enters the prompt, so no model loses its cache, and nobody is woken. What can't wait is a trigger that wakes the agent.
- A breadcrumb prompts a look and doesn't replace it. The lookup stays the source of truth.
- A breadcrumb is data, not instructions, under the same rule as [what a trigger brings in](7-on-its-own.md). It reaches the model marked as something to read.
- A file holds the fact and never the time it was checked, or every check would count as a change.
- A check that fails writes that into its file, so a dead check is news and not silence.

Settled on 2026-10-04 with the trigger design: the folder is `breadcrumbs/`, and a trigger whose check says `then: note` owns the write, to `breadcrumbs/<trigger>.md`, since a command that died can't write its own failure. Anything else may still write a file there.

**Mechanics of checks and breadcrumbs,** settled by the coordinator on 2026-10-05, built that day, and yours to change.

*A check.*

1. A trigger's front matter takes `check`, a command line; `when`, which is `changed`, `output` or `always`, and `changed` if left out; `then`, which is `wake` or `note`, and `wake` if left out; and `timeout`, a delay such as `30s` or `2m`, which is `1m` if left out and at most `10m`.
2. The check runs where the agent's shell tool runs: the home is its working directory, and `shrimpy` on its path is the agent.
3. Its output is what it prints on standard output, trimmed, and cut at 2,000 characters. A check that exits with anything but 0, outlasts its timeout or can't be started has failed, and its output is then one line that says so, with the end of what it printed on standard error. Pi hands a command's output and its errors over as one stream, so the check is run with its standard error sent to a file in the home's `runtime/checks/`, which each run writes over and which is read only for the line about a failure.
4. `changed` is news when the output, or the line about a failure, differs from the last occurrence's. A trigger's first occurrence counts as changed. `output` is news when there is any output, or the check failed. `always` is news every time. So a check that keeps failing the same way is news once.
5. With no news there is no occurrence: no model is called, nothing is written and no record of a task is left. The trigger keeps when it last checked and how many checks in a row were quiet, and `triggers show` says so. An occurrence is on record when something happened: the agent was woken, a breadcrumb was noted, or the check was interrupted, skipped or failed to be handed over. The first version of this mechanic recorded every quiet check as an occurrence, which left a finished task for each one, 1,440 a day for a check every minute.
6. With `then: wake` the agent is woken as for any occurrence, with the trigger's prompt and, apart from it, the output, marked as data. With `then: note` the output is written to `breadcrumbs/<trigger>.md`, the occurrence is on record as noted, and nobody is woken. A trigger that notes needs no prompt. When it has one, it is written above the output, as what the fact is and how to look closer.
7. A check runs once for an occurrence. The occurrence records that the check is starting before it starts. If the agent ends while it runs, the occurrence says it was interrupted, and the check isn't run again for it: the next occurrence runs it. What the next occurrence compares with is what the agent was last told, by being woken or by a note, so news that an occurrence failed to deliver is told by the next one.
8. `shrimpy triggers add` takes `--check`, `--when`, `--then` and `--timeout`, and checks them as it checks a schedule. `triggers show` prints them, and how each occurrence ended. `triggers run` runs the check now, and counts whatever it prints as news, whatever `when` says, because someone asked: the agent is woken, or the breadcrumb is written. It doesn't move the trigger's schedule, and it doesn't wait for the check.

*Breadcrumbs.*

9. A breadcrumb is a Markdown file directly in the home's `breadcrumbs/`, which `agent init` makes.
10. The files are compared when an input is taken up, in the same commit. Those whose text differs from what the session was last shown come with the input, and the session's record keeps what it was shown of each. A session's first input carries every file, since all of them are new to it.
11. An input carries at most 10 files, the first by name, each cut at 1,000 characters. When more differ, it says how many more, and they come with later inputs.
12. An input that is skipped showed the model nothing, so what it carried counts as not seen and comes again.
13. A file that is removed is forgotten, and nothing is said about it.
14. The model reads them before the rest of the input, marked as data to read and not instructions.
15. What every agent is told gains a few sentences on what a breadcrumb is: a fact that moves, shown once when it is new to a session, which prompts a look and doesn't replace one.

The old row's "output filters" are `when`. A fact that changes while an input waits behind a running turn comes with the next input, since an input's breadcrumbs are fixed when it is taken up.

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Waking itself later | — | A tool, `check_back({in, at, note})`, wakes the session that called it, once, after a delay or at a time. It survives a restart. It is a tool and not a command because it belongs to a conversation, and a tool knows which session called it. | Confirmed |
| Triggers | Watches, run by a global gateway clock | Renamed, because not everything that wakes an agent is a time. A trigger fires into a target thread, where it shows as a small trigger line with its prompt or output folded before the agent's reply, or into no thread for private background work. A small durable extension in each agent with cron and intervals, prompt and command actions, one coalesced overdue run, skip-on-overlap by default, timeouts, output filters, history and reload ([contract](7-on-its-own.md)). An invalid reload keeps the last valid definitions. Upkeep triggers stay disabled when installed. A stopped agent runs no triggers, and restart doesn't backfill. Each standing trigger is one small Markdown file in the home's `triggers/`, has a session of its own unless it names a thread, and may run a check that decides whether there is news: the [design](7-on-its-own.md) has the rest. | Confirmed |
| The calendar for triggers | The `cron-parser` package | The same package, pinned, which brings `luxon` with it. It is the first dependency the new Shrimpy takes beyond Pi's own packages and the tools that check the code. Cron with time zones and summer time is not something to write here. | Confirmed |
| Triggers in the agent or the OS | — | In the agent's runtime, where durable tracks every run and you inspect them in one place. The `REDESIGN` branch had moved them to skills over launchd and systemd so they'd fire while the agent is down; a stopped agent now runs none. | Confirmed |
| Cancel, disable and stop | — | Three separate controls. Cancelling work stops running occurrences and helpers but not the triggers themselves. Disabling a trigger stops future firings without killing a running one. Service stop interrupts everything and keeps state. | Confirmed |
| Context producers | Opt-in commands with channel matching, caching and bounds | Replaced by breadcrumbs, and no command runs before a turn. A fact that moves is one small file in a folder of the home: a line or two, and how to look closer. A trigger's check, a script or the agent writes it. When an input is handed to a session, the files that differ from what that session last saw come with it. So a fact is told once, when it is new to that session, nothing enters the prompt, and nobody is woken. A check that fails writes that into its file. To be built with a trigger's checks ([contract](7-on-its-own.md)). | Confirmed |
| Helpers | — | An agent can start helpers: child sessions in its own process, with its home and authority. Foreground helpers join and stop with their parent. Background helpers outlive it and wake the parent with their result when they finish. Helpers appear in a work view and never become agents. Pi calls them subagents. | Confirmed |
| Workers | Detach and outlive the caller | Same default. Codex keeps its real continue, send, wait and cancel protocol; after the owner dies it isn't a restored Pi child. Renaming or removing worker commands or backends needs review. | Keep |

**Open**

Helpers are under Not built yet below.

**Not built yet**

*What an agent does without being asked: helpers.*

Under Later in the [order of work](../PLAN.md#order-of-work).

**Outcome:** triggered and delegated work runs, can be inspected from the CLI and clients, and is honest about what a restart interrupted.

**Build**

- Helpers in the foreground and background, and the retained Codex workflow.

**Prove**

- Delegation through the real Codex backend: start, inspect, continue, wait, cancel, close and outputs, across caller disconnect and owner death. A background helper wakes its parent when it finishes, and Pi task ownership never cancels detached external workers.

**Replaces:** the old watch and worker stores and supervisors.

**Gate:** a capability that can't be kept goes back to [experience decisions](../PLAN.md#the-design) before removal.
