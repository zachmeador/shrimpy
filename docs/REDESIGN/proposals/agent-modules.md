# 🦐 The agent's modules, proposed

**State:** proposed on 2026-10-05 and not reviewed. Nothing moves until you approve it. It comes from a review of `src/agent/` by an Opus subagent, asked for after `agent/sessions/` had grown to 2,019 lines doing eight jobs.

**What went wrong.** The rule that only `host/`, `sessions/` and `extensions/` may import Pi was not the main cause. Triggers could have lived in `extensions/`, where the plan had put them. They went to `sessions/` because the records are private to that module, and no other module can take part in a commit. So "find or make the session, take what it kept, create the task" is written three times there: for a chat event, a wake-up and a trigger. A feature now spans three folders: the change that added wake-ups touched 27 files across `intake/`, `sessions/` and `extensions/`.

**What the rule is for,** and it stays for this. At the agent's edge, clients draw Shrimpy's own shapes, so a Pi upgrade lands in two files. Inside the agent, the code that talks to chat can't hold a transaction, so the promise that an event is taken up once sits in sixty lines, and 1,600 lines are testable with no engine.

**The fix is two functions that take a transaction.** `openSession` finds or makes a session, and `takeUp` takes an input up. With them a source of input can live in a module of its own and still act inside one commit. This is the only change of logic, about 150 lines.

**The modules, each with one job.**

| Module | Its one job | Touches Pi |
|---|---|---|
| `inputs/`, new | What an input is, from any source, how it reads to the model, and how its turn can end. Data and words. | Never |
| `records/`, new | Shrimpy's own documents in the engine's storage, and the changes to a session's record made inside another module's commit. | Defines the documents |
| `turns/`, new | The task that follows one input to its end: taking it up, what is being worked on, and what a crash costs it. | Defines the task |
| `wakeups/`, new | `check_back`: the tool, and the task that sleeps until the wake-up is due. | A tool and a task, as one extension |
| `triggers/`, new | Standing triggers: follow the home's files, sleep, make occurrences, and answer the API about them. | Defines the task |
| `chat/`, was `intake/` | The agent's side of chat: read the feed, decide what wakes it, take that up, post replies, leave receipts, mark where it works. | One file |
| `sessions/` | The sessions as clients see them: which there are, the view of each, and steer, wait and stop. | Reads Pi's view |
| `message-tools/`, was `extensions/tools/` | `send_message` and `read_messages`. | Defines the tools |
| `context/`, was `extensions/context/` | What every session is told, as prompt sections made from the home's files. | Defines the sections |
| `home/`, `host/`, `links/`, `access/` | As now. | `host/` opens the engine, and is the only place that does |

`extensions/` goes: an extension is what a module hands the host to install. `sessions/` goes back to its first job. Imports point one way: `inputs`, `home`, `links` and `access`; then `host` and `records`; then `turns`; then `wakeups`, `triggers` and `chat`; then `sessions`, `message-tools` and `context`; then the top.

**The rule, redrawn by file.** Inside the agent, a file imports Pi only if it is named `*.durable.ts`, and a plain file can't import a marked one. That is how `*.node.ts` works today. What decides it is what a builder does when the lint says no. Under a list of folders the cheap fix is to move the code into a listed folder, which is what filled `sessions/`. Under a name it is a new file beside the feature. It costs about 25 renames, and nearly every file of `turns/`, `records/` and `sessions/` carries the suffix. `pi-ai` joins the rule at the agent's edge, where its message types slip through today.

**How.** Four commits by one builder on a quiet tree, each passing the check: renames only; the two functions, in place; the split of `sessions/`; then the lint by file. 69 files change path. No command, contract or behavior changes.

**What must not change:** the names of the tasks and the documents, their versions, the shape of a stored input and the form of a request ID. Nothing converts records, so a drift costs a home its sessions. It is checked once by hand: today's build on a temporary home with a wake-up and a trigger waiting, then the new build on the same home.

**Unsure.** The reviewer is confident of the cause and less so of the map, since nothing was built. Its least sure choices are the name `chat/`, which is also the chat server's folder; `records/` and `turns/` as two modules where one might do; and the second half of the rule, untried against a build.
