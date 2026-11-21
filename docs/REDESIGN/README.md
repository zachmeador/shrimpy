# 🦐 Shrimpy Redesign

Shrimpy is being rebuilt on Pi's durable runtime. This folder holds its design, the order of work and what is waiting on you.

## Where it stands

Each of these has one home, and the other files link to it instead of saying it again:

- **What waits on you:** [your list](AUTHOR-TO-REVIEW.md). Start here.
- **What comes next:** the plan's [order of work](PLAN.md#order-of-work).
- **What isn't built yet:** the Not built yet section of each [design file](PLAN.md#the-design).
- **Where built code trails the design:** [status](STATUS.md).
- **What is built, in order:** `git log`. A commit's message says what it changed and why.

How the code is laid out is in [the code's layout](design/code-layout.md).

## When this folder goes

At the release, once you have been through it: "agree but only after i've gone through everything and nothing seems to have been missed", 2026-10-08. Until then it is the working record, kept current, and each list in it lives here once. At the release its lists are cut into one file of what is open, a line for each, and [how Shrimpy is built](../how-it-is-built.md), a draft until you accept it, becomes the page for anyone about to read the code. The open list stays a file in the repo and never becomes GitHub issues: "i do not want to be coupled to github for this". What each file here holds, and what outlives it:

| File | Holds | What outlives it |
|---|---|---|
| `README.md`, `PLAN.md` | This page. Why, the direction, the words, the order of work, the release, what is deferred and what is not being built | Next and Later, the release, deferred, early thinking and not building go to the open list, and the words to how it is built. The rest is history |
| `STATUS.md`, `AUTHOR-TO-REVIEW.md` | Where the code trails the design, and what waits on you | All of it, a line for each, in the open list |
| `design/1-programs.md` to `3-identity.md` | The programs, the contracts and identity, as decided and built | What is untried or missing goes to the open list. The rest is in the code |
| `design/4-conversation.md` to `7-on-its-own.md` | The conversation model, the home, the network and what an agent does unasked | "Not built yet", the choices that are yours to strike, and what old Shrimpy did go to the open list. The rest is built |
| `design/using-it.md` | The terminal, the commands, the list from living with it, and what old Shrimpy had as you marked it | The candidates, that list, the old commands and your marks go to the open list |
| `design/code-layout.md` | The layout of `src/` and why | The rules, and where the words are, go to how it is built |
| `keep-list.md` | What is kept of old Shrimpy's voice | Needed to write the release's README, security statement and contributing page, so it needs a home before this folder goes |

## What to read

- **[The plan](PLAN.md):** why Shrimpy is being rebuilt, the direction, the words it uses and the order of work.
- **The design:** one file for each piece, listed in [the plan](PLAN.md#the-design). Each says how the piece works, what was decided and what isn't built.
- **Proposals:** a design written out and waiting for a decision gets a file in `proposals/`, and leaves it when you decide.
- **Research:** the notes on outside projects left this repo on 2026-11-21. What the design took from them is in the design files.
- **History:** the log, the small choices of the early builds, the first spike's report, the map from old Shrimpy and the size baseline were deleted on 2026-11-21, once what only they held had moved into the design files and the plan. Git has them at `26e52b7e`. [The keep list](keep-list.md) from old Shrimpy's docs stays until the release's pages are written from it.
