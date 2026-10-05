# 🦐 The home

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

**The design**

An agent home works on its own, with no workspace pointer, gateway or other agent; it keeps a cached copy of the workspace context. It holds identity and instructions, selected resources and skills, retained knowledge, provider credentials and defaults, and Pi storage. Joining a gateway puts the agent on its roster under a name, and the agent's token stays in its home: [identity and addressing](#identity-and-addressing) has the rest.

Proposed layout; final paths settle with setup and the CLI:

```text
agent.json
SOUL.md
context/
vault/
skills/
triggers/             one small file for each standing trigger
wake.json             what wakes the agent in each room, when it isn't the default
breadcrumbs/          one small file for each fact that moves
state/pi/auth.json
state/pi/models.json
state/member.json     the agent's token, made before it first joins
state/agent.sqlite
runtime/              disposable endpoint and log files
```

Shared resources are explicit references, never ancestor or global discovery. Development uses fresh fixture homes, and no existing user data is transformed for a proof.

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

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Instruction selection | Approved base context, `SOUL.md`, agent context, skill precedence and required-tool filtering; ambient `AGENTS.md` and global Pi skills and settings excluded | Same, with the workspace's shared `context/` files coming from the gateway. Facts are captured when queued input is consumed, and later edits don't rewrite committed context. | Keep |
| `/reload` | Refreshes skills and templates; base files load only at session open | Also rebuilds base instructions. It takes Pi's behavior: sections render again at every request, so a reload reaches each session at its next request, including a turn that is running. Nothing a session already holds is rewritten. This replaces "for later inputs only", which would need a captured revision for each input. Code, tool or environment changes need a drain and restart. | Decided in the build |
| Automatic awareness | Sender, destination, time and session facts; a channel unread count with a preview of the latest message; memory breadcrumbs; fleet and gateway status; other-session activity; worker and watch summaries | Keep sender, destination, time and session facts and the thread's unread messages. Unread messages appear as written, the way a person scrolls a chat room: who said what, when, and whether it was addressed to this agent, newest last, within the turn-context budget. Nothing summarizes them. Drop the rest from every request, and give agents instructions for checking status, other threads and sessions, triggers and workers when they need to. The unread messages are cut at 20,000 characters, keeping the newest, and a cut says how many earlier ones there are and that `read_messages` reads them: on 2026-10-04 you found 6,000 small for a room's backlog. Memory breadcrumbs wait until daily use asks for them: they need a search index, and until then agents are trusted to search their own files and Shrimpy's state with the tools they have. | Confirmed |
| Workspace context | Shared `context/` files in the workspace that every agent reads | The gateway hosts the workspace's `context/` files, and agents receive them through the API. Each agent keeps a cached copy for when the gateway is unreachable and picks up changes on reload, at the cost of one prompt-cache miss. You or the mechanic edit them in one place. | Confirmed |
| Memory | Ordinary files; mechanic can search every agent | Same files. An agent with the admin role reaches other agents' homes over SSH instead of a built-in all-agent search. | Confirmed |
| Compaction | A copied runner with Shrimpy's guidance | Pi's native compaction with Shrimpy's summary guidance for dates, voice, paths and work state; same thresholds and model at first. Qualify summary quality before deleting the copy. Compaction only shrinks the session, so agents are told they can re-read the thread when a detail went missing. | Confirmed |
| Skills | Trails, `/skill:name` and templates | Same mechanics. The skills themselves are rewritten, as the next two rows say. | Keep |
| Which skills come first | 16 included skills, rewritten together | The first rewrite covers the four an agent needs to look after a Shrimpy setup: setting it up, making and maintaining agents, where messages go, and making skills. A skill for a feature that comes later is rewritten with that feature: watches and the default watches, coding delegation, update, the journals and audits, which run from watches, and `memory-management`, which comes with memory breadcrumbs. `remember`, search and web search wait until they're wanted. | Confirmed |
| Docs, skills and agent instructions | Written for old Shrimpy and grown along with it | Rewritten from scratch for the new Shrimpy: the reference docs, the included skills, the base instructions and starter files agents get, and the developer docs. The charming parts of today's are kept, starting from the [keep list](KEEP-LIST.md), which you review before anything is rewritten. Keep it shrimple is the standard they're written to. | Confirmed |
| Settings ownership | Credentials, model catalogs and policies, compaction and skill switches are workspace-wide | Home-owned defaults with session overrides. Provider login repeats per home unless a shared read-only config is referenced; mutable OAuth stores keep one owner. Appearance and favorite models are per-user client settings on each machine. Ambient Pi settings are ignored. | Confirmed |
| Where keys come from | — | Only the home's `auth.json` and `models.json`. Environment variables aren't read, and a key written as a command or a variable is refused. | Confirmed |
| How much an agent is told | — | Nothing limits the size of `SOUL.md`, a context file, the list of skills or the earlier messages that come with an input. | Confirmed for now |

**Open**

Compaction with Shrimpy's guidance, seeing the request a turn sent, and workspace context from the gateway are under Not built yet below.

**Not built yet**

*The home: compaction, the request a turn sent, and workspace context.*

Under Next in the [order of work](../PLAN.md#order-of-work).

Pi compacts a session by default: it starts a summary in the background as the history nears the model's window, and makes a request wait for one above the limit. Shrimpy adds no guidance of its own to that summary yet and has no test of a session crossing the threshold. Pi never deletes anything, so what is kept of finished work is a separate question, on the list for the author.

**Outcome:** the agent knows who it is and what it can do, and for any request you can see exactly what the model received and why. Then your dev agents move in, and the new Shrimpy is the one you use.

**Build**

- The home-context extension: base instructions, skill trails, input facts and compaction guidance.
- Request and context inspection, and explicit reload.
- Agent instructions and the first included skills rewritten from scratch against the new commands and tools: the base instructions, the starter `SOUL.md`, and each of the [skills that come first](#the-home) with its helper commands, tool requirements and precedence. First comes the [keep list](KEEP-LIST.md) of what's charming in today's, for you to review.
- Native compaction with Shrimpy's guidance in place of the copied runner.
- Workspace context hosted by the gateway, with each agent's cached copy.

**Prove**

- Context is captured at consumption for queued input, steering, tool rounds, reload, compaction and restart.
- Real provider input matches live and reopened raw and effective history.
- Editing a context file while work is queued: in-flight input, newly consumed input and a resent request each use the right version.
- Killing the owner during blocking compaction.
- A model tool call spanning a resource reload and an attempted code or environment swap.
- Early cost checks: context capture.

**Replaces:** the old prompt, resource, recording and compaction execution paths.
