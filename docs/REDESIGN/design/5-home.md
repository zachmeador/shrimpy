# 🦐 The home

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

**The design**

An agent home works on its own, with no workspace pointer, gateway or other agent; it keeps a cached copy of the workspace context. It holds identity and instructions, selected resources and skills, retained knowledge and Pi storage. It may hold provider credentials and a model of its own, and what it doesn't hold of those it takes from the folder it is started in. Joining a gateway puts the agent on its roster under a name, and the agent's token stays in its home: [identity and addressing](3-identity.md) has the rest.

Proposed layout; final paths settle with setup and the CLI:

```text
agent.json
SOUL.md
sigil                 the agent's sigil, twelve lines of twelve, which it may redraw
context/
vault/
skills/
triggers/             one small file for each standing trigger
wake.json             what wakes the agent in each room, when it isn't the default
breadcrumbs/          one small file for each fact that moves
state/pi/auth.json    keys and sign-ins of the agent's own, when it has any
state/pi/models.json  model servers of the agent's own, when it has any
state/member.json     the agent's token, its member ID and the roster's ID once it has joined
state/workspace-context/  its copy of the workspace context, which it keeps itself
state/agent.sqlite
runtime/              disposable endpoint and log files
```

Shared resources are explicit references, never ancestor or global discovery. The one exception is providers, below, and the agent doesn't look for those either: whoever starts it says where they are. Development uses fresh fixture homes, and no existing user data is transformed for a proof.

**Providers.** Decided and built on 2026-10-06. You sign in to a provider once in each place agents run, and every agent started there uses it. The place is the Shrimpy folder, which holds three files in `providers/`:

```text
providers/auth.json           sign-ins and keys
providers/models.json         model servers of your own
providers/default-model.json  the model an agent starts with when its agent.json names none
```

- **A home's own files win.** Its `auth.json` for a provider it has an entry for, its `models.json` for a provider it declares, and the model its `agent.json` names. An agent on another account keeps its own. A provider the home declares takes its key from the home alone, so a key the folder holds never goes to a server the home gave the same name.
- **The agent is told, and doesn't look.** `shrimpy up` and `shrimpy agent serve` say where the folder's `providers/` is. An agent started with none has only what its home holds.
- **A sign-in is renewed where it is stored,** under a lock on that file, so agents that share one renew it once. Each reads the file again for every request, so a new sign-in needs no restart.
- **An agent reads its files again when they change, and nobody reloads.** Built on 2026-10-08. You dropped a `/reload` from the terminal: "users shouldn't have to think about needing to reloading things". So a running agent looks at its own files every two seconds, at their names, sizes and times and never inside them, and reads them all again once what it sees has changed and stayed the same for two looks: `SOUL.md`, the notes in `context/`, the skills, the triggers, the wake file, and the model with the servers it can be on. It looks and doesn't watch, since file events aren't delivered for a folder that another machine shares. `shrimpy agent reload` is gone. What every agent is told was already that its `context/` notes are shown in every conversation, which is true now.
- **What can't be used keeps what the agent last read of it.** A trigger, the wake file and the model always did. Since 2026-10-08 `SOUL.md`, a context note and a skill do too, so a save that is broken for a moment, or a read error on a shared folder, takes nothing out of an agent's prompt. It is said once on standard error, and the agent is told in a breadcrumb, `breadcrumbs/_left-out.md`, which goes when the file is right. A file that is gone is gone. A home whose `agent.json` can't be seen is not read at all, and the agent keeps everything until it is back.
- **You change an agent's default model by telling it to:** "hey make your default model x". The agent edits its `agent.json`, and within a few seconds every session uses the new model from its next request, with nothing started again. A model the agent can't use is left out the same way, and it keeps the one it had. An agent keeps the name it joined with: editing `name` in `agent.json` after joining does not rename it.
- **A thread can try another model.** Built on 2026-10-08: "just for moments where i want to quickly try a different model in a thread with an agent". A person writes `/model provider/id` in the thread, the agent has the session behind it use that model from its next request, and says so in the thread in one line, as [the commands of a thread](using-it.md) have it. It lasts until the agent is started again, or until a reload finds the home naming another model. The agent's contract says which models an agent can use now, for a client's list, and a session's status says whether its model is the home's or its own. The contract had a way to set a session's model for a few hours that day, and lost it: a change made that way left nothing in the thread.
- **An agent is told when its model has changed.** "it should be obvious to the agent that this changed", 2026-10-08. With the next input a session is handed, the model is shown that the one that wrote the session's last answer is not the one it runs on now, and which each is. It is worked out by comparing, with no record of its own, so it covers a `/model` in the thread, a reload that changed the agent's model and a start with another one, and it is said once.
- **`shrimpy login` signs a folder in** with Pi's own flows, in the terminal. It shows a link or a code and takes what you paste back, so it works over SSH, and it asks which model agents start with when the folder names none. A place you have no shell in isn't covered: you, or an agent of yours, are taken to have one.

