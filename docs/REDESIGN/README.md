# 🦐 Shrimpy Redesign

Shrimpy is being rebuilt on Pi's durable runtime. This folder holds its design, the order of work and what is waiting on you.

## Where it stands

Each of these has one home, and the other files link to it instead of saying it again:

- **What waits on you:** [your list](AUTHOR-TO-REVIEW.md). Start here.
- **What comes next:** the plan's [order of work](PLAN.md#order-of-work).
- **What isn't built yet:** the Not built yet section of each [design file](PLAN.md#the-design).
- **Where built code trails the design:** [status](STATUS.md).
- **What is built, in order:** the [log](history/LOG.md#what-is-built-in-order).

How the code is laid out is in [the code's layout](design/code-layout.md).

## When this folder goes

At the release, once you have been through it: "agree but only after i've gone through everything and nothing seems to have been missed", 2026-10-08. Until then it is the working record, kept current, and each list in it lives here once. At the release its lists are cut into one file of what is open, a line for each, and [how Shrimpy is built](../how-it-is-built.md), a draft until you accept it, becomes the page for anyone about to read the code. What each file here holds, and what outlives it:

| File | Holds | What outlives it |
|---|---|---|
| `README.md`, `PLAN.md` | This page. Why, the direction, the words, the order of work, the release, what is deferred and what is not being built | Next and Later, the release, deferred, early thinking and not building go to the open list, and the words to how it is built. The rest is history |
| `STATUS.md`, `AUTHOR-TO-REVIEW.md` | Where the code trails the design, and what waits on you | All of it, a line for each, in the open list |
| `design/1-programs.md` to `3-identity.md` | The programs, the contracts and identity, as decided and built | What is untried or missing goes to the open list. The rest is in the code |
| `design/4-conversation.md` to `7-on-its-own.md` | The conversation model, the home, the network and what an agent does unasked | "Not built yet", the choices that are yours to strike, and what old Shrimpy did go to the open list. The rest is built |
| `design/using-it.md` | The terminal, the commands, the list from living with it, and what old Shrimpy had as you marked it | The candidates, that list, the old commands and your marks go to the open list |
| `design/code-layout.md` | The layout of `src/` and why | The rules, and where the words are, go to how it is built |
| `history/LOG.md`, `history/mechanics.md` | What was built and decided by date, and the small choices | History. What they left open is in the open list |
| `history/keep-list.md` | What is kept of old Shrimpy's voice | Needed to write the release's README, security statement and contributing page, so it needs a home before this folder goes |
| `history/from-old-shrimpy.md` | What replaces each part of old Shrimpy, and its command families | The commands, as what a person could do, are in [using it](design/using-it.md) until the release, and then in the open list. The map is history |
| `history/size-baseline.md`, `history/spike/` | Old sizes, and the spike's report and evidence | History |

## What to read

- **[The plan](PLAN.md):** why Shrimpy is being rebuilt, the direction, the words it uses and the order of work.
- **The design:** one file for each piece, listed in [the plan](PLAN.md#the-design). Each says how the piece works, what was decided and what isn't built.
- **Proposals:** a design written out and waiting for a decision gets a file in `proposals/`, and leaves it when you decide.
- **Research:** what was found outside this repo is in [`docs/research/`](../research/). [The note on Pi](../research/pi-agent.md#pi-durable-source-and-recovery-investigation) has what its source and its recovery showed.
- **History:** kept for lineage, and nothing you need to read. [The log](history/LOG.md) of what was built and decided, [the small choices builds made](history/mechanics.md), [the first spike](history/spike/REPORT.md), [the keep list](history/keep-list.md) from old Shrimpy's docs, [what changes from old Shrimpy](history/from-old-shrimpy.md) and [the size baseline](history/size-baseline.md).
