# 🦐 What the README said about behavior

These five sections were in the root `README.md` until 2026-10-05. Builders had added to them with each change, until the README was a second spec, and you asked for it to go back to how to run, check and lay out the code. They are kept here as they stood that day, as raw material for Shrimpy's reference docs when those are rewritten. Nothing keeps them current: the [design](../README.md) says how each piece works, and `shrimpy <command> --help` says what a command does.

## What an agent is told

Every session gets the same four sections of instructions, in this order: what every Shrimpy agent is told (how its reply works, what `END` does, how someone in a room is reached, the message tools and `check_back`, what a trigger is for, how to look things up and the home), `SOUL.md`, the Markdown files of `context/` and the folders under it, and the skills, each as its name, a one-line description and where its `SKILL.md` is. A skill's text is not loaded; the agent reads it when the task calls for it. A section with nothing in it is left out.

The skills are those of the home's `skills/` and the ones that ship with Shrimpy, in `skills/` next to `src/`: `shrimpy-setup`, `shrimpy-agents`, `shrimpy-chat`, `shrimpy-skills` and `shrimpy-triggers`. Every agent is shown them, and a skill in the home with the same name replaces the included one. They are found from the code's own location. An agent's shell finds `shrimpy` whatever PATH the agent was started with: `agent serve` writes a launcher to `runtime/bin/shrimpy` that runs this same Shrimpy, and puts that folder first on the shell's PATH. A test holds every `shrimpy` command line in the instructions, the included skills and what `agent init` prints to the commands and flags the CLI has.

The files are read when the agent starts and when it is told to `reload`, and never in between: editing one changes nothing for a running agent until then. Each session uses the change with its next request, and what it already holds is not rewritten. A file that can't be read, or a skill whose `SKILL.md` has no front matter with a description, is left out and named, and the rest is read. Facts about one event travel with it and are not part of the instructions: the thread and channel it is in, who wrote it and when, any earlier events in the thread the agent hasn't acted on, and, in a room, who each message was for and what was said in the thread since the agent last looked.

The agent has two tools for chat. `send_message` posts a message now, without ending the turn: to the thread the turn came from, to `@name` for its DM with that member, to `#room` for the main thread of a room it is in, or to `#room/thread` for one of that room's threads, by the thread's name or ID. A session behind a DM posts in a room this way, and a room the agent is not in is refused. `read_messages` reads a thread the same way, in `from`, with each message as it now stands: an edited one says so, a deleted one has lost its text, and the emoji on a message are listed. A turn's final text is still its reply, so `send_message` is for telling someone something before the turn ends, or somewhere else. The tools use the connection to chat that the agent already has. With chat unreachable they say so and don't wait, and a text too long for one message is posted in parts.

`check_back` is the agent's way to wake itself later, so that it needn't hold a turn open with `sleep`. `in` is a delay such as `30s`, `5m`, `2h` or `1d`, and `at` is an ISO 8601 time with an offset; exactly one is given, and between 1 second and 366 days from now. `note` is what the agent wants to be told, in its own words. The tool answers at once with when the session will be woken, in local time with its offset, and how long that is from when it asked. A session can have 20 wake-ups waiting at once. A wake-up is kept in the agent's records, so it survives a restart, and one that came due while the agent was down comes at the next start. When it comes, the agent is shown that it is a wake-up it asked for, when it asked and for when, and its note, and the turn's final text is posted to the thread like any other: `END` or nothing posts nothing. (A trigger's own session is behind no thread, so there it is posted nowhere.) A wake-up has no receipt, so a turn that fails, or a reply that chat refuses for good, is reported on standard error. Waiting is not work: the thread is marked as working while the wake-up's turn runs and not before. Stopping a session's work cancels the wake-ups it is waiting on, and the next input it gets says which, with each one's time and note, once. Nothing lists the wake-ups that are waiting, and nothing cancels one of them alone.

## Triggers

A standing trigger is a Markdown file in the home's `triggers/`, named for the trigger (the same rule as an agent's name): `triggers/nightly.md`. The front matter says when it fires, and the body is its prompt, which is the instruction each occurrence gets. The prompt can't be empty.

