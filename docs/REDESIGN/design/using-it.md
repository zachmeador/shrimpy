# 🦐 Using it

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

This is the terminal, the web client, the commands, setup and sign-in. It is tuned through use.

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Closing a client | The interactive session disposes its runtime on exit | The client detaches and accepted work keeps running. Quitting while the agent is busy prints one line saying the work continues and how to stop it. Reopening shows committed state, and threads and sessions mark replies and work that arrived while you were away. | Confirmed |
| Bare `shrimpy` | Most recent interactive agent and its main chat | Opens your most recent thread with the most recently used agent, and starts that agent's service on demand if installed. Startup failure is explicit and keeps the editor draft. Workspace-wide gateway controls become per-agent controls. | Confirmed |
| Where a setup lives | A pointer file in your home names a workspace, `~/.shrimpy` by default | One folder, `~/shrimpy` unless `SHRIMPY_DIR` names another: `agents/<name>/` for homes, with the gateway's and the chat server's data beside them, and `providers/` for the sign-ins and models every agent there can use. Where a command takes an agent, a bare word means the home of that name there, and `shrimpy up` with no arguments starts every agent in it. A path still works. A folder that holds other files and neither `agents/` nor `providers/` is taken to be someone else's and is left alone, and dot files don't count. Old Shrimpy's `~/.shrimpy` is never read or written. | Confirmed |
| Several clients | A second terminal fails because the first owns the transcript | Clients share the agent's process and Pi orders the input. The UI shows the selected agent, thread and incoming messages. Switching views mid-turn is immediate; the previous thread's work keeps running and stays easy to find. `/stop` written in the thread from any client stops the work there for everyone. What you type in any client posts to the thread, so every client of the channel sees it. | Confirmed. Until 2026-10-08 Esc stopped the session, which no key of the terminal does any more. |
| Terminal and web clients | Terminal only; the web app is a read-only inspector | Both talk in threads and open the sessions behind them, locally or through the gateway. Opening a view never creates an execution owner. Offline agents, lost routes and rejected input show explicitly. Navigation, controls and permissions still need review. | Confirmed |
| `shrimpy run` | Ephemeral; prints intermediate and final assistant text | Posts to a thread, a new one in your DM with the agent unless one is selected, and prints the final settled answer. Scripts that parse today's output or exit codes need updating. | Confirmed |
| Terminal affordances | Pi's `InteractiveMode` plus Shrimpy patches | The terminal client starts thin: talk in threads, watch the work behind them and stop it. Today's affordances come back as daily use asks for them: regular and fullscreen modes, editor history and multiline input, draft recovery, file completion, clipboard text and images, external editor, copy and suspend keys, `!` and `!!`, editing a message the agent hasn't picked up yet, tool-output expansion, hidden turn context, title, header and footer, and readable model, usage and errors. Ctrl+C doesn't exit immediately as Pi's demo does; Esc goes back and stops nothing. | Confirmed. On 2026-11-21 you took the whole screen and moved going back to the Left arrow, with the terminal's mockup, under Not built yet below. |
| `/agents` | Agent and chat navigation | Same, over agents, channels and threads. Helpers appear in a separate work view and never become agents. That view's labels, visibility and cancellation need review. | Keep |
| Model selection | Favorites, no accidental cycling, Enter applies, Ctrl+S saves a default, per-agent thinking | Same gestures. Fix Ctrl+S, which today reaches a workspace Pi setter that Shrimpy's config validation forbids: it sets the current session's model and saves a one-candidate home default. Other sessions and named policies are unchanged. Policies still pick the first available candidate at open; they don't fail over after errors. | Confirmed |
| First setup | Setup makes two agents, `shrimpy` and `mechanic`, and opens a session with the mechanic to finish | Setup makes one agent, named `shrimpy` unless you choose otherwise, and you finish setup by talking to it. It has the admin role by default: the instructions and skills for setting up and repairing a Shrimpy setup, which old Shrimpy gave to the mechanic. No second agent is made by default; you ask for more when you want them. Since 2026-10-05 admin is also a role on the roster that [a few operations take](3-identity.md). Since 2026-10-07 the first agent a roster has is an admin from the moment it joins, and any later one is promoted with `shrimpy members promote`. Every agent is shown the skills for setting up and repairing, so nothing has to move. Every new agent's starter `SOUL.md` says it enjoys the shrimp emoji, as today's `shrimpy` agent does. Where this plan says "the mechanic", it means the agent with the admin role. | Decided in the build, on your leaning of 2026-10-04 |
| Setup and auth | — | Existing files survive; local endpoints, API keys and OAuth work; errors say what to do next; credentials belong to the folder agents are started in, or to a home that keeps its own, as [providers](5-home.md) has it. No credential copying, cache warming or per-request model routing. Signing in is the same command wherever agents run, [sandboxes and other machines](6-network.md) included. | Keep |
| `shrimpy update` | Opens the mechanic TUI with the update skill | A deterministic preview by default. `--guide` runs the update skill in an ordinary thread. Exact tag or SHA apply stays explicit, with approval before consequential changes. The hidden `update check-mechanic` becomes ordinary preflight. An update says first which kind it is: one that changes the Pi packages reaches every machine together, after a copy of every home, since a machine on other packages is refused, and so does one that changes contracts on both sides of a link between machines, as [the contracts](2-contracts.md) have it; any other reaches machines one at a time. | Confirmed. The two kinds came on 2026-11-14 |
| Web app | Read-only inspector | A client for talking and watching: browse channels, threads and agents, talk in threads, and open the work behind them. Keeps the inspector views: files, tree, context, channels, triggers, runtime, bounded transcripts, folded output, images, thinking, usage and follow-latest. Pi-backed queries replace JSONL reading. URLs, anchors, pagination and write permissions need review, including loopback, same-origin and CSRF rules once the web app can send input. | Confirmed |