A single sign-in kept at the gateway was looked at first and dropped. The gateway would hold secrets, and every agent would need it to reach a model.

**Workspace context.** Built on 2026-11-23. The workspace context is the Markdown files of `context/` in the Shrimpy folder where the gateway runs. Every agent on the network is shown them, on whatever machine it runs.

- **The gateway reads them** as an agent reads its own `context/`: the Markdown files there and in the folders under it, with hidden ones skipped and links followed. It looks at them every two seconds and serves them as `WorkspaceContext`, which [the contracts](2-contracts.md) list. A file it can't read keeps what it last read of it, and is named once on its standard error.
- **Each agent keeps a copy** in its home, `state/workspace-context/`, with each file at its path on the gateway's machine. It holds `WorkspaceContext` over its link to the gateway, makes the copy match at each change, and reads its home again. Its instructions come from the copy, so with the gateway down, at a start too, it has what the gateway last gave it. An agent that has never reached a gateway has none.
- **They are a section of their own,** `<workspace>`, after what every agent is told and before `SOUL.md`, so a change there doesn't resend the home's own notes. Each file is headed by its path on the gateway's machine, as a home's own notes are by their path in the home, so an agent tells a shared note from its own note of the same name. Neither replaces the other.
- **Nothing limits their size,** as nothing limits a home's own notes. What every agent is told asks it to keep its own notes short, and to move what grows long into `vault/`. The link between programs takes at most 64 MB in one message.
- **Running on the copy shows nothing new.** The section's text is the same either way, and an agent apart already says on standard error when it loses its gateway and when it is back. `shrimpy agent context` shows the copy as the agent would get it.

You settled the open points on 2026-11-23: the section's place, both files of one name shown, no limit with a line or two asking agents to keep their notes short, the copy's place, and nothing shown when an agent runs on its copy. Each file headed by its path was yours: "why don't we just show the path to the context file as its section header".

A durable extension supplies base instructions, skill trails, input facts and compaction guidance. Dynamic facts are captured when input is consumed, with provenance and budgets, and committed before the request. Queued input sees the facts from when it was consumed, not when it was queued.

**Caching.** Stable text lives in prompt sections that don't change between turns: base instructions, workspace context, `SOUL.md` and skill trails. When a section's text changes, Durable adds the new text as an entry at the end of the transcript. Some of the newest models take it there and keep their cache. Every other model, which by default includes any server declared in `models.json`, gets one rebuilt system message at the front and reads the whole conversation again. So sections never embed timestamps, counters or other per-turn values. Per-turn facts such as time, sender and the thread's unread messages travel with the input entry instead. Each turn then only adds to the end of a cached prefix, and a reload that changed something costs each session at most one cache miss.

What a change to the prompt costs was checked on 2026-10-04 against Pi 1.0.0:

