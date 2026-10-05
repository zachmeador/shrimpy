# 🦐 Using it

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

This is the terminal, the web client, the commands, setup and sign-in. It is tuned through use.

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Closing a client | The interactive session disposes its runtime on exit | The client detaches and accepted work keeps running. Quitting while the agent is busy prints one line saying the work continues and how to stop it. Reopening shows committed state, and threads and sessions mark replies and work that arrived while you were away. | Confirmed |
| Bare `shrimpy` | Most recent interactive agent and its main chat | Opens your most recent thread with the most recently used agent, and starts that agent's service on demand if installed. Startup failure is explicit and keeps the editor draft. Workspace-wide gateway controls become per-agent controls. | Confirmed |
| Where a setup lives | A pointer file in your home names a workspace, `~/.shrimpy` by default | One folder, `~/shrimpy` unless `SHRIMPY_DIR` names another: `agents/<name>/` for homes, with the gateway's and the chat server's data beside them. Where a command takes an agent, a bare word means the home of that name there, and `shrimpy up` with no arguments starts every agent in it. A path still works. A folder that holds other files and no `agents/` is taken to be someone else's and is left alone, and dot files don't count. Old Shrimpy's `~/.shrimpy` is never read or written. | Confirmed |
| Several clients | A second terminal fails because the first owns the transcript | Clients share the agent's process and Pi orders the input. The UI shows the selected agent, thread and incoming messages. Switching views mid-turn is immediate; the previous thread's work keeps running and stays easy to find. Esc from any client stops the session for everyone. What you type in any client posts to the thread, so every client of the channel sees it. | Confirmed |
| Terminal and web clients | Terminal only; the web app is a read-only inspector | Both talk in threads and open the sessions behind them, locally or through the gateway. Opening a view never creates an execution owner. Offline agents, lost routes and rejected input show explicitly. Navigation, controls and permissions still need review. | Confirmed |
| `shrimpy run` | Ephemeral; prints intermediate and final assistant text | Posts to a thread, a new one in your DM with the agent unless one is selected, and prints the final settled answer. Scripts that parse today's output or exit codes need updating. | Confirmed |
| Terminal affordances | Pi's `InteractiveMode` plus Shrimpy patches | The terminal client starts thin: talk in threads, watch the work behind them and stop it. Today's affordances come back as daily use asks for them: regular and fullscreen modes, editor history and multiline input, draft recovery, file completion, clipboard text and images, external editor, copy and suspend keys, `!` and `!!`, editing a message the agent hasn't picked up yet, tool-output expansion, hidden turn context, title, header and footer, and readable model, usage and errors. Any that hasn't come back by the release gets an explicit decision there. Ctrl+C doesn't exit immediately as Pi's demo does; Esc follows the stop decision. | Confirmed |
| `/agents` | Agent and chat navigation | Same, over agents, channels and threads. Helpers appear in a separate work view and never become agents. That view's labels, visibility and cancellation need review. | Keep |
| Model selection | Favorites, no accidental cycling, Enter applies, Ctrl+S saves a default, per-agent thinking | Same gestures. Fix Ctrl+S, which today reaches a workspace Pi setter that Shrimpy's config validation forbids: it sets the current session's model and saves a one-candidate home default. Other sessions and named policies are unchanged. Policies still pick the first available candidate at open; they don't fail over after errors. | Confirmed |
| First setup | Setup makes two agents, `shrimpy` and `mechanic`, and opens a session with the mechanic to finish | Setup makes one agent, named `shrimpy` unless you choose otherwise, and you finish setup by talking to it. It has the admin role by default: the instructions and skills for setting up and repairing a Shrimpy setup, which old Shrimpy gave to the mechanic. No second agent is made by default; you ask for more when you want them. Since 2026-10-05 admin is also a role on the roster that [a few operations take](3-identity.md). Nothing makes the first agent an admin yet, so a person promotes it with `shrimpy members promote`. Every agent is shown the skills for setting up and repairing, so nothing has to move. Every new agent's starter `SOUL.md` says it enjoys the shrimp emoji, as today's `shrimpy` agent does. Where this plan says "the mechanic", it means the agent with the admin role. | Decided in the build, on your leaning of 2026-10-04 |
| Setup and auth | — | Existing files survive; local endpoints, API keys and OAuth work; errors say what to do next; credentials belong to the home. No credential copying, cache warming or per-request model routing. Login works the same for [sandboxed and remote agents](6-network.md). | Keep |
| `shrimpy update` | Opens the mechanic TUI with the update skill | A deterministic preview by default. `--guide` runs the update skill in an ordinary thread. Exact tag or SHA apply stays explicit, with approval before consequential changes. The hidden `update check-mechanic` becomes ordinary preflight. | Confirmed |
| Web app | Read-only inspector | A client for talking and watching: browse channels, threads and agents, talk in threads, and open the work behind them. Keeps the inspector views: files, tree, context, channels, triggers, runtime, bounded transcripts, folded output, images, thinking, usage and follow-latest. Pi-backed queries replace JSONL reading. URLs, anchors, pagination and write permissions need review, including loopback, same-origin and CSRF rules once the web app can send input. | Confirmed |