What old Shrimpy had that isn't back is listed under Not built yet below, as you marked each. A command missing upstream isn't removed implicitly.

**Commands**

**What earns a command,** decided on 2026-10-04 after old Shrimpy's rule that every feature is a command had grown it to about 65. Commands operate Shrimpy; clients and tools use it. A command starts, stops, configures, inspects or repairs a program or a home, and `run` and `read` are the shell's client. What happens inside a conversation belongs to the clients and to an agent's tools. A command is never added in the change that adds the feature: it gets a change of its own that names who asked for it, which is you, a skill that tells someone to run it, or a test that can't reach the seam from code.

**A person needs one command,** decided on 2026-11-14: "this ux has to be simple for users. will be very dumb and annoying if they have to remember tons of cli just to use shrimpy". That command is `shrimpy`. Keeping Shrimpy running and starting again what ends are the service's job, and putting things right is an agent's, which you ask in a thread. Every other command is for agents and scripts, or is a line that a skill, an agent or another command hands you to paste, as `shrimpy invite` prints the line to run on the other machine.

**Setting up is `shrimpy` too,** agreed on 2026-11-14. On a machine with nothing set up, `shrimpy` walks you through it in the terminal: signing in to a model provider, the one step that needs you at a browser; naming your first agent, `shrimpy` unless you choose otherwise; and keeping Shrimpy running as a service. Then it opens your DM with that agent. After that `shrimpy` opens the terminal, whose first screen says when a program is down and being started again, so you never need `status` or `up`. A new agent, a room or a trigger is something you ask your admin agent for. What only you may do, such as signing in again, letting another machine of yours in or taking back a device, is a `/` command in the terminal. Another machine starts with `/devices invite`, since no agent may invite a device, and an agent can do the rest there, as you agreed on 2026-11-15. `shrimpy login`, `shrimpy agent init` and `shrimpy up` stay, for scripts and agents.

| Current family | Outcome in the replacement |
|---|---|
| — | Rooms are new. Confirmed on 2026-10-04: `shrimpy rooms` lists the rooms you are in, `rooms new <name> [<member>...]` makes one, and `rooms add <room> <member>...` adds members. You asked for them so that making a room is something you ask an agent to do: an agent runs them from its shell as itself. Leaving and removing wait until someone needs them. |
| Watches: list, add, enable, disable, show, history, run | Renamed to `shrimpy triggers` with no `watches` alias. Per-home trigger policy and durable occurrence observation. Agents are who will use these most, so on 2026-10-04 you asked for a command path that feels intuitive and checks what it is given: a small local model that gets a schedule wrong is told so at once, where a hand-edited file would only be checked at reload. Confirmed on 2026-10-04: `shrimpy triggers` lists them with the next run and the last outcome, `add` makes or replaces one, `show` prints one with its recent occurrences, `run` fires one now, `on` and `off` enable and disable, and `remove` deletes one. They act on the agent whose shell they run in and take `--agent <name>` elsewhere. A trigger that fires once is not among them: it is the tool `check_back`. |

**How a command names its agent,** agreed and built on 2026-10-05. The commands did it two ways: `sessions` and `agent` took the agent's name first, and `triggers` and `wake` acted on the agent whose shell they ran in and took `--agent` for another. A check of the design found the two, and you agreed to one. A command about one agent acts on the agent whose shell it runs in, and takes `--agent <agent>`, a name or a path, to act on another. In your own terminal no agent is running the command, so you give `--agent`.

| Command | Before | Now |
|---|---|---|
| `sessions list` | `sessions list <agent>` | `sessions list [--agent <agent>]` |
| `sessions read` | `sessions read <agent> <session> [--json]` | `sessions read <session> [--json] [--agent <agent>]` |
| `sessions steer` | `sessions steer <agent> <session> <text>` | `sessions steer <session> <text> [--agent <agent>]` |
| `sessions stop` | `sessions stop <agent> <session>` | `sessions stop <session> [--agent <agent>]` |
| `agent status`, `agent context` | `agent status <agent>` | `agent status [--agent <agent>]` |
| `triggers` and its six, and `wake` | `[--agent <agent>]` | As now |