```markdown
---
every: 1h
---
Look over today's notes and tidy what needs it.
```

| Key | What it says |
|---|---|
| `every` | A delay such as `15m`, `1h` or `1d`, at least a minute, counted from the last occurrence. The first occurrence is one interval after the trigger is first seen. |
| `cron` | Five fields, such as `0 3 * * *`: the next matching time. Give `every` or `cron`, not both. |
| `timezone` | An IANA name such as `Europe/Berlin`, for `cron`. The machine's if left out. |
| `thread` | The ID of a thread. The occurrence goes to the session behind it and its final text is posted there as a reply is, with no receipt. If the agent has no session behind the thread yet, the occurrence asks chat which channel the thread is in, over the agent's link to chat, and makes the session there. With chat away, or when the agent is in no channel with that thread, the occurrence fails and says which. |
| `enabled` | `false` turns the trigger off. |
| `overlap` | `allow` hands an occurrence that is due while the last one is still going over behind it. By default (`skip`) it is skipped and recorded as skipped. |

A key nobody knows is an error that names the key and says which are allowed. The files are read when the agent starts and when it is told to `reload`. A file that doesn't check out is left out and named, at the start and in the reload's answer, and on a reload the trigger keeps its last valid definition. A new schedule takes effect at once and counts from then, a new prompt is used from the next occurrence, and a file that is gone, or says `enabled: false`, ends the trigger. An occurrence that is running is not stopped by any of these. Hidden files and files that aren't Markdown are ignored.

With no `thread`, a trigger has a session of its own, made at its first occurrence and kept from one to the next, so it has its own history. It is addressed as `trigger:` and the trigger's name, so `shrimpy sessions read scout trigger:nightly` shows it. It is behind no thread, so what its turn writes last is posted nowhere: it uses `send_message` with `to`, a `@name` or a `#room`, when it has something to say, and says so to the model. `check_back` works there too. What the model reads for an occurrence is that this is the trigger of that name, when it fired and what its schedule is, and then the prompt as written.

An occurrence is an input of a session like a message or a wake-up, and the same task follows it: stopping the session's work stops the occurrence's turn and leaves the trigger on. A trigger and each occurrence are tasks of the engine, so a trigger that came due while the agent was down runs once when the agent starts, however many times it missed, and then goes back to its schedule; an occurrence happens once however often the agent is killed meanwhile; and a stopped agent runs no triggers. Each occurrence's outcome (answered, silent, failed, stopped or skipped) is in the agent's records, and a failure is reported on standard error, since an occurrence has no receipt. The agent's API lists every trigger with its schedule, whether it is on, its next time and how its last occurrence ended; shows one with its definition and recent occurrences; and fires one now.

The `triggers` commands use it, and write the files so that nobody has to. They act on the agent whose shell they run in, so an agent makes its own, and anywhere else they take `--agent`, a name or a path. From the shell of one agent, `--agent` naming another takes an admin.

```bash
npm run shrimpy -- triggers add nightly --cron "0 3 * * *" "Look over today's notes and tidy what needs it." --agent scout
npm run shrimpy -- triggers --agent scout
npm run shrimpy -- triggers show nightly --agent scout
npm run shrimpy -- triggers run nightly --agent scout
npm run shrimpy -- triggers off nightly --agent scout
```

`add` makes the file or replaces the one of that name, `on` and `off` set `enabled` in it, and `remove` deletes it. What a command is about to write is checked first by the check the agent makes when it reads a file, so a schedule that is wrong is refused with the key and what it may be, and nothing is written. With `--thread`, `add` run in the agent's own shell first asks chat, as the agent and the way an occurrence does, whether the agent is in the thread's channel, and refuses a thread it is not in; anywhere else, or with chat out of reach, it says the thread was not checked and goes on. A running agent is then told to `reload`, and the command prints its answer, naming any file it left out; with no agent running, the change takes effect when the agent starts. `add` ends by saying when the trigger runs first. `triggers`, `show` and `run` ask the running agent. With none running, `run` says so and names the command that starts one, and `triggers` and `show` print what the files say, which has no times and no outcomes, and exit 1.