- A changed section is sent whole, and every file in `context/` is part of one section, so one changed file sends all of them again.
- Pi's model list lets a model take a change in place only for some of the newest models on their makers' own APIs, such as Claude Opus 5.5 and GPT-5.5.
- A server that refuses a system message unless it comes first can never take one in place. The local Qwen server is one: "System message must be at the beginning."
- A reload that changed nothing adds nothing and costs nothing.

How Pi recovers shapes these rules:

- `beforeRequest` transforms stay pure. They run again after recovery, so reading files or the clock there would change a resent request.
- Prompt sections render again too, including after blocking compaction, so they can't run external commands. Nothing runs a command to build a prompt or an input: a fact that moves is kept in a file and reaches a session as a breadcrumb.
- Throwing from a section doesn't signal failure; Pi can keep the old text and proceed.
- A reload reaches each session at its next request, as Pi renders sections, including a turn that is running. The registry, tool implementations and environment stay fixed for accepted work; replacing them needs admission to stop and a drain and restart.

Inspection shows raw entries, effective model messages, selected tools, source revisions, omissions and budgets, and the effective model and settings. Previews are labelled as previews; a captured request is the real evidence. Hidden context in the human transcript expands without blank rows.

**An agent's sigil,** decided and built on 2026-11-21. Each agent has a sigil, a bitmap of twelve by twelve that each client draws its own way, and a pigment. "default should be when an agent is made we generate some fun random thing. but an agent is always free to change its sigil". Making a home gives it both at random: the sigil in the file `sigil`, twelve lines of twelve with `#` for on and `.` for off, and the pigment in `agent.json`, one of coral, peach, moss, sky and plum. The made ones are small creatures and emblems, the same left to right. The agent follows the file as it follows its others, is told in one sentence that it may redraw it, and shows its look to whoever holds its `Agent` object. A file that isn't twelve by twelve shows no sigil and is reported as left out, like any file the agent can't use. For an agent that shows none, or isn't running, a client works a look out from its member ID, the same on every client. Three of these are yours to strike: the file's name and form, the pigment being random and kept in `agent.json`, and the look from the ID.

