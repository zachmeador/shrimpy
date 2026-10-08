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
| Terminal affordances | Pi's `InteractiveMode` plus Shrimpy patches | The terminal client starts thin: talk in threads, watch the work behind them and stop it. Today's affordances come back as daily use asks for them: regular and fullscreen modes, editor history and multiline input, draft recovery, file completion, clipboard text and images, external editor, copy and suspend keys, `!` and `!!`, editing a message the agent hasn't picked up yet, tool-output expansion, hidden turn context, title, header and footer, and readable model, usage and errors. Any that hasn't come back by the release gets an explicit decision there. Ctrl+C doesn't exit immediately as Pi's demo does; Esc goes back and stops nothing. | Confirmed |
| `/agents` | Agent and chat navigation | Same, over agents, channels and threads. Helpers appear in a separate work view and never become agents. That view's labels, visibility and cancellation need review. | Keep |
| Model selection | Favorites, no accidental cycling, Enter applies, Ctrl+S saves a default, per-agent thinking | Same gestures. Fix Ctrl+S, which today reaches a workspace Pi setter that Shrimpy's config validation forbids: it sets the current session's model and saves a one-candidate home default. Other sessions and named policies are unchanged. Policies still pick the first available candidate at open; they don't fail over after errors. | Confirmed |
| First setup | Setup makes two agents, `shrimpy` and `mechanic`, and opens a session with the mechanic to finish | Setup makes one agent, named `shrimpy` unless you choose otherwise, and you finish setup by talking to it. It has the admin role by default: the instructions and skills for setting up and repairing a Shrimpy setup, which old Shrimpy gave to the mechanic. No second agent is made by default; you ask for more when you want them. Since 2026-10-05 admin is also a role on the roster that [a few operations take](3-identity.md). Since 2026-10-07 the first agent a roster has is an admin from the moment it joins, and any later one is promoted with `shrimpy members promote`. Every agent is shown the skills for setting up and repairing, so nothing has to move. Every new agent's starter `SOUL.md` says it enjoys the shrimp emoji, as today's `shrimpy` agent does. Where this plan says "the mechanic", it means the agent with the admin role. | Decided in the build, on your leaning of 2026-10-04 |
| Setup and auth | — | Existing files survive; local endpoints, API keys and OAuth work; errors say what to do next; credentials belong to the folder agents are started in, or to a home that keeps its own, as [providers](5-home.md) has it. No credential copying, cache warming or per-request model routing. Signing in is the same command wherever agents run, [sandboxes and other machines](6-network.md) included. | Keep |
| `shrimpy update` | Opens the mechanic TUI with the update skill | A deterministic preview by default. `--guide` runs the update skill in an ordinary thread. Exact tag or SHA apply stays explicit, with approval before consequential changes. The hidden `update check-mechanic` becomes ordinary preflight. | Confirmed |
| Web app | Read-only inspector | A client for talking and watching: browse channels, threads and agents, talk in threads, and open the work behind them. Keeps the inspector views: files, tree, context, channels, triggers, runtime, bounded transcripts, folded output, images, thinking, usage and follow-latest. Pi-backed queries replace JSONL reading. URLs, anchors, pagination and write permissions need review, including loopback, same-origin and CSRF rules once the web app can send input. | Confirmed |