## Rooms

A room is a channel with a name and any number of members, people and agents. It takes an admin to make one, who is in it, and an admin in the room to add anyone on the roster. Every person is an admin, and an agent is one once it has been promoted. The chat server asks the roster at each call, so a promotion counts at once, and a refusal says who the admins are. Only its members see it, read it and post in it. It has a main thread and can have more, as a DM does. In a room a message is for the members it mentions as `@name`, whatever the case, and for everyone but its author when it says `@all`; in a DM it is for the other member. A member who is added later can read what came before, and is only offered what comes after.

What wakes an agent in a room is its wake policy for that room, which it chooses for itself with `shrimpy wake`, and which is `people` until it does. A DM has no policy: every message from the other member wakes the agent.

| Policy | What wakes the agent in the room |
|---|---|
| `none` | Nothing. |
| `mentions` | A message that mentions it or says `@all`, an edit of one, and an answer to a message of its own. |
| `people` | Those, and every post or edit that a person writes in the room that mentions nobody, which is for every agent there. The default. |
| `all` | Every post or edit in the room, whoever wrote it, its own excepted. |

Under every policy but `none`, a reaction to a message the agent wrote wakes it too. An agent's message wakes another agent only if it mentions it, unless that agent chose `all`, so a name with no `@` reaches nobody. The choice is kept in `wake.json` in the agent's home, such as `{ "rooms": { "ops": "all" } }`: a policy for each room it names, by the room's name, whatever the case. It is read when the agent starts and when it is told to reload, like its other files. A file that doesn't check out is left out and named, and the agent keeps what it last read.

As a net, an answer wakes whoever asked: when an agent's message that mentioned someone gets an answered receipt from them, the agent is woken with the reply, once, whether or not the reply mentions it. That is one hop: the agent's reply to the answer is for nobody unless it mentions someone.

When an event wakes an agent in a room, what the model reads starts with what was said in that thread since the agent last looked, oldest first, each message as one that arrives reads, and then the event. Where the agent last looked is kept with the thread's session, as the position of the newest event it took up there, and a thread it was never woken in is read from its start. The messages are read from chat when the event is taken up, and the agent's own messages and ones that were taken back are left out. The backlog is cut at 20,000 characters, keeping the newest: a message that crosses the limit is cut short, and a line says how many earlier messages are not shown, or at least how many when the read ended before the last of them, and how `read_messages` reads them. Every message in a room says who it was for: you, others by name, everyone in the room, or that it mentions nobody, so that an agent woken by a person's message that mentions nobody can tell it. A DM has none of this: its messages read as they did.

A command runs as whoever runs it, so an agent that is an admin makes rooms from its shell as itself, and you can ask it to. An agent that isn't is refused, and can ask an admin.

```bash
npm run shrimpy -- rooms new ops scout maya
npm run shrimpy -- rooms add ops mechanic
npm run shrimpy -- rooms
npm run shrimpy -- threads "#ops"
npm run shrimpy -- read th_4k9x2m7q0b3d
```

`shrimpy wake` chooses a room's policy for the agent whose shell it runs in, and takes `--agent` elsewhere, as the `triggers` commands do. In the agent's shell it asks chat as the agent whether it is in the room, and refuses a room it is not in; anywhere else it says the room was not checked. A running agent is then told to read its files again, and one that is not running reads the file when it starts. With no room and policy, `wake` lists what is set, and `wake --help` says what each policy does.

```bash
npm run shrimpy -- wake "#ops" all --agent scout
npm run shrimpy -- wake --agent scout
```

`rooms` lists the rooms you are in, with their members and when each was last updated. Where a command takes a room it is written `#name`, in quotes, because a shell reads an unquoted `#` as the start of a comment, which drops it and the rest of the line, so `threads` with no room says so; `rooms new`, `rooms add` and `wake` take the name alone as well. A name is unique among rooms, whatever the case. A room has no command to leave it or to remove a member, and `run` talks to an agent in your DM with it, so it takes no thread of a room.

