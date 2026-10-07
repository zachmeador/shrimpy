# 🦐 Shrimpy Redesign

Shrimpy is being rebuilt on Pi's durable runtime. This folder holds its design, the order of work and what is waiting on you.

## Where it stands

As of 2026-10-07.

| Piece | Built | Building | Next |
|---|---|---|---|
| [The three programs](design/1-programs.md) | The agent, the chat server and the gateway run as separate programs, and `shrimpy up` starts them. An agent has one live body. The agent's code is sorted into [modules with one job each](design/code-layout.md#the-agents-modules). | — | — |
| [The contracts](design/2-contracts.md) | The agent's, the chat server's and the gateway's contracts, with refusals that say which case they are. A contract carries facts: a message says who it mentions, and the chat store has an ID. | — | Carry only Shrimpy's shapes: Pi's error types still show through. |
| [Identity and addressing](design/3-identity.md) | The roster, member IDs, names, tickets, reaching a program by its name, and who may do what, with one role, admin. | — | Removing a member, replacing a token, renaming a person. |
| [The conversation model](design/4-conversation.md) | The feed of events, receipts, rooms, mentions, wake policies, the backlog an agent reads, an answer waking whoever asked, a person's message joining a running turn, `/stop`, one task following every input, and every input saying where it is. | — | The provider interface with a fake provider. Ways in for edits, deletes and reactions. |
| [The home](design/5-home.md) | The files an agent is told from, skills, reload, `triggers/`, `breadcrumbs/`, `wake.json`, and records with an ID of their own. Providers for a whole folder: sign-ins, model servers and a default model that every agent started there uses. | — | Compaction with Shrimpy's guidance. Seeing the request a turn sent. Workspace context from the gateway. |
| [The network](design/6-network.md) | Every connection by name goes through the gateway. An agent apart from the gateway, as another OS user, in a container or on another machine, is paired with `shrimpy up --listen`, `shrimpy members invite` and `shrimpy agent join`, is listed as running, answers in chat, and is reached by its name as any agent is. A gateway on a Mac and an agent on Linux were paired through an SSH tunnel. | — | Keeping the connection honest, and you from another machine. A pairing over an address another machine reaches directly, and under a second OS user. Then sandboxes. |
| [What an agent does without being asked](design/7-on-its-own.md) | `check_back`, standing triggers and their commands, a trigger's check, breadcrumbs, and asking another agent with `ask_agent`. | — | Helpers. |
| [Using it](design/using-it.md) | The terminal, which browses agents and rooms and watches any session of an agent, with keys that mean one thing on every screen; the commands, which each name their agent the same way; a default folder, `~/shrimpy`; and `shrimpy providers login`, which signs a folder in to a model provider. | — | What daily use asks for: resetting a session, `/new`, choosing a model from the terminal, the web client. |

How the code is laid out is in [the code's layout](design/code-layout.md).

## What to read

- **[For the author to review](AUTHOR-TO-REVIEW.md):** what is waiting on you. Start here.
- **[The plan](PLAN.md):** why Shrimpy is being rebuilt, the direction, the words it uses and the order of work.
- **The design:** one file for each piece, linked from the table above. Each says how the piece works, what was decided and what isn't built.
- **Proposals:** a design written out and waiting for a decision gets a file in `proposals/`, and leaves it when you decide. One is open: [hearing a thread while working in it](proposals/hearing-a-thread.md).
- **[Status](STATUS.md):** where the code trails the plan, grouped by piece.
- **Research:** what was found outside this repo is in [`docs/research/`](../research/). [The note on Pi](../research/pi-agent.md#pi-durable-source-and-recovery-investigation) has what its source and its recovery showed.
- **History:** kept for lineage, and nothing you need to read. [The log](history/LOG.md) of what was built and decided, [the small choices builds made](history/mechanics.md), [the first spike](history/spike/REPORT.md), [the keep list](history/keep-list.md) from old Shrimpy's docs, [what changes from old Shrimpy](history/from-old-shrimpy.md) and [the size baseline](history/size-baseline.md).