A name with no flag stays where it says something else. In `run <agent> "<text>"` and `threads <member>` it is who you are talking to. In `agent init <agent>`, `agent serve <agent>` and `up [<agent>...]` it is which agent to make or start, and nothing is running yet whose shell the command could be in.

One addition was made in the build, and is yours to strike: in your own terminal, when the Shrimpy folder has exactly one agent, a command with no `--agent` acts on that one. The terminal client already takes you to the only agent in the same way. With two or more it says which agents there are and asks for the flag. A command that such a command prints for you to run next always names the agent.

**The terminal's keys,** confirmed on 2026-10-05, after a look at the terminal as a whole that you asked for because its keys weren't intuitive, and built that day. The terminal had two keys for going back, Esc on a list and Ctrl+T in a thread, two for a new thread, `n` and Ctrl+N, and Esc meant back on a list and stop in a thread. Four rules now decide a key:

1. One key means one thing on every screen.
2. Enter goes in, and Esc goes out. The screens are levels: agents and rooms, then threads or sessions, then one thread or one session. Esc goes up a level, and never does anything else. Until 2026-10-08 it had one exception, which every agent client has: while the agent was working in your DM thread, Esc stopped that work. You called it bad UX the first night of living with it: "Esc works as back in the shrimpy terminal browser but if an agent is running it interrupts instead of going back". A thread where an agent was working couldn't be left without stopping the work. Stopping is `/stop` written in the thread, in a DM and in a room alike.
3. Pi's key where Pi has one. The editor is already Pi's, and Shrimpy is built on it.
4. Every key is findable: the line at the bottom of a screen names every key of that screen.

| Key | Does |
|---|---|
| Enter | Opens what is chosen, or sends what is typed |
| Esc | Goes back a level. With the list of commands open, closes the list |
| Ctrl+C | Clears what is typed. Twice quits |
| Ctrl+D | Quits when nothing is typed |
| Ctrl+N | A new thread, on the threads list and in a thread alike |
| Left, Right | On an agent's screen, filter its list: everything it is part of, or only your threads with it |
| Tab | In a thread opened from an agent's screen, turns it over: the conversation, or the session as that agent sees it. With the list of commands open, completes the chosen one |
| Ctrl+O | Tool calls in full, and back to brief, wherever work is shown |
| Ctrl+T | Thinking in full, and back to brief |

Ctrl+O for tool output and Ctrl+T for thinking are Pi's keys, and Claude Code has Ctrl+O for the same. Codex opens its whole transcript with Ctrl+T. Two things were left for later: a screen that lists every key, which waits until there are more keys than fit on the line, and scrolling keys, since what scrolls off stays in the terminal's own scrollback.

On 2026-11-21 you moved the terminal to the arrow keys, with [its mockup](../../terminal-mockup.html) in front of you: Right goes in and Left goes out. That isn't built, so the rules and the table above are how the terminal works today. What changes is under Not built yet below.

**The front page of the command line,** decided and built on 2026-10-09. You said that "`shrimpy --help` and the already cluttered cli is annoying me a little bit". It printed 84 lines: all 37 commands, each with its whole usage, and two paragraphs. A front page is for a person, who uses about eight commands. The rest is for agents, who learn it from the skills and from each command's own help.

- `shrimpy --help` prints about twenty lines with no option on them: the commands a person uses, and then a line for each group, under what they are for: agents, a shell, more than one machine. Since 2026-11-14 `shrimpy` leads it alone, and the rest sit under "for scripts and agents", as one command for a person asks.
- A group's help, `shrimpy triggers --help`, lists the group with each command's usage and its one line. Nothing is harder to find for having left the front page.
- The programs that `up` runs, `agent serve`, `gateway serve` and `chat serve`, are off the front page and in their groups' help.
- Six commands took the names that say what they do, with no alias for the old ones, since nothing is released:

| Was | Is | Why |
|---|---|---|
| `gateway status` | `status` | It reports the whole setup, not the gateway |
| `gateway install`, `gateway uninstall` | `install`, `uninstall` | It installs `shrimpy up`, on a machine that may have no gateway |
| `providers login` | `login` | A group with one command |
| `members invite` | `invite` | It is the first half of letting someone in, not upkeep of the roster |
| `agent join` and `join` | `join` | The link says which: one that names an agent makes that agent's home, and one with no name makes the machine yours |

- What an `<agent>` can be is said in the help of the commands that take one, and what the Shrimpy folder holds in the help of `up`.
- A command that doesn't exist says so in a line that names where to look. It doesn't guess which was meant.

**Commands in a thread,** which you asked for on 2026-10-08 and which were built that day: "there should be a tui modal when you type `/` into the input box and you can see what commands there are and a brief explainer".

