# 🦐 The terminal's screens and keys, proposed

**State:** a working doc you asked for on 2026-10-05, to look at the terminal client as a whole before more is added to it. Nothing here is decided. It leaves this folder when you have decided.

It is about the terminal client, the thing bare `shrimpy` opens. It is not about the commands.

## What it is today

Three screens, each a level below the last:

| Screen | Shows | Keys |
|---|---|---|
| Agents and rooms | Every agent on the network and the rooms you are in | `↑` `↓` choose, Enter open, Ctrl+C twice to quit |
| Threads | Your threads with one agent, or a room's threads | `↑` `↓` choose, Enter open, `n` new thread, Esc back |
| A thread | The messages, the agent's work while it works, and the editor | Enter send, Esc stop, Ctrl+T back to the threads, Ctrl+N new thread, Ctrl+C clear what is typed, then quit |

- The editor is Pi's, so it has Pi's editing keys: Shift+Enter or Ctrl+J for a new line, Ctrl+A and Ctrl+E for the ends of a line, and the rest.
- What you type in a thread is kept when you leave it and come back.
- An agent's work is shown only in your DM with it, only while it is working, and in brief: the last 12 steps of the turn, a tool call cut at 300 characters, and the last 6 lines of what the tool printed. When the turn ends, the work goes away and the reply is a message.
- In a room's thread Esc does nothing, since a room has no one agent's work to stop.
- One line at the bottom says the keys of the screen you are on. Nothing lists them all.

## What is awkward

- **Going back has two keys.** Esc on the threads list, and Ctrl+T in a thread.
- **A new thread has two keys.** `n` on the list, and Ctrl+N in a thread.
- **Esc means two things.** Back on a list, stop in a thread. In a thread where the agent is idle it tells you there is nothing to stop.
- **Ctrl+T means "threads",** which no other agent client uses it for.
- **Work can't be read closely.** Nothing shows a tool call in full, or thinking in full, and nothing shows the work of a turn that has ended.
- **Most of an agent can't be reached.** Only your own threads with it are listed, so a session behind a room, behind its DM with another agent, or a trigger's own can't be opened.
- **Nothing tells you the keys** beyond the one line.

## What Pi and Codex do

Pi's keys are from its own reference. Codex's and Claude Code's are the ones I checked, and a blank is one I didn't.

| To do this | Pi | Codex CLI | Claude Code | Shrimpy today |
|---|---|---|---|---|
| Stop the turn that is running | Esc | Esc | | Esc, in your DM thread |
| Clear what is typed, then leave | Ctrl+C, and again to exit | Ctrl+C stops the turn, and again quits | | Ctrl+C, and twice to quit |
| Leave when nothing is typed | Ctrl+D | | | |
| Tool calls in full | Ctrl+O | Ctrl+T, which opens the whole transcript | Ctrl+O, which opens the transcript | |
| Thinking in full | Ctrl+T | | | |
| Go back to an earlier message | | Esc twice, with nothing typed | | |
| Queue a message behind the running turn | Alt+Enter | | | Enter: a message that doesn't mention the agent waits |
| A new line | Shift+Enter, Ctrl+J | | | Shift+Enter, Ctrl+J |
| Scroll the transcript | PageUp, PageDown, Home, End | | | The terminal's own scrollback |
| Choose a model | Ctrl+L | | | |
| See every key | `/hotkeys` | | | |

So the key you named, Ctrl+T, is Codex's key for the transcript. Pi and Claude Code both use Ctrl+O for tool output, and Pi uses Ctrl+T for thinking.

## Proposed

Four rules, then the keys that follow from them.

1. **One key means one thing on every screen.**
2. **Enter goes in, and Esc goes out.** The screens are levels: agents and rooms, then threads or sessions, then one thread or one session. Esc goes up a level. The one exception is the one every agent client has: while the agent is working in your DM thread, Esc stops that work.
3. **Pi's key where Pi has one.** The editor is already Pi's, and Shrimpy is built on it. Where Codex differs, that is a choice for you, below.
4. **Every key is findable.** The line at the bottom stays, and one key shows them all.

| Key | Does |
|---|---|
| Enter | Opens what is chosen, or sends what is typed |
| Esc | Stops the agent's work if it is working in your DM thread. Otherwise goes back a level |
| Ctrl+C | Clears what is typed. Twice quits |
| Ctrl+D | Quits when nothing is typed |
| Ctrl+N | A new thread, on the threads list and in a thread alike |
| Tab | On an agent's screen, switches between your threads with it and its sessions |
| Ctrl+O | Tool calls in full, and back to brief, wherever work is shown |
| Ctrl+T | Thinking in full, and back to brief |
| PageUp, PageDown | Scroll what is shown, where the terminal's own scrollback doesn't reach |
| `?` on a list, F1 anywhere | Every key of this screen |

**Watching a session** fits into this as one more screen at the lowest level. On an agent's screen, Tab shows its sessions: every one it has, each saying where it is and whether it is working. Enter opens one for watching: what the agent was shown, its thinking, what it wrote and each tool call, live. There is no editor and no stop there, as you decided, and Esc goes back.

**Work that has ended stays readable.** In your DM thread the work of a turn goes away when the turn ends. With sessions on the agent's screen, the whole of a session is one Tab and one Enter away, so the thread itself can stay a conversation.

## For you to choose

1. **The key for tool calls in full.** Ctrl+O, as Pi and Claude Code have it, with Ctrl+T for thinking as in Pi. Or Ctrl+T for both, as Codex opens its transcript. I'd take Pi's.
2. **Esc going back.** As rule 2 has it, which frees Ctrl+T and ends "nothing to stop". Or keep Esc for stopping only, and give going back a key of its own.
3. **Tab for an agent's sessions.** Or a letter on the threads list, such as `s`, which would be the only letter key left.
4. **A screen of every key.** Worth having now, or wait until there are more keys than fit on the line.

## What it would take

The keys are a small change: one place takes keys, and one holds the words of each screen's line. The session list and the watch view are the real work, with one addition to the agent's contract so that the agent says where each session is. That is in [using it](../design/using-it.md), and it is the same whichever keys you choose.

## Left out on purpose

Commands typed in the editor beyond `/stop`, a model picker, and keys you can change, as Pi has in `keybindings.json`. Each is in [what daily use asks for](../design/using-it.md) or would join it.
