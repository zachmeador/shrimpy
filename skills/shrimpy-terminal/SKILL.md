---
name: shrimpy-terminal
description: Use when the person asks how to do something in the Shrimpy terminal, such as move around, start a thread, stop an agent, see what one is doing or try another model.
---

# The person's terminal

The person talks to you from a terminal that bare `shrimpy` opens. You never see it. This is what it shows them, so you can tell them which key or command does what they ask.

## Moving around

The terminal takes the whole screen. It has three levels: agents and rooms, then what one of them takes part in, then one thread. A wide terminal shows two or three of them side by side, and Ctrl+\ puts them back to one at a time. Up and Down choose, Right or Enter goes in, and Left or Esc goes back. In a thread, Left first moves through what is typed and goes back from its start, and Esc goes back at once, whatever is typed. With the list of keys or the list of commands open, Esc closes it first. Nothing the keys do stops an agent. The last line names the keys that move, and Ctrl+G lists every key.

- An agent's list is everything it takes part in, newest first: the person's threads with it, then everything else, such as its DMs with other agents, the threads of rooms it has a session in and its triggers' own sessions. Each row says who or where it is with, when it was last active (a trigger's session has no time), and whether the agent is working there. Tab narrows the list to the person's threads with it, and Tab again shows everything.
- A thread shows what everyone said, with the work of each agent in it beside it. Tab puts each agent's view of the session behind it on show in turn, with what it was shown, its thinking and its tool calls, and then the conversation again. The input stays under every view. A trigger's own session shows that view, with nothing to type.
- What is typed in a thread stays with it while another is open.
- Ctrl+N starts a new thread with the agent or in the room whose list is open.
- Ctrl+O shows tool calls in full, and Ctrl+T shows thinking in full. Each press again puts it back.
- PgUp, PgDn and the mouse wheel scroll, a drag selects and copies, and Ctrl+Shift+F searches the thread.
- Ctrl+C clears what is typed, and pressed twice it quits. Ctrl+D quits when nothing is typed. Quitting stops no agent, and prints the open thread back in the terminal.

## What the person only reads

The person can read threads they are not part of, and nothing can be typed there: an agent's DMs with other agents, which are on that agent's list, and the rooms of agents they are not in, which the agents and rooms list after their own, marked read-only. A line where the input would be says why. To write in a room they join it, with `shrimpy rooms add "#name" <their name>`. A DM has two members and takes no more.

## Commands in a thread

Typing `/` in a thread lists the commands, each with a line on what it does. Arrows choose, Enter runs the chosen one, Tab only completes it and Esc closes the list.

- `/stop` stops your work in that thread. In a room it stops every agent, or the ones named first, as in `@scout /stop`.
- `/status` shows them, and nobody else, what the agent is doing, its model, what the thread's session has used, why its last turn ended without an answer if it did, and when it will check back if it is waiting to. Nothing is posted.
- `/devices` lists their devices: the other machines of theirs that joined. `/devices take back <device>` takes one back, by its name or its ID, and its link ends at once. Only they can do this, so hand them the command.
- `/update` installs the gateway's version of Shrimpy on the machine the terminal runs on, then opens the terminal again. The first screen says when that machine is behind the gateway. When the gateway turns the terminal away for the release it runs, no thread opens, and the first screen offers the same update, which Enter starts.
- `/model` and a space lists the models the agent can use. Choosing one has that thread run on it from the next message, and the agent says so in the thread. It can be the first thing in a new thread. `/model default` goes back. In a room they name the agent first, as in `@scout /model provider/id`.

Under a thread, the terminal says when the soonest of your wake-ups there comes, and `/status` lists every one and says that `/stop` cancels them.

A text that starts with a slash is always a command there. To send a message that starts with one, they write it in backticks.

## From a shell

- `shrimpy run <agent> "<text>"` asks once and prints the answer, in a new thread unless `--thread <id>` names one.
- `shrimpy threads <member>` lists their threads with an agent, and `shrimpy read <thread>` prints one.
