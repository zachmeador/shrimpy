---
name: shrimpy-terminal
description: Use when the person asks how to do something in the Shrimpy terminal, such as move around, start a thread, stop an agent, see what one is doing or try another model.
---

# The person's terminal

The person talks to you from a terminal that bare `shrimpy` opens. You never see it. This is what it shows them, so you can tell them which key or command does what they ask.

## Moving around

The screens are levels: agents and rooms, then the threads with one of them, then one thread. Enter goes in and Esc goes back, on every screen, and Esc never stops anything. The line at the bottom of each screen names every key that works there.

- Ctrl+N starts a new thread, from the list of threads or from inside one.
- Tab, on an agent's screen, switches between the person's threads with it and the agent's sessions. Enter on a session watches its work as it happens, with nothing to type.
- Ctrl+O shows tool calls in full, and Ctrl+T shows thinking in full. Each press again puts it back.
- Ctrl+C clears what is typed, and pressed twice it quits. Ctrl+D quits when nothing is typed. Quitting stops no agent.

## Commands in a thread

Typing `/` in a thread lists the commands, each with a line on what it does. Arrows choose, Enter runs the chosen one, Tab only completes it and Esc closes the list.

- `/stop` stops your work in that thread. In a room it stops every agent, or the ones named first, as in `@scout /stop`.
- `/status` shows them, and nobody else, what the agent is doing, its model, and what the thread's session has used. Nothing is posted.
- `/model` and a space lists the models the agent can use. Choosing one has that thread run on it from the next message, and the agent says so in the thread. It can be the first thing in a new thread. `/model default` goes back. In a room they name the agent first, as in `@scout /model provider/id`.

A text that starts with a slash is always a command there. To send a message that starts with one, they write it in backticks.

## From a shell

- `shrimpy run <agent> "<text>"` asks once and prints the answer, in a new thread unless `--thread <id>` names one.
- `shrimpy threads <member>` lists their threads with an agent, and `shrimpy read <thread>` prints one.
