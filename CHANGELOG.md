# 🦐 Shrimpy Changelog

Public releases at `0.1.0` or later get a short lyrical aquatic release name/tagline.

## 🦐 2.0.0 - A Rising Tide - 2026-11-25

- 2.0 doesn't link with 1.0: update the gateway's machine first, and agents on other machines that run from an install update themselves to its version.
- A DM has no main thread any more: every conversation is a thread, and an agent's `send_message` to you starts a new one each time, so give each trigger that reports to you a thread with `--thread`, or ask your agent to.
- `shrimpy --version` prints the version and the release's name, and `shrimpy --help` starts with them.
- `shrimpy status` lists the gateway's version beside chat's and the agents'.
- `shrimpy agent init` refuses a name your gateway's roster already holds, where the agent used to be turned away when it first ran.
- `shrimpy members remove <name>` removes an agent, and moves its home in your Shrimpy folder to `removed/`.
- An agent removed from the roster stops when its gateway turns it away, wherever it runs, and doesn't start again until it's let in again as a new member.
- The gateway brings a roster from 1.0.0 up to date when it starts, and keeps a copy of the old one beside it, in `gateway/state/`.
- `shrimpy status` and `shrimpy members` show the account and machine each agent last linked from, and `shrimpy agent status` shows its machine and home, also for an agent that is off.
- A room's main thread is now its first pinned thread: it lists first, tagged `pinned`, and it's where an agent's `#room` posts.
- The chat server brings a store from 1.0.0 up to date when it starts, and keeps a copy of the old one beside it, in `chat/state/`.
- An agent's list in the terminal and on the page shows a new default model as soon as the agent reads it, where it showed the old one until the agent went away and came back.
- `shrimpy triggers on` and `off` reach an agent on another machine by its name, and the agent changes its own trigger file.
- The agent's view of a session, in the terminal and on the page, says when the agent was shown each thing.
- An agent's list has two tabs, chat for your DM with it and observe for everything else it takes part in, and its name opens its page: how it stands, its machine, model and version, its triggers and its home.

## 🦐 1.0.0 - A Rising Tide - 2026-11-24

This release replaces the old Shrimpy, `0.6.2` and before, and nothing of an old setup carries over. The old releases' notes are in git, in this file at the tag `v0.6.2`.

**What changed**

- Each agent runs as a program of its own. A chat server keeps the conversations, and a gateway connects agents, the chat server and your devices.
- Agents can live on other machines and join your gateway with `shrimpy invite` and `shrimpy join`.
- You talk to agents in threads, in DMs and rooms, and agents talk to each other the same way.
- A new terminal client replaces Pi's, and a web client for your phone, with push notifications, replaces the read-only inspector.
- Telegram is gone, and no other outside chat app takes its place. Your phone reaches agents through the web client.
- Triggers replace watches.
- Your first agent is an admin, and there's no mechanic.
- Your setup lives in `~/shrimpy`: agents' homes in `agents/`, and sign-ins in `providers/`. The old `~/.shrimpy` is never read or written.
- `shrimpy install` keeps Shrimpy running as a service, in place of `shrimpy gateway install`.
- The install script brings its own Node.
- `shrimpy` on a new machine sets it up: signing in, your first agent and the service.
- `shrimpy update` updates a machine, and your admin agent updates every machine when you ask it to.
- Most old commands are gone, and `shrimpy --help` lists the new ones.

**Moving over**

1. With the old `shrimpy`, stop the gateway with `shrimpy gateway stop` and remove its service with `shrimpy gateway uninstall`.
2. Remove the old commands from `~/.local/bin`: `shrimpy`, `shrimpy-gateway` and `shrimpy-web`. The new install script won't replace a `shrimpy` it didn't write.
3. Remove the `# Shrimpy Completion` lines from `~/.zshrc` or `~/.bashrc`.
4. Install as the README says, and sign in again.
5. Ask each new agent to read what it wants from the old workspace, such as its `SOUL.md`, skills and notes, and to make the watches it needs again, as triggers. Nothing converts old sessions, watches or settings, and the old workspace stays as it is.

**Not back yet**

- Memory notes, daily journals and hygiene audits.
- Searching past threads and sessions.
- Attachments and pasted images.
- Shell completion.
- The thinking level, settings, and signing in or out from the terminal.
- Handing a coding task to Codex.

**Dropped**

- Resetting, forking and cloning sessions. Start a new thread instead.
- Extensions that add tools and commands.
- `/reload`, `/skill:name` and prompt templates. Ask the agent to use a skill by name.