**A home's files, to look through,** built on 2026-11-21 for the web client's home tab, which you asked to keep small: "just a markdown viewer for mvp and being able to look at images". An agent lists a folder of its home and serves one file to whoever may watch it, you or an admin: text up to 1 MB, and an image up to 10 MB. Anything else is listed and not served. `state/` and `runtime/` are neither listed nor served, and no path leaves the home, by `..` or by a link.

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Instruction selection | Approved base context, `SOUL.md`, agent context, skill precedence and required-tool filtering; ambient `AGENTS.md` and global Pi skills and settings excluded | Same, with the workspace's shared `context/` files coming from the gateway. Facts are captured when queued input is consumed, and later edits don't rewrite committed context. | Keep |
| `/reload` | Refreshes skills and templates; base files load only at session open | Also rebuilds base instructions. It takes Pi's behavior: sections render again at every request, so a reload reaches each session at its next request, including a turn that is running. Nothing a session already holds is rewritten. This replaces "for later inputs only", which would need a captured revision for each input. Code, tool or environment changes need a drain and restart. | Decided in the build. Since 2026-10-08 nobody asks for it: an agent reads its files again when they change, as [providers](5-home.md) has it, and the command is gone |
| Automatic awareness | Sender, destination, time and session facts; a channel unread count with a preview of the latest message; memory breadcrumbs; fleet and status; other-session activity; worker and watch summaries | Keep sender, destination, time and session facts and the thread's unread messages. Unread messages appear as written, the way a person scrolls a chat room: who said what, when, and whether it was addressed to this agent, newest last, within the turn-context budget. Nothing summarizes them. Drop the rest from every request, and give agents instructions for checking status, other threads and sessions, triggers and workers when they need to. The unread messages are cut at 20,000 characters, keeping the newest, and a cut says how many earlier ones there are and that `read_messages` reads them: on 2026-10-04 you found 6,000 small for a room's backlog. Memory breadcrumbs wait until daily use asks for them: they need a search index, and until then agents are trusted to search their own files and Shrimpy's state with the tools they have. | Confirmed |
| Workspace context | Shared `context/` files in the workspace that every agent reads | The gateway hosts the workspace's `context/` files, and agents receive them through the API. Each agent keeps a cached copy for when the gateway is unreachable and picks up a change within a few seconds, at the cost of one prompt-cache miss. You, or an admin agent, edit them in one place: `context/` in the Shrimpy folder where the gateway runs. | Confirmed, and built on 2026-11-23, as Workspace context, above, has it |
| Memory | Ordinary files; mechanic can search every agent | Same files. An agent with the admin role reaches other agents' homes over SSH instead of a built-in all-agent search. | Confirmed |
| Compaction | A copied runner with Shrimpy's guidance | Pi's native compaction with Shrimpy's summary guidance for dates, voice, paths and work state; same thresholds and model at first. Qualify summary quality before deleting the copy. Compaction only shrinks the session, so agents are told they can re-read the thread when a detail went missing. | Confirmed |
| Skills | Trails, `/skill:name` and templates | Same mechanics. The skills themselves are rewritten, as the next two rows say. | Keep |
| Which skills come first | 16 included skills, rewritten together | The first rewrite covers the four an agent needs to look after a Shrimpy setup: setting it up, making and maintaining agents, where messages go, and making skills. A skill for a feature that comes later is rewritten with that feature: watches and the default watches, coding delegation, update, the journals and audits, which run from watches, and `memory-management`, which comes with memory breadcrumbs. `remember`, search and web search wait until they're wanted. | Confirmed |
| Docs, skills and agent instructions | Written for old Shrimpy and grown along with it | Rewritten from scratch for the new Shrimpy: the reference docs, the included skills, the base instructions and starter files agents get, and the developer docs. The charming parts of today's are kept, starting from the [keep list](../keep-list.md), which you review before anything is rewritten. Keep it shrimple is the standard they're written to. | Confirmed |
| Settings ownership | Credentials, model catalogs and policies, compaction and skill switches are workspace-wide | Home-owned defaults with session overrides. What a home doesn't set comes from the folder it is started in: sign-ins, model servers and the model it starts with, as Providers, above, has it. A sign-in is made once for a folder, and the file that holds it is the one place it is renewed. Appearance and favorite models are per-user client settings on each machine. Ambient Pi settings are ignored. | Confirmed, and changed on 2026-10-06 |
| Where keys come from | — | The home's `auth.json` and `models.json`, then those of the folder it is started in. Environment variables aren't read, and a key written as a command or a variable is refused. | Confirmed, and changed on 2026-10-06 |
| How much an agent is told | — | Nothing limits the size of `SOUL.md`, a context file, the list of skills or the earlier messages that come with an input. | Confirmed for now |
| What the move to 1.5.2 keeps | — | Each home keeps its files: `SOUL.md`, `context/`, skills, `triggers/`, breadcrumbs and `wake.json`, and the folder keeps `providers/`. What Shrimpy wrote before the move goes into an archive folder beside the Shrimpy folder, and nothing converts it: each home's Pi storage, with its sessions and the agent's records, so a wake-up that was waiting or a question still open is gone; the chat store, with its rooms, threads and messages; and the gateway's data, with the roster and its key. An agent beside the gateway keeps its token and joins the new roster by itself. An agent elsewhere deletes its membership, its token with it, as `shrimpy join` says, and joins with a new invitation. Your name goes in `settings.json`. A program refuses data from before the move and says to move it into the archive. | Confirmed on 2026-11-14 for Pi's storage: "as long as workspace content is protected, i don't even care about old session history", and on 2026-11-15 for the rest: "just throw old shrimpy data into an archive dir nearby... if we need it then i can easily migrate it later. but i doubt i'll need it" |
| Which subscriptions `shrimpy login` offers | Every subscription pi-ai offers, unchecked: Anthropic's signs in to claude.ai and sends each request as Claude Code | Only a subscription checked against its vendor's terms, signing in under Shrimpy's own name. Anthropic's isn't offered, and `shrimpy login` says why and points to an API key. OpenAI's ChatGPT sign-in stays, under Shrimpy's name since Pi 1.5.2 lets it. OpenAI's legacy Codex sign-in goes, and Copilot, Kimi, Meta and xAI wait until their terms are checked. An API key or a model server works for any provider, Radius included. | Confirmed on 2026-11-14: "i'd rather not risk it myself", and of signing in as Shrimpy, "good". The legacy Codex sign-in and the other four follow the same rule, and are yours to strike. Not offering isn't refusing: a refusal of Claude subscription tokens in the credential store, built the same day, came out that day, "i didn't ask for this. it just was that shrimpy wouldn't offer a happy path for this" |
| The home's files across releases | — | The home's files and the folder's carry no version, and no update rewrites them. From 1.0.0 they only grow within a major, by new optional keys and new files. A removal or a rename waits for a major, whose release notes tell an agent what to edit. An older release refuses a file that a newer one added a key to, with words naming the key. | Confirmed on 2026-11-23, with stored data migrating forward, as [the programs](1-programs.md) have it |
| The home's layout | At the top: `SOUL.md`, `sigil`, `agent.json`, `wake.json`, `context/`, `vault/`, `skills/`, `triggers/`, `breadcrumbs/`, `state/` and `runtime/` | At the top, what you and the agent write: `SOUL.md`, `context/`, `vault/`, `skills/`, `triggers/` and `breadcrumbs/`. Every setting in `agent.json`: the name, model and color it has today, with the sigil and what wakes it in each room. Everything else in `state/`, which only Shrimpy writes: the sessions, the membership and token, the copy of the workspace context, and what `runtime/` holds today. So putting a home in Git means ignoring `state/`. | Confirmed on 2026-11-23: "yep i agree with you". You had suggested putting `agent.json`, the sigil, `triggers/` and `state/` under a `config/` folder. `state/` stays apart from settings because it holds the agent's sessions and token, which you reset or back up separately. To build before 1.0, since after it a home's layout changes only in a major |

