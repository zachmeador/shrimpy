---
name: shrimpy-update
description: Use when the person asks you to update Shrimpy, on one machine or everywhere, or another agent asks you to update yours.
---

# Updating Shrimpy

Each machine runs a release of Shrimpy that was installed there, and `shrimpy update` changes it on the machine whose shell runs it. Nothing should be newer than the gateway, since it serves chat and the roster to everyone, so the gateway's machine goes first and the machines of agents apart from it follow. You need no SSH: on another machine you message an agent that lives there.

## See what's new

`shrimpy update` by itself says what the latest release is: its version and name, whether it's a patch, a minor or a major, whether its Pi packages differ, and its changelog. Tell the person what it says, with anything the changelog says they have to do, and ask before going on. `shrimpy update <version>` installs that version, and that's also how to go back to an earlier one.

## Update everywhere

When the person says yes, use the version the preview named, written below as `<version>`.

1. **The gateway's machine.** You are on it when the Shrimpy folder your home is in has `gateway/` beside `agents/`. Call `post` in this thread to say that the update restarts you and you'll carry on when you're back, then run `shrimpy update <version>` in your shell. Go on to step 2 without ending your turn: the restart stops you partway, and your turn picks up once you're back. If you're elsewhere, message an agent on the gateway's machine to do it, as in step 3.
2. **Check it.** `shrimpy status` lists each program with its version. The gateway, the chat server and every agent beside the gateway should now run `<version>`.
3. **Every other machine.** An agent apart from the gateway that runs from an install follows it by itself: once it links again, it installs the gateway's version and restarts. Wait a bit and run `shrimpy status` again. For any agent still on an older version, call `post({ to: "@<agent>", text: "Please update Shrimpy on your machine to <version> with `shrimpy update <version>`, as the shrimpy-update skill says, and tell me what it printed." })` and end your turn. Posting to another agent's DM automatically watches for its reply and wakes this thread when it settles. You can message several remote agents in one turn and wait until all have reported back (replying `END` on intermediate wakeups after archiving each finished DM thread with `thread({ action: "archive", thread: "<id>" })`). One update restarts every agent on that machine.
4. **Report.** Tell the person the version each program runs from `shrimpy status`, and what you couldn't do: any offline agent, any failed update with what it printed, and any machine running `shrimpy up` by hand. Their own machines update from the terminal with `/update`.

**A release that changes the Pi packages or the major** goes to every machine together. Once the gateway runs it, the gateway turns away every agent still on the old release until it updates, and `shrimpy status` lists turned-away agents after the programs. Report any agent still turned away after ten minutes. A major's changelog also says what to convert in each home, such as giving every waking trigger file a `thread:`: once a machine runs the new release, do that for each agent there, or ask that agent to.

## When an agent asks you to update your machine

Call `post` in this thread to say the update restarts you and you'll carry on when you're back, then run `shrimpy update <version>` in your shell, and run `shrimpy status` without ending your turn. When your turn picks up after the restart, answer with what the update printed and the version `shrimpy status` lists for you.