[Command coverage](../history/from-old-shrimpy.md#old-command-families) lists every CLI family and inherited slash command. A command missing upstream isn't removed implicitly.

**Commands**

**What earns a command,** decided on 2026-10-04 after old Shrimpy's rule that every feature is a command had grown it to about 65. Commands operate Shrimpy; clients and tools use it. A command starts, stops, configures, inspects or repairs a program or a home, and `run` and `read` are the shell's client. What happens inside a conversation belongs to the clients and to an agent's tools. A command is never added in the change that adds the feature: it gets a change of its own that names who asked for it, which is you, a skill that tells someone to run it, or a test that can't reach the seam from code.

| Current family | Outcome in the replacement |
|---|---|
| — | Rooms are new. Confirmed on 2026-10-04: `shrimpy rooms` lists the rooms you are in, `rooms new <name> [<member>...]` makes one, and `rooms add <room> <member>...` adds members. You asked for them so that making a room is something you ask an agent to do: an agent runs them from its shell as itself. Leaving and removing wait until someone needs them. |
| Watches: list, add, enable, disable, show, history, run | Renamed to `shrimpy triggers` with no `watches` alias. Per-home trigger policy and durable occurrence observation. Agents are who will use these most, so on 2026-10-04 you asked for a command path that feels intuitive and checks what it is given: a small local model that gets a schedule wrong is told so at once, where a hand-edited file would only be checked at reload. Confirmed on 2026-10-04: `shrimpy triggers` lists them with the next run and the last outcome, `add` makes or replaces one, `show` prints one with its recent occurrences, `run` fires one now, `on` and `off` enable and disable, and `remove` deletes one. They act on the agent whose shell they run in and take `--agent <name>` elsewhere. A trigger that fires once is not among them: it is the tool `check_back`. |

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

**Outcome:** the rough edges you found by using it are gone.

This phase has no fixed scope. Its list comes from use, and its order is yours. The known candidates:

- Thread and session operations: reset, archive, resume, fork, names, search, read and export.
- Chat commands in a thread: `/new`, `/stop`, `/status` and `/help`.
- Reactions, edits and deletes in threads. The chat server has them. The clients need keys for them, and agents need tools: the [message tools](4-conversation.md) row names `react` and an `edit` option on `send_message`, and doesn't yet say how an agent deletes a message of its own.
- Model selection, defaults, settings, setup and sign-in, including OAuth; status and help come from the service.
- Your own settings as a person, starting with the name you appear under. Today it is your OS user's name.
- Attachments on messages, including clipboard files and images. An image reaches the model with its message.
- The search tools and a tool that shows the model an image file.
- Memory breadcrumbs, with the search index behind them and the `memory-management` skill.
- Terminal affordances from today's client, listed under [terminal, models and settings](using-it.md).
- A web client for talking and watching: channels, threads, agents and sessions, with history, live view and input, alongside the inspector views.

**Prove,** for whatever gets built:

- Keyboard, editor, file, image and shell interactions.
- Agent navigation, preflight failure and several clients. A failed switch restores the previous view and draft.
- Web queries and subscriptions, new IDs and anchors, and large transcripts. The web client uses the same operations as the terminal.
- Presentation content never reaches provider input.

**Rule:** an affordance today's Shrimpy has comes back when it's missed. Whatever hasn't come back by the release gets an explicit decision there, with every inherited command's disposition in [command coverage](using-it.md), so nothing is dropped silently.

**Replaces:** private TUI patches, the old transcript readers and duplicated settings and lifecycle bindings.