**Open**

Compaction with Shrimpy's guidance and seeing the request a turn sent are under Not built yet below.

**Not built yet**

*The home's layout,* as the row on it above has it, before 1.0. The homes in use on the VM, Kathleen's and crab's get their files moved by hand once.

*The home: compaction and the request a turn sent.*

Under Next in the [order of work](../PLAN.md#order-of-work).

Pi compacts a session by default: it starts a summary in the background as the history nears the model's window, and makes a request wait for one above the limit. Shrimpy adds no guidance of its own to that summary yet and has no test of a session crossing the threshold. Pi never deletes anything, so what is kept of finished work is a separate question. You judged it no concern for now on 2026-10-05, and [STATUS.md](../STATUS.md) has what it costs.

**Outcome:** the agent knows who it is and what it can do, and for any request you can see exactly what the model received and why. Then your dev agents move in, and the new Shrimpy is the one you use.

**Build**

- The home-context extension: base instructions, skill trails, input facts and compaction guidance.
- Request and context inspection.
- Agent instructions and the first included skills rewritten from scratch against the new commands and tools: the base instructions, the starter `SOUL.md`, and each of the [skills that come first](5-home.md) with its helper commands, tool requirements and precedence. First comes the [keep list](../keep-list.md) of what's charming in today's, for you to review.
- Native compaction with Shrimpy's guidance in place of the copied runner.

**Prove**

- Context is captured at consumption for queued input, steering, tool rounds, reload, compaction and restart.
- Real provider input matches live and reopened raw and effective history.
- Editing a context file while work is queued: in-flight input, newly consumed input and a resent request each use the right version.
- Killing the owner during blocking compaction.
- A model tool call spanning a resource reload and an attempted code or environment swap.
- Early cost checks: context capture.

**Replaces:** the old prompt, resource, recording and compaction execution paths.
