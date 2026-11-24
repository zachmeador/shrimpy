---
name: shrimpy-update
description: Use when the person asks you to update Shrimpy, on one machine or everywhere, or another agent asks you to update yours.
---

# Updating Shrimpy

Each machine runs a release of Shrimpy that was installed there, and `shrimpy update` changes it on the machine whose shell runs it. Nothing should be newer than the gateway, since it serves chat and the roster to everyone, so the gateway's machine goes first and the machines of agents apart from it follow. You need no SSH: on another machine you ask an agent that lives there.

## See what's new

`shrimpy update` by itself says what the latest release is: its version and name, whether it's a patch, a minor or a major, whether its Pi packages differ, and its changelog. Tell the person what it says, with anything the changelog says they have to do, and ask before going on. `shrimpy update <version>` installs that version, and that's also how to go back to an earlier one.

## Update everywhere

When the person says yes, use the version the preview named, written below as `<version>`.

1. **The gateway's machine.** You are on it when the Shrimpy folder your home is in has `gateway/` beside `agents/`. Then say in the thread with send_message that the update restarts you and you'll carry on when you're back, and run `shrimpy update <version>` in your shell. Your turn picks up once you're back. If you're elsewhere, ask an agent on the gateway's machine to do it, as in step 3.
2. **Check it.** `shrimpy status` lists each program with its version. The gateway, the chat server and every agent beside the gateway should now run `<version>`.
3. **Every other machine.** Take the agents `shrimpy status` lists on an older version, one at a time. Ask each with ask_agent, in a question that stands alone, such as "Please update Shrimpy on your machine to 1.2.0 with `shrimpy update 1.2.0`, as the shrimpy-update skill says, and tell me what it printed." Set `within` to `15m`, since installing can take a few minutes. When it answers, run `shrimpy status` again. One update restarts every agent its machine runs, so before you ask the next agent, skip any that already runs `<version>`.
4. **Report.** Tell the person the version each program runs, from `shrimpy status`, and what you couldn't do: an agent that didn't answer, an update that failed, with what it printed, and a machine that runs `shrimpy up` by hand, which only the person can start again. Their own machines update from the terminal there: its first screen says when it's behind, and `/update` written in a thread installs the gateway's version.

**A release that changes the Pi packages or the major** goes to every machine together. Once the gateway runs it, the gateway turns away every agent still on the old release, so ask_agent can't reach those agents. You don't have to: an agent turned away for its release installs the gateway's version and restarts by itself, when it runs from an install. `shrimpy status` lists such agents after the programs until they're back. So for step 3, wait a few minutes and run `shrimpy status` again, and report any agent that's still turned away after ten minutes. An agent on a machine that is off does the same once the machine is back.

## When an agent asks you to update your machine

Say in the thread with send_message that the update restarts you and you'll carry on when you're back, then run `shrimpy update <version>` in your shell with the version you were asked for. When your turn picks up, answer with what it printed and the version `shrimpy status` lists for you. If it couldn't update or restart, answer with what it said.