[Command coverage](../history/from-old-shrimpy.md#old-command-families) lists every CLI family and inherited slash command. A command missing upstream isn't removed implicitly.

**Commands**

**What earns a command,** decided on 2026-10-04 after old Shrimpy's rule that every feature is a command had grown it to about 65. Commands operate Shrimpy; clients and tools use it. A command starts, stops, configures, inspects or repairs a program or a home, and `run` and `read` are the shell's client. What happens inside a conversation belongs to the clients and to an agent's tools. A command is never added in the change that adds the feature: it gets a change of its own that names who asked for it, which is you, a skill that tells someone to run it, or a test that can't reach the seam from code.

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
| `agent status`, `agent context`, `agent reload` | `agent status <agent>` | `agent status [--agent <agent>]` |
| `triggers` and its six, and `wake` | `[--agent <agent>]` | As now |

A name with no flag stays where it says something else. In `run <agent> "<text>"` and `threads <member>` it is who you are talking to. In `agent init <agent>`, `agent serve <agent>` and `up [<agent>...]` it is which agent to make or start, and nothing is running yet whose shell the command could be in.

One addition is the coordinator's, and is yours to strike: in your own terminal, when the Shrimpy folder has exactly one agent, a command with no `--agent` acts on that one. The terminal client already takes you to the only agent in the same way. With two or more it says which agents there are and asks for the flag. A command that such a command prints for you to run next always names the agent.

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
| Tab | On an agent's screen, switches between your threads with it and its sessions |
| Ctrl+O | Tool calls in full, and back to brief, wherever work is shown |
| Ctrl+T | Thinking in full, and back to brief |

Ctrl+O for tool output and Ctrl+T for thinking are Pi's keys, and Claude Code has Ctrl+O for the same. Codex opens its whole transcript with Ctrl+T. Two things the coordinator left for later: a screen that lists every key, which waits until there are more keys than fit on the line, and scrolling keys, since what scrolls off stays in the terminal's own scrollback.

**Commands in a thread,** which you asked for on 2026-10-08 and which were built that day: "there should be a tui modal when you type `/` into the input box and you can see what commands there are and a brief explainer".

- **The list.** While what is typed in a thread starts with `/`, the editor lists the commands that can be written there, each with one line on what it does where you are. Typing narrows it, Up and Down choose, Enter acts on the chosen one, Tab only puts it in the input, and Esc closes the list. It is the editor's own list, and its keys do what they do in Pi.
- **A slash always starts a command.** Decided on 2026-10-08: "we should consistently interpret `/` as only a slash command preview, not something someone can input. they can just wrap it in backticks". A text that starts with a slash is never posted as an ordinary message. A name that is no command gets a note that says so and names the commands there are, and the text stays in the input. A message that starts with a slash is written in backticks, or with anything before it. A text that starts with a mention and then a command, as in `@scout /stop`, is posted, and the agent acts on it.
- **Two kinds.** A command for agents is a message: it is posted, the thread keeps it, and each agent it is for acts on it with no model call, so it works from every client. `/stop` and `/model` are these. A command for the terminal is acted on by the terminal and posted nowhere. `/status` is the one.
- **`/status`** shows a block above the input, for you alone, of what was true when you asked. In a DM: the agent, its version and whether it is running, what it is doing in this thread, the inputs that wait, the model, the tokens and the cost of the thread's session, and how many of its other sessions are working. In a room: each agent there, whether it is running and whether it is working in the thread. It goes when you send a message or leave the thread.
- **One place says which commands agents act on:** the chat contract, with the line a client shows for each. The agent's actions are typed by those names.
- **`/model`** is for a quick try of another model in one thread: "just for moments where i want to quickly try a different model in a thread with an agent". It was first the terminal's own, which changed the model behind the thread and posted nothing. You used it that day and found three things wrong, so it is a message now. `/model` and a space lists `default` and the models the agent can use, and Enter posts `/model provider/id`. The agent has the thread's session use that model from its next request, and answers in the thread with one line: which model the thread runs on now, and which it ran on before, or why it can't use that one. It can be the first thing in a new thread: "i'll open a thread with an agent and switch that thread's model to something at the beginning". It lasts until the agent is started again or its default model changes, and `/model default` follows the agent's model again. Bare `/model` is answered by the terminal, in a note, and posts nothing. An agent's default model is not this command's: you tell the agent, and [a reload applies it](5-home.md).
- **In a room `/model` names who it is for,** as in `@scout /model provider/id`, and `@all` changes every agent there. With no mention it is for nobody, and the terminal doesn't post it. You weighed it changing every agent, as `/stop` stops every agent: "if someone has a big room this could get really annoying to revert if you did it accidentally".
- **A thread is not named for a command,** nor for what an agent said about one: the list shows the first thing that was said in it.
- **Still to come:** `/status` as a command that an agent answers, for a chat app with no screen of its own, is in [the conversation model](4-conversation.md): the terminal goes on answering it itself.

**Watching any session from the terminal,** which you asked for on 2026-10-05, ahead of the web client, and which was built that day. The direction already says that opening the terminal, picking an agent and entering any of its sessions is core UX. Until now the terminal listed only your own threads with an agent, so a session behind a room, behind the agent's DM with another member, or a trigger's own couldn't be reached from it.

- An agent's screen lists its sessions, one Tab from your threads with it: every one it has, wherever it is. Each says where it is and whether it is working: your DM with it, a room and its thread, its DM with another member, or a trigger's own.
- Entering one shows the session as the agent sees it, live: what it was shown, its thinking in brief, what it wrote, and each tool call. It is for watching only. There is no input and no stop, as you decided, and Esc goes back.
- Ctrl+O shows tool calls in full, the whole call and what it printed, and puts them back in brief. Ctrl+T does the same for thinking. Both work wherever work is shown, your own DM thread included.
- The agent says where each session is. The terminal can't ask chat, which tells nobody about a channel they aren't in, and you aren't in an agent's DM with another agent. So a session's summary in the agent's contract carries the place as facts: a DM and with whom, a room and its name, the thread's name, or a trigger's name. `shrimpy sessions list` prints the same.
- A watch shows the newest 200 items of a session and says how many came before. In full, a call, what a tool printed, thinking or an answer shows up to 100,000 characters. The sessions are listed in the agent's own order, so a row keeps its place while it works.
- Watching takes what `sessions read` takes: you, or an admin. Watching scout's session behind its DM with another agent shows you that DM as scout was shown it.

Inherited terminal commands each need a disposition:

- **Keep the intent:** `/settings /model /thinking /copy /name /session /changelog /hotkeys /login /logout /compact /reload /quit`, plus Shrimpy's `/agents /status /shrimpy`. Help, status and changelog stay presentation-only; default saving, reload and quit follow the decisions above.
- **Keep the capability with a reviewed durable UX:** `/tree /fork /clone /new /resume`, using threads and Pi's real session, fork and context semantics. `/new` starts a thread, or resets the session in a chat app without threads. A reset isn't presented as archive and restore.
- **Drop old-format `/import`** (pending review). `/export` stays as a readable export of current history, without promising Pi JSONL compatibility.
- **Review `/trust`** against deliberate home resources; ambient project instructions stay off. `/share` and `/scoped-models` stay hidden as today.
- **Keep** `/skill:name` and prompt-template expansion, the `!` and `!!` distinction, command completion and existing input shortcuts. The new work view is a reviewed addition.

**Open**

What daily use asks for is under Not built yet below.

**Not built yet**

*Using it: what daily use asks for.*

Under Later in the [order of work](../PLAN.md#order-of-work).

**Use it.** After the wire-up, try it from the command line. After the terminal client, use it for real conversations. Neither waits for the pieces that cross machines. What's rough goes on the list of what daily use asks for.

**Move in.** Create homes for your dev agents, and let each bring over what it wants from the old workspace. Shrimpy converts nothing, and the old workspace stays untouched until you remove it. From here the new Shrimpy is in daily use.

**From living with it.** You moved in on 2026-10-07. What you notice goes here as you say it, in your words where they help, and leaves when it is built or dropped. A thing that needs a decision of yours is on [your list](../AUTHOR-TO-REVIEW.md) instead.

- Your name where an account made for Shrimpy runs the gateway. On your list.
- Updating Shrimpy. "updating shrimpy will be something we want to have a good ux on, especially for people with multi-machine setups", 2026-10-08. Nothing is built: today it is new files in the checkout and a restart of the service on each machine, by hand, and programs on different machines can run different versions in between.
- A setup command, and moving over from old Shrimpy. Neither is built, and you asked on 2026-10-08 that they be tracked with updating. Today a new setup is three commands, which the setup skill gives, and [the plan](../PLAN.md) has what moving over is meant to be.
- Shell completion for the new commands. Old Shrimpy's is set aside with it, and a line in the shell's startup file still looks for it.

**Outcome:** the rough edges you found by using it are gone.

This phase has no fixed scope. Its list comes from use, and its order is yours. The known candidates:

- Thread and session operations: reset, archive, resume, fork, names, search, read and export.
- Chat commands in a thread: `/new`, `/status` and `/help`, for a chat app with no screen of its own. `/stop` is built, and the terminal answers `/status` itself.
- Reactions, edits and deletes in threads. The chat server has them. The clients need keys for them, and agents need tools: the [message tools](4-conversation.md) row names `react` and an `edit` option on `send_message`, and doesn't yet say how an agent deletes a message of its own.
- Model selection, defaults, settings, setup and sign-in, including OAuth; status and help come from the service. You said on 2026-10-06 that this is a priority before the release: signing in to a provider's subscription made simple, with Pi's own flows; and choosing the model of a thread, or the one an agent starts with, from the terminal. Signing in was decided and built the same day: once for each folder agents are started in, with `shrimpy providers login`, as [providers](5-home.md) has it. Choosing a model from the terminal is still to come.
- Your own settings as a person, starting with the name you appear under. Today it is your OS user's name.
- Attachments on messages, including clipboard files and images. An image reaches the model with its message.
- The search tools and a tool that shows the model an image file.
- Memory breadcrumbs, with the search index behind them and the `memory-management` skill.
- Terminal affordances from today's client, listed under [terminal, models and settings](using-it.md).
- A web client for talking and watching: channels, threads, agents and sessions, with history, live view and input, alongside the inspector views. Since 2026-10-08 it is how your phone reaches Shrimpy, as [the plan's direction](../PLAN.md#direction) has it, so it is built for a phone first: installed to the home screen, with a push notification when an agent answers or writes while you are away. Three things follow for how it is built, so that a companion app can wrap it later: every screen works with no browser bar around it, a phone comes in as a machine of your own does, with an invitation, and what sends a notification doesn't know whether a browser or an app receives it. Installing and push need HTTPS, which on a tailnet is a certificate for the machine's name there: how the gateway gets one is to settle.

**Prove,** for whatever gets built:

- Keyboard, editor, file, image and shell interactions.
- Agent navigation, preflight failure and several clients. A failed switch restores the previous view and draft.
- Web queries and subscriptions, new IDs and anchors, and large transcripts. The web client uses the same operations as the terminal.
- Presentation content never reaches provider input.

**Rule:** an affordance today's Shrimpy has comes back when it's missed. Whatever hasn't come back by the release gets an explicit decision there, with every inherited command's disposition in [command coverage](using-it.md), so nothing is dropped silently.

**Replaces:** private TUI patches, the old transcript readers and duplicated settings and lifecycle bindings.
