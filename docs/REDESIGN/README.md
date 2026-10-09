# 🦐 Shrimpy Redesign

Shrimpy is being rebuilt on Pi's durable runtime. This folder holds its design, the order of work and what is waiting on you.

## Where it stands

As of 2026-10-07.

| Piece | Built | Building | Next |
|---|---|---|---|
| [The three programs](design/1-programs.md) | The agent, the chat server and the gateway run as separate programs. `shrimpy up` starts them and keeps a folder's agents running: one made later starts by itself, and one that ends is started again alone. An agent has one live body. The agent's code is sorted into [modules with one job each](design/code-layout.md#the-agents-modules). | — | — |
| [The contracts](design/2-contracts.md) | The agent's, the chat server's and the gateway's contracts, with refusals that say which case they are. A contract carries facts: a message says who it mentions, and the chat store has an ID. | — | Carry only Shrimpy's shapes: Pi's error types still show through. |
| [Identity and addressing](design/3-identity.md) | The roster, member IDs, names, tickets, reaching a program by its name, and who may do what, with one role, admin, which the first agent of a roster has from the start. | — | Removing a member, replacing a token, renaming a person. |
| [The conversation model](design/4-conversation.md) | The feed of events, receipts, rooms, mentions, wake policies, the backlog an agent reads, an answer waking whoever asked, a person's message joining a running turn, `/stop`, one task following every input, and every input saying where it is. | — | Ways in for edits, deletes and reactions. An interface for chat adapters is kept as an idea, and is not in the first release. |
| [The home](design/5-home.md) | The files an agent is told from, which it reads again by itself when they change, skills, `triggers/`, `breadcrumbs/`, `wake.json`, and records with an ID of their own. Providers for a whole folder: sign-ins, model servers and a default model that every agent started there uses. A reload applies a changed model with nothing started again, and one thread's session can take a model of its own. | — | Compaction with Shrimpy's guidance. Seeing the request a turn sent. Workspace context from the gateway. |
| [The network](design/6-network.md) | Every connection by name goes through the gateway. An agent apart from the gateway, as another OS user, in a container or on another machine, is paired with `shrimpy up --listen`, `shrimpy members invite` and `shrimpy agent join`, is listed as running, answers in chat, and is reached by its name as any agent is. Each end notices a connection that dies without a word. A machine of your own comes in with `shrimpy members invite` and `shrimpy join`, and is you there. `shrimpy gateway install` keeps a folder's Shrimpy running as a service of your account. It runs on a Linux machine of yours, with an agent under a second account of it. | — | A name for a person that isn't the OS account's. Taking a machine's token back. Then sandboxes. |
| [What an agent does without being asked](design/7-on-its-own.md) | `check_back`, standing triggers and their commands, a trigger's check, breadcrumbs, and asking another agent with `ask_agent`. | — | Helpers. |
| [Using it](design/using-it.md) | The terminal, which browses agents and rooms and watches any session of an agent, with keys that mean one thing on every screen, a list of the commands of a thread when `/` is typed, `/status`, and `/model`, a message that has one thread try another model; the commands, which each name their agent the same way; a default folder, `~/shrimpy`; and `shrimpy providers login`, which signs a folder in to a model provider. | — | The web client, built for a phone first with push notifications, which doesn't hold up the release. What daily use asks for: resetting a session, `/new`. |

How the code is laid out is in [the code's layout](design/code-layout.md).

## When this folder goes

At the release, once you have been through it: "agree but only after i've gone through everything and nothing seems to have been missed", 2026-10-08. Until then it is the working record and is kept current. Two files are meant to outlive it, and are drafts until you accept them: [what is open](../open.md) and [how Shrimpy is built](../how-it-is-built.md). What each file here holds, to check them against:

| File | Holds | What outlives it |
|---|---|---|
| `README.md`, `PLAN.md` | This page. Why, the direction, the words, the order of work, the release, what is deferred and what is not being built | Next and Later, the release, deferred, early thinking and not building go to the open list, and the words to how it is built. The rest is history |
| `STATUS.md`, `AUTHOR-TO-REVIEW.md` | Where the code trails the design, and what waits on you | All of it, a line for each, in the open list |
| `design/1-programs.md` to `3-identity.md` | The programs, the contracts and identity, as decided and built | What is untried or missing goes to the open list. The rest is in the code |
| `design/4-conversation.md` to `7-on-its-own.md` | The conversation model, the home, the network and what an agent does unasked | "Not built yet", the choices that are yours to strike, and what old Shrimpy did go to the open list. The rest is built |
| `design/using-it.md` | The terminal, the commands, and the list from living with it | The candidates, that list and the old commands go to the open list |
| `design/code-layout.md` | The layout of `src/` and why | The rules, and where the words are, go to how it is built |
| `proposals/hearing-a-thread.md` | A proposal that waits on you | One line in the open list. Its ten details are only here |
| `history/LOG.md`, `history/mechanics.md` | What was built and decided by date, and the small choices | History. What they left open is in the open list |
| `history/keep-list.md` | What is kept of old Shrimpy's voice | Needed to write the release's README, security statement and contributing page, so it needs a home before this folder goes |
| `history/from-old-shrimpy.md` | What replaces each part of old Shrimpy, and its command families | The commands, as what a person could do, are in the open list. The map is history |
| `history/size-baseline.md`, `history/spike/` | Old sizes, and the spike's report and evidence | History |

## What to read

- **[For the author to review](AUTHOR-TO-REVIEW.md):** what is waiting on you. Start here.
- **[The plan](PLAN.md):** why Shrimpy is being rebuilt, the direction, the words it uses and the order of work.
- **The design:** one file for each piece, linked from the table above. Each says how the piece works, what was decided and what isn't built.
- **Proposals:** a design written out and waiting for a decision gets a file in `proposals/`, and leaves it when you decide. One is open: [hearing a thread while working in it](proposals/hearing-a-thread.md).
- **[Status](STATUS.md):** where the code trails the plan, grouped by piece.
- **Research:** what was found outside this repo is in [`docs/research/`](../research/). [The note on Pi](../research/pi-agent.md#pi-durable-source-and-recovery-investigation) has what its source and its recovery showed.
- **History:** kept for lineage, and nothing you need to read. [The log](history/LOG.md) of what was built and decided, [the small choices builds made](history/mechanics.md), [the first spike](history/spike/REPORT.md), [the keep list](history/keep-list.md) from old Shrimpy's docs, [what changes from old Shrimpy](history/from-old-shrimpy.md) and [the size baseline](history/size-baseline.md).