- **The list.** While what is typed in a thread starts with `/`, the editor lists the commands that can be written there, each with one line on what it does where you are. Typing narrows it, Up and Down choose, Enter acts on the chosen one, Tab only puts it in the input, and Esc closes the list. It is the editor's own list, and its keys do what they do in Pi.
- **A slash always starts a command.** Decided on 2026-10-08: "we should consistently interpret `/` as only a slash command preview, not something someone can input. they can just wrap it in backticks". A text that starts with a slash is never posted as an ordinary message. A name that is no command gets a note that says so and names the commands there are, and the text stays in the input. A message that starts with a slash is written in backticks, or with anything before it. A text that starts with a mention and then a command, as in `@scout /stop`, is posted, and the agent acts on it.
- **Two kinds.** A command for agents is a message: it is posted, the thread keeps it, and each agent it is for acts on it with no model call, so it works from every client. `/stop` and `/model` are these. A command for the terminal is acted on by the terminal and posted nowhere. `/status` is the one.
- **A change to how an agent behaves in a thread shows in the thread.** The first `/model` changed the model behind a thread and left nothing there: "the user isn't presented with something in the transcript about this change, which can be very impactful. likewise it should be obvious to the agent that this changed". So a command that changes an agent is a message, the agent answers it in the thread with one line, and the agent is told with its next input.
- **`/status`** shows a block above the input, for you alone, of what was true when you asked. In a DM: the agent, its version and whether it is running, what it is doing in this thread, the inputs that wait, the model, the tokens and the cost of the thread's session, and how many of its other sessions are working. In a room: each agent there, whether it is running and whether it is working in the thread. It goes when you send a message or leave the thread.
- **One place says which commands agents act on:** the chat contract, with the line a client shows for each. The agent's actions are typed by those names.
- **`/model`** is for a quick try of another model in one thread: "just for moments where i want to quickly try a different model in a thread with an agent". It was first the terminal's own, which changed the model behind the thread and posted nothing. You used it that day and found three things wrong, so it is a message now. `/model` and a space lists `default` and the models the agent can use, and Enter posts `/model provider/id`. The agent has the thread's session use that model from its next request, and answers in the thread with one line: which model the thread runs on now, and which it ran on before, or why it can't use that one. It can be the first thing in a new thread: "i'll open a thread with an agent and switch that thread's model to something at the beginning". It lasts until the agent is started again or its default model changes, and `/model default` follows the agent's model again. Bare `/model` is answered by the terminal, in a note, and posts nothing. An agent's default model is not this command's: you tell the agent, and [a reload applies it](5-home.md).
- **In a room `/model` names who it is for,** as in `@scout /model provider/id`, and `@all` changes every agent there. With no mention it is for nobody, and the terminal doesn't post it. You weighed it changing every agent, as `/stop` stops every agent: "if someone has a big room this could get really annoying to revert if you did it accidentally".
- **A thread is not named for a command,** nor for what an agent said about one: the list shows the first thing that was said in it.

**Seeing work wherever it is,** built on 2026-10-09 after two of your agents talked in a DM with each other and the terminal showed all four as idle: "i heard the inference servers under load, and i did not see anything in the tui".

- The list of agents shows an agent as working when any of its sessions is, and says where when that is not with you: `working · DM with crab`, a room's name, or `trigger nightly`. It follows each running agent's sessions live while the list is on show.
- An agent's screen opens with the row chosen where the agent is working, when there is one.
- An agent that hangs keeps its last state until Chord closes its link, about 30 seconds after it fell silent, and then reads as idle. Until the move to Pi 1.5.2 the terminal asked every two seconds, and an agent that didn't answer in five read from your own threads with it.
- The first screen's top line is Shrimpy's name, its version and the release's name, as you asked that day: `shrimpy · 0.0.0 · A Rising Tide`.
- **An agent's screen is one list of everything it is part of,** since 2026-10-09. Earlier that day each DM between two agents sat on the first screen, and after using it you said why that was wrong: "the dms being on the main browsing view doesn't make sense. if i go into crab, i should be seeing all of its dm threads, with me and others. and maybe arrow left/right could be used to filter just to the user's threads, or all threads". The list holds the threads of its DM with you, the threads of its DMs with other agents, the threads of rooms it has worked in, and its triggers' own sessions, newest first, each with who or where it is with. It opens on everything, and Left and Right switch to only what is with you. Enter opens a row as the conversation it is, both sides, with that agent's work beside it: with input where you are a member, and without where you are not, with a line that says why. Tab turns such a thread over, to the session as the agent sees it and back.
- The first screen holds agents and rooms. A room you are not in is there, marked as read only, and is joined with `shrimpy rooms add`, which the line in it gives whole.

**Watching any session from the terminal,** which you asked for on 2026-10-05, ahead of the web client, and which was built that day. The direction already says that opening the terminal, picking an agent and entering any of its sessions is core UX. Until now the terminal listed only your own threads with an agent, so a session behind a room, behind the agent's DM with another member, or a trigger's own couldn't be reached from it.