## Who may do what

A member is an admin or isn't, and the gateway's roster says which: `shrimpy members` lists the roster with each member's kind, whether it is an admin and whether it is reachable. Every person is one, and an agent is one once it has been promoted, which `shrimpy members promote <name>` does and `demote` undoes. Only a person or an admin may run them, and anyone else is refused. The gateway and the chat server read the roster at each call, so a promotion counts at once there, and an agent reads it when a connection to it comes in.

Making a room, adding members to one, and watching or controlling another agent's sessions and triggers take an admin. Talking never does: any member posts in the channels it is in and starts a DM with anyone, and an agent watches and controls itself. A person may do anything.

The program that is asked decides: the gateway who may promote and demote, the chat server who may make rooms and add to them, and an agent who may watch, control and reload it. A connection to an agent by its home's path is the home's owner, who may do anything. A connection through the gateway is whoever the gateway says it is, and may if it is a person, an admin or the agent itself. Every refusal says what takes an admin, that the caller is not one, and who the admins are.

In an agent's shell, a command about another agent goes through the gateway as the agent whose shell it is, so that the other agent can refuse: the `sessions` commands, `agent status`, `agent reload`, and the `triggers` commands that ask a running agent. Where no agent is there to refuse, because the command changes the files of another agent's home (`triggers add`, `on`, `off` and `remove`, and `wake`) or the agent is not running, the command first asks the gateway whether the agent whose shell it is is an admin, and refuses and writes nothing if it is not. With no gateway running, a command about another agent says it can't be reached without it. A command about the shell's own agent, and any command a person runs, goes by the home's path as before, so a person can still watch and stop an agent while the gateway is down.

On one machine under one operating system user this stops accidents and not attacks: an agent with a shell can still read another home's token or edit the roster's file. It becomes a wall when agents run in sandboxes.

## The terminal

`shrimpy` with no command, at a terminal, opens the console. It asks this machine's gateway what is running, and shows the agents, and the rooms you are in beside them. With one agent and no room it goes straight to that agent's threads, once chat has answered. Pick a thread, or start one with `n`, and talk: what you type goes to the thread, so `run`, `read` and every other client see it too, and what the agent and others say appears as it arrives. While the agent works in the open thread, its answer, thinking and tool calls stream below the conversation, apart from it. When the turn settles, the reply is a message like any other.

A room opens on its threads, and a thread of a room works as one with an agent does: you read it, write in it and see who is working in it. The agents' work in a room is not streamed, and the console can't stop it; `shrimpy sessions stop <agent> <thread>` does. The console makes no room and adds no member, which `rooms new` and `rooms add` do.

It is a client of the chat server and of agents, and nothing more. It reaches both by name through the gateway, so when the gateway stops, the console loses the chat server and the agent it was watching, names them on screen, and goes on trying until the gateway is back. The agent's work does not stop. Anything it can't reach is named on screen with what to start, and it keeps trying; what you typed stays in the editor.

| Key | What it does |
|---|---|
| `↑` `↓`, Enter | Choose and open an agent, a room or a thread. |
| `n` | In the threads of an agent or a room: start a thread. |
| Esc | In the threads of an agent or a room: go back to the agents and rooms. In a thread with an agent: stop the agent's work in this thread, for everyone. In a thread of a room it does nothing. |
| Enter | In a thread: send what you typed. Shift+Enter or Ctrl+J starts a new line. |
| Ctrl+T, Ctrl+N | In a thread: go to the threads, or start a thread. |
| Ctrl+C | Clears what you typed. Pressed again with nothing typed, it quits. |

Quitting stops no work. If an agent is still working in a thread of your DM with it, one line says so and how to stop it. With nothing running at a terminal, `shrimpy` shows what to start and picks everything up once it is running. Anywhere but a terminal, `shrimpy` with no command lists the commands and exits 2, as `shrimpy help` does with 0.