- Until 2026-10-09 an agent's screen had a second list, its sessions, one Tab from your threads with it. Every session is now a row of the agent's one list, as [seeing work wherever it is](using-it.md) has it.
- The session as the agent sees it, live, with what it was shown, its thinking in brief, what it wrote and each tool call, is one Tab from the thread it is behind. A trigger's own session, which is behind no thread, opens as that view. It is for watching only: there is no input and no stop, as you decided, and Esc goes back.
- Ctrl+O shows tool calls in full, the whole call and what it printed, and puts them back in brief. Ctrl+T does the same for thinking. Both work wherever work is shown, your own DM thread included.
- The agent says where each session is. The terminal can't ask chat, which tells nobody about a channel they aren't in, and you aren't in an agent's DM with another agent. So a session's summary in the agent's contract carries the place as facts: a DM and with whom, a room and its name, the thread's name, or a trigger's name. `shrimpy sessions list` prints the same.
- A watch shows the newest 200 items of a session and says when earlier ones aren't shown. Before the move it said how many, which a session's window no longer carries. In full, a call, what a tool printed, thinking or an answer shows up to 100,000 characters. The sessions are listed in the agent's own order, so a row keeps its place while it works.
- Watching takes what `sessions read` takes: you, or an admin. Watching scout's session behind its DM with another agent shows you that DM as scout was shown it.

**What the move to Pi 1.5.2 brought,** built on 2026-11-14:

- Why a turn failed is one sentence for each reason, with what to do, and reads the same in the turn's receipt, in `/status` and in `sessions read`.
- A wake-up an agent is waiting on shows as a line beside the thread's work, with its time, its note and that `/stop` cancels it, and in a watched session, `/status` and `sessions read`.
- `/devices` in the terminal lists your devices, and `/devices take back <label or ID>` ends a device's way in and everything it holds open. No agent may, since a device is you.
- An image the model was shown is named in a session view by its kind, such as `[image: image/png]`. The web client will show it.

Inherited terminal commands each need a disposition:

- **Keep the intent:** `/settings /model /thinking /copy /name /session /changelog /hotkeys /login /logout /compact /reload /quit`, plus Shrimpy's `/agents /status /shrimpy`. Help, status and changelog stay presentation-only; default saving, reload and quit follow the decisions above.
- **Keep the capability with a reviewed durable UX:** `/tree /fork /clone /new /resume`, using threads and Pi's real session, fork and context semantics. `/new` starts a thread, or resets the session in a chat app without threads. A reset isn't presented as archive and restore.
- **Drop old-format `/import`** (pending review). `/export` stays as a readable export of current history, without promising Pi JSONL compatibility.
- **Review `/trust`** against deliberate home resources; ambient project instructions stay off. `/share` and `/scoped-models` stay hidden as today.
- **Keep** `/skill:name` and prompt-template expansion, the `!` and `!!` distinction, command completion and existing input shortcuts. The new work view is a reviewed addition.

**Open**

What daily use asks for is under Not built yet below.

**Not built yet**

*`/devices invite`,* decided on 2026-11-15: letting another machine of yours in from the terminal, beside `/devices` and `/devices take back`, with the line to run there that `shrimpy invite` prints, which stays for scripts.

*A room's thread shows each agent's work,* decided on 2026-11-15, once the terminal was on Pi 1.5.2, and built after the move: "go with your best judgement and i'll only really know once i'm using it. worst case scenario, we change it later". While a room's thread is open, the terminal follows the session each agent in the room has for it. An agent that is working gets a block of its own under the conversation, with its name and the brief view a DM shows, which Ctrl+O and Ctrl+T open in full. The block goes when its turn ends, and its reply is in the conversation like anyone's.

*The two clients share one client,* decided on 2026-11-21 and under Now in the [order of work](../PLAN.md#order-of-work): "i want to get building asap". [The code's layout](code-layout.md) has the shape. The terminal's link, its state and its words move up to be shared, and each client keeps its drawing and its input. It is built in four steps:

1. The move, with no change in behavior.
2. The views by level, and then the terminal as its mockup has it.
3. The web client on the same modules, as its mockup has it.
4. A Mac app that wraps the web client, in Electron, as [the plan's direction](../PLAN.md#direction) has it. It waits until you have reviewed the branch: "that can wait until after i review the branch".

Once the views are by level, the terminal's drawing and the web client share no file, and are built side by side. What the web client needs of the other programs is built beside the first two steps: the read marks in [the conversation model](4-conversation.md), an agent's sigil in [the home](5-home.md), and a browser's way in, in [the network](6-network.md). The build started on 2026-11-21, on the branch `clients`.

*The terminal, as its mockup has it,* from 2026-11-21. You asked for a mockup of the terminal and the commands, since the terminal's "current state is basically a prototype and i'm open to large scale improvements", and said of it: "again, knocked it out of the park". [The mockup](../../terminal-mockup.html) is one page to open in a browser. Each frame is a terminal drawn cell by cell that takes the client's keys, in the look of the web client's mockup. None of it is built. It is the second of the four steps above. Six things on it are decided:

- **It takes the whole screen.** The client draws on the terminal's alternate screen, so lists stay on show beside a thread and the input stays at the bottom. It was "later" among your marks below, because the first spike lost the transcript on the way out. You took it: "i think all of the agent cli apps are moving to whole screen, as well as pi. so that's fine". pi-tui 1.5.2 says it prints the whole thread back when the client leaves, which is from its README and untried. Scrolling becomes the client's with it: PgUp, PgDn and the wheel, a drag to select and copy, and pi-tui's search.
- **The arrows move you.** "i do think i want to move to arrow key nav for the cli. so, when viewing a session it'd be left arrow instead of esc. right arrow for enter. obv when in an input box left arrow would only leave the session if there's no text to traverse in the box". Right goes in and Left goes out, which replaces the second of the four rules above. In a thread, Left moves through what is typed and goes back a level from its start, and what was typed stays with the thread. Three things follow that you didn't say, and are yours to strike: the choice between everything and yours moves from Left and Right to Tab, which then means the other view of where you are; Esc only closes the list of keys and the list of commands; and Enter still opens a row, as Right does.
- **Two more keys.** Ctrl+G opens the list of every key, and Ctrl+\ puts the levels back to one at a time where a wide terminal shows them side by side. You kept both: "sure, those key combos can stay".
- **The thread's input stays under the agent's view.** On 2026-10-05 you decided that the session as the agent sees it is for watching only, with no input and no stop. The mockup keeps the thread's own input under it, so that you can write a message in the thread while you watch, and you took that over the earlier decision: "yep, a big improvement. love it". It is the thread's input, so a command written there works as it does from the conversation, `/stop` included. A trigger's own session is behind no thread, and still has no input.
- **A sigil is written once.** Each agent has a pigment and a sigil, as in the web client's mockup. "i actually really like this if the sigil is defined once and rendered for cli/web". It is one bitmap of twelve by twelve, which the web client draws as pixels and the terminal as braille dots and half blocks. It is a file in the agent's home, as [the home](5-home.md) has it.
- **The ground is painted where the terminal has true color,** in the web client's dusk or day by the terminal's own background, and is the terminal's own where it hasn't. You liked both and said "your call". It is easy to turn the other way.

The rest of the mockup stands as drawn until you say otherwise, and its last sheet lists it: the levels side by side from 96 and 128 columns, a key named beside what it acts on, a count of what is new, a dock that keeps to a line for each kind of thing, each working agent's latest step where several work in a room, and the commands gaining color on a terminal. One choice on it is on [your list](../AUTHOR-TO-REVIEW.md).

*Using it: the web client,* under Now in the [order of work](../PLAN.md#order-of-work) since 2026-11-21, as the third of the four steps above. It counts what is new from the read marks in [the conversation model](4-conversation.md). Its home tab starts small, as you said on 2026-11-21: "don't need anything crazy complex here, just a markdown viewer for mvp and being able to look at images". It lists an agent's files, shows a Markdown file or an image, and changes nothing. How a browser gets in is in [the network](6-network.md), and how notifications work is in [the conversation model](4-conversation.md).

A web client for talking and watching: channels, threads, agents and sessions, with history, live view and input, alongside the inspector views. Since 2026-10-08 it is how your phone reaches Shrimpy, as [the plan's direction](../PLAN.md#direction) has it, so it is built for a phone first: installed to the home screen, with a push notification when an agent answers or writes while you are away. Three things follow for how it is built, so that a companion app can wrap it later, on a phone or on a desk, and you agreed to them: every screen works with no browser bar around it, a phone comes in as a device of yours, with an invitation, as a machine does, and what sends a notification doesn't know whether a browser or an app receives it. On an iPhone the installed web app gets Web Push from iOS 16.4, with nothing of Apple's to sign up for, and you want that for sure: "that is desired for the web app for sure", 2026-11-21. A companion app can't bring it along, since a web view has no push of its own. It needs Apple's push service: through a relay that holds the app's key, for a build from the App Store, or with your own key on the gateway, for a build you sign. Which of the two, and whether the project runs a relay, is to settle when the companion app comes. Installing and push need HTTPS, which on a tailnet is a certificate for the machine's name there. Since 2026-11-21 the gateway is pointed at the certificate's files, as [the network](6-network.md) has it. It is one web client, and one frontend that lays itself out for the width it has, a level at a time on a phone and side by side on a desk. You said you will be opinionated about how it looks and feels: "i am going to be very opinionated on the aesthetics and ux", 2026-10-08. So its look was shown to you as a mockup before any of it was built, and [the mockup](../../web-client-mockup.html) is the reference for how the web client looks and is laid out since 2026-11-21: "lock this in", and "it becomes a reference for shrimpy development". It is one page to open in a browser, with live frames of the client at a desk, on a tablet and on a phone, at dusk and by day. What decides the look is one block at its top, apart from the screens' structure. Its last sheet lists what it chose that this file hadn't said, which stands as drawn until you say otherwise. One choice on it is still yours: the face, Atkinson Hyperlegible or the system's own, since your first look was at a preview with no network to fetch a face. The first spike's page, built on packages Shrimpy no longer uses, showed two things a web client has to do: mark its view stale while it has no connection, since the page went on showing "model is answering", and back off when it retries, since a retry every second left about ten thousand failed requests in the browser.

*Using it: what daily use asks for.*

Under Later in the [order of work](../PLAN.md#order-of-work).

**From living with it.** You moved in on 2026-10-07. What you notice goes here as you say it, in your words where they help, and leaves when it is built or dropped. A thing that needs a decision of yours is on [your list](../AUTHOR-TO-REVIEW.md) instead.

- Updating Shrimpy. "updating shrimpy will be something we want to have a good ux on, especially for people with multi-machine setups", 2026-10-08. Nothing is built: today it is new files in the checkout and a restart of the service on each machine, by hand, and programs on different machines can run different versions in between.
- Setting up through `shrimpy`, as the commands above have it: the terminal's flow for a machine with nothing set up, its first screen saying when a program is down, `/` commands for signing in again, and the front page led by `shrimpy`. Today a new setup is three commands, which the setup skill gives.
- Moving over from old Shrimpy, which you asked on 2026-10-08 be tracked with updating. Nothing is built, and [the plan](../PLAN.md) has what it is meant to be.
- Shell completion for the new commands. Old Shrimpy's is set aside with it, and a line in the shell's startup file still looks for it.
- An empty main thread reads "(no messages yet) [main]" on an agent's screen, so the main threads of two empty DMs look the same, and only where each is tells them apart. "two entries for main?", 2026-11-17, of an agent's DMs with you and with another agent. A room can be called `#main` too.
- An agent's screen could set your DMs with it apart from the rest: "probably makes sense to visually group sessions that are user dms vs. not", 2026-11-17.

**Outcome:** the rough edges you found by using it are gone.

This phase has no fixed scope. Its list comes from use, and its order is yours. The known candidates:

- Thread and session operations: reset, archive, resume, fork, names, search, read and export.
- Chat commands in a thread: `/new`, `/status` and `/help`, for a chat app with no screen of its own. `/stop` is built, and the terminal answers `/status` itself.
- Reactions, edits and deletes in threads. The chat server has them. The clients need keys for them, and agents need tools: the [message tools](4-conversation.md) row names `react` and an `edit` option on `send_message`, and doesn't yet say how an agent deletes a message of its own.
- Model selection, defaults, settings, setup and sign-in; status and help come from the service. Signing in is built, once for each folder agents are started in, with `shrimpy login`, as [providers](5-home.md) has it, and `/model` chooses a thread's model. Choosing the model an agent starts with, from the terminal, is still to come.
- Your own settings, beyond the name [identity](3-identity.md) has.
- Attachments on messages, including clipboard files and images. An image reaches the model with its message.
- The search tools and a tool that shows the model an image file.
- Memory breadcrumbs, with the search index behind them and the `memory-management` skill.
- Terminal affordances from today's client, listed under [terminal, models and settings](using-it.md).

**Prove,** for whatever gets built:

- Keyboard, editor, file, image and shell interactions.
- Agent navigation, preflight failure and several clients. A failed switch restores the previous view and draft.
- Web queries and subscriptions, new IDs and anchors, and large transcripts. The web client uses the same operations as the terminal.
- Presentation content never reaches provider input.

**Rule:** an affordance today's Shrimpy has comes back when it's missed. What hasn't come back by the release is decided then, as [the plan](../PLAN.md#order-of-work) has it, from the command families above and what old Shrimpy had below.

**Replaces:** private TUI patches, the old transcript readers and duplicated settings and lifecycle bindings.

*What old Shrimpy had, and isn't back,* as you marked each on 2026-10-08: keep, later or drop. It is listed by what a person or an agent could do with it and nothing else: "i do not want to accidentally bring over old code and poison the design".

**In outside chat apps.** None is in the first release, and each comes with a chat adapter if one is ever written, as [the plan's direction](../PLAN.md#direction) has it: talking to an agent from Telegram, a bot for each agent, choosing which agent answers in a chat, limiting which chats and people may talk to an agent, typing, formatted and split replies and sender labels, merging quick bursts, photos the agent sees, a message that doesn't notify, reaching a person where they were last active, binding and unbinding a channel, guided Telegram setup, and `/new`, `/clear`, `/help` and `/thinking` in a chat app.

**Conversations and sessions.**

Marked on 2026-10-08. What you dropped is under the list, with why.

- Archive or rename a thread — wanted: "yeah this is needed ux". The chat server does both, and nothing a person uses reaches them.
- Post to a room from the shell — wanted: "i can think of reasons this is needed. and it's not that complicated".
- Delete a room — wanted, and new: leaving a room and removing a member can wait "as long as you can delete a room". Nothing deletes one.
- Search past threads and sessions — wanted as one tool for agents: "probably makes sense to add one agent tool for this".
- Leave a room or remove a member — later.
- Compact a session by hand — later, with the compaction work.
- Copy the agent's last answer — later.

Dropped, nine:

- Resetting or restoring a session: "i don't really see a point in resetting a session. just make a new one imo? and archive the old if it's junk".
- Forking or cloning a conversation: "i kinda don't think it makes sense to fork sessions in shrimpy. you just make a new thread and reference a past convo".
- Choosing a model, a thinking level or a skill for one `run`: "people can just run pi if they want that".
- Following a channel from the shell, exporting a conversation, since `shrimpy read` prints one, importing an old session, naming a session and showing its details, an agent's text along the way while `run` waits, and nudging an agent that said nothing.

**The terminal.**

Marked on 2026-10-08. What you dropped is under the list, with why.

- A way to show the keys — wanted: the line of keys at the bottom "is getting a bit crowded. some way to display keys is needed". You mean to restyle the terminal a little at some point. The terminal's mockup of 2026-11-21 draws one.
- The shrimp in the terminal's tab title — wanted, and soon: "move this bad boy up the priority stack". The mockup has it, with how many agents are working and how much is new.
- See what arrived while the terminal was closed — later, and soon. The mockup counts what is new by each agent and thread.
- Reopen the latest thread with the latest agent — later.
- Open settings — later; there is nothing to set yet.
- Set an agent's thinking level with `/thinking` — later; it would work as `/model` does.
- Sign in or out from the terminal — later, and since 2026-11-14 wanted, as a `/` command, since a person needs one command.
- Paste clipboard images into a message — later, with attachments.
- Edit a message the agent hasn't picked up yet — later, with the ways in for edits and reactions.
- Use a fullscreen mode — taken on 2026-11-21, with the terminal's mockup, under Not built yet above. Until then it was later: in the first spike, leaving `pi-tui`'s fullscreen lost the transcript.

Dropped, fourteen:

- `/reload`: "users shouldn't have to think about needing to reloading things and don't need a tui path for it".
- `/skill:name` and prompt templates: "ux is just 'hey @crab run my weekly update pls' and it runs that skill".
- A shrimp that swims while an agent works: "i like the current animation in the tui".
- Recalling an earlier message with Up in the input: "user can issue a correction in the next message. and they can /stop if they said something rly dumb and then send another message".
- An external editor, suspending and copying with keys, which you leaned towards dropping.
- `/changelog`, `/quit`, `/agents`, `/trust`, a shell line with `!`, completing file paths, which are on the agent's machine and not the terminal's, hidden context with a header, a footer and constant usage, favourite models, and starting the terminal with a first message.

**Models and signing in.**

- Name several candidate models for an agent and use the first available — kept.
- See which model an agent resolves to, and add a provider by command — undecided.

**Agents, skills and memory.**

- Set up Shrimpy with one guided command — tracked under the release.
- Get a second starter agent, the mechanic — dropped; the first agent is an admin.
- Update Shrimpy with a preview, a guided update, or an exact tag — tracked under the release.
- Show, inspect, rename, remove and configure an agent by command — remove keeps data.
- List, show, add, update, remove and validate skills by command — undecided.
- Search every agent's memory from the mechanic — replaced by an admin agent using SSH.
- Search the files of the whole workspace, track their changes, and see its status — undecided.
- See what made up an agent's context and the exact request a turn sent — next.
- Edit shared context files once for every agent — next.
- Have an agent keep memory notes in its own voice — comes back with memory breadcrumbs.
- Get default upkeep watches, daily journals, journal compaction and hygiene audits — come back with their features.
- Ask an agent to remember, search or search the web — wait until wanted.
- Add a command's output to an agent's context each turn — gone; small fact files replace it.
- Be told fleet status, other sessions' activity and worker summaries unasked — dropped.
- Hand a coding task to Codex, then follow, steer and cancel it — later, as a skill over the agent's shell and a trigger.
- Give an agent extra tools and commands through extensions — dropped.

**Looking after Shrimpy.**

- Restart or stop the gateway, read its logs, and run services for each program — undecided.
- Complete commands, agents and options with Tab in the shell — planned.
- See the version and release name with `--version`, in help and in the header — kept.

**In a browser.**

- Browse an agent's files, tree, context, channels, triggers, runtime and transcripts — comes back with the web client.

**Reading.**

- Read a gentle getting-started guide, the reference docs and a security statement — reference docs shrink.
