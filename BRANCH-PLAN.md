# 🦐 Shrimpy 3.0 Harness Plan

Simplifies Shrimpy's agent model around **threads = sessions** and **8 clean tools**, cutting out parallel subsystems (`ask_agent`, `check_back`, threadless trigger sessions, and planned `helpers`), and surfaces async work (background commands, pending agent replies, and triggers) in both clients.

This branch makes a clean **3.0** cut across the `Agent`, `Session`, and `Chat` contracts rather than carrying 2.x compatibility shims for removed concepts.

---

## Core Model

1. **Every session sits behind one real thread.**
   No threadless sessions (`trigger:<name>`, `channelId: null`). Every conversation — human DM, room, agent-to-agent DM, and recurring trigger work — is a normal thread in an existing `dm` or `room` channel. Chat keeps only `dm` and `room`.
2. **No subagents, no sub-sessions, no helpers.**
   There are just agents and threads (= sessions).
   - Dedicated recurring work gets a normal thread in your DM with the agent.
   - Heavy isolated or long-running worker tasks (coding with `agy`, `pi`, `claude`, `codex`, or long downloads) run through **background `bash`**, not a separate subagent subsystem.
   - Cross-agent delegation (e.g. `shrimpy` asking `@game` on the Steam Deck, or telling `@crab` and other agents to update) uses normal agent-to-agent DM threads, with the calling session woken when the other agent settles.
   - When the user no longer needs a thread, the agent archives it. Archiving a watched agent-to-agent thread also drops any open watch on it. Archived threads and non-message wake lines never count as unread.
3. **One tool per job — 8 tools total** (same count as 2.0, zero overlap):
   - Pi's file tools: `read`, `write`, `edit`
   - Shell & background commands: `bash`, `process`
   - Chat & threads: `post`, `thread`
   - Time, schedules & checks: `trigger`
4. **`/stop` means one thing.**
   `/stop` stops only the running LLM turn in that thread (and in read-only agent-to-agent DMs, the web client provides a `stop` button calling `Session.stop` while the terminal shows the `shrimpy sessions stop` command). Background processes and triggers have their own controls (`/kill`, `/cancel`, `/pause`, `/resume` in threads, plus UI buttons).

---

## Five Mock Agent Sessions

These five everyday workflows define the minimal tool surface and UX:

### 1. Download a file
> **User:** *"hey agent can you download this thing? lmk when it's done"*

- **Turn 1:**
  - `bash({ command: "curl -fLo ~/downloads/thing.tar https://...", background: true })` → `proc_1 started`
  - **Reply:** *"Downloading `thing.tar` in the background — I'll let you know when it finishes."*
  - *(UI shows `$ curl -fLo … · running` in this thread. Mid-download, the user can ask "how's it going?" or "cancel it", and the agent calls `process({ action: "read", id: "proc_1" })` or `process({ action: "kill", id: "proc_1" })`.)*
- **Wakeup:** Process-exit wake line lands in the thread (`$ curl -fLo … exited 0 after 11m`, expandable to output tail); session wakes with exit code + output tail.
- **Turn 2:**
  - **Reply:** *"Done — saved to `~/downloads/thing.tar` (14.2 GB)."*

### 2. Message `@game` on Steam Deck to fetch ROMs
> **User:** *"hey agent message the `game` agent (running on my steam deck) and fetch the latest roms from my file server. lmk when it's done"*

- **Turn 1:**
  - `post({ to: "@game", text: "Fetch the latest ROMs from the file server and report what was synced." })` → `Posted to new thread th_abc123. Watching for @game's reply.`
  - **Reply:** *"Asked `@game` to sync the latest ROMs — I'll let you know when it finishes."*
  - *(UI shows `Waiting on @game` in this thread, clickable to jump to `th_abc123` under `observe`, where a reverse bar says `shrimpy waits on this from …`.)*
- **Wakeup:** Agent-answer wake line lands in the thread (`game answered · 10:09`, clickable to `th_abc123`); session wakes with `@game`'s reply.
- **Turn 2:**
  - `thread({ action: "archive", thread: "th_abc123" })`
  - **Reply:** *"`@game` finished — synced 12 new ROMs (4.8 GB) to `~/roms`."*
  - *(If `@game` instead replied with a question, the agent wakes here, asks you if needed, and follows up with `post({ to: "th_abc123", text: "…" })`, which re-watches automatically.)*

### 3. Have `agy` build a spec, then review its work
> **User:** *"hey agent please build (some spec doc i send), have an `agy` coding agent build this. review its work and lmk when it's done"*

- **Turn 1:**
  - `write({ path: "projects/foo/SPEC.md", content: "…" })`
  - `bash({ command: "cd projects/foo && agy …", background: true })` → `proc_2 started`
  - **Reply:** *"Saved the spec and kicked off `agy`. I'll review the work once it finishes."*
  - *(UI shows `$ cd projects/foo && agy … · running` in this thread.)*
- **Wakeup:** Process-exit wake line lands in the thread; session wakes with exit code + output tail.
- **Turn 2:**
  - `bash({ command: "cd projects/foo && git diff && npm test" })` *(sync)* + `read(…)`
  - *(If fixes are needed, kicks off another `agy` run via `bash(..., background: true)` and waits again.)*
  - **Reply:** *"`agy` finished and I reviewed the diff — tests pass. Summary of changes: …"*

### 4. Daily 8am research task in this thread
> **User:** *"hey agent every day at 8am in this thread do *some research task*, add what you find to your md docs, and message me a summary"*

- **Turn 1:**
  - `trigger({ action: "add", name: "daily-research", cron: "0 8 * * *", prompt: "Do <research task>, update vault/research.md, and summarize." })` *(defaults to this thread)*
  - **Reply:** *"Scheduled `daily-research` for 8am daily in this thread."*
  - *(Variant for a dedicated fresh thread: `thread({ action: "create", to: "@zach", name: "Daily research" })` → `th_new456`, then pass `thread: "th_new456"` to `trigger`.)*
- **Wakeup (08:00 next day):** Trigger-fired line appears in the thread (does not count as unread); session wakes with the prompt.
- **Turn 2:**
  - Runs research (`bash` / tools), updates docs with `edit` / `write`.
  - **Reply:** *"Nov 27 summary: …"* *(normal reply posts straight into this thread — no `post` call needed.)*

### 5. Admin agent tells all remote agents to update
> **User:** *"hey shrimpy admin agent, tell the other agents on other machines to update. lmk when it's done"*

- **Turn 1:**
  - `bash({ command: "shrimpy status" })` *(sync — sees `@crab` on `cashmoney`, `@game` on `steamdeck`)*
  - `post({ to: "@crab", text: "Update Shrimpy to the latest release and report when back up." })` → `th_upd1`
  - `post({ to: "@game", text: "Update Shrimpy to the latest release and report when back up." })` → `th_upd2`
  - **Reply:** *"Asked `@crab` and `@game` to update — I'll report back once both finish."*
  - *(UI shows `Waiting on @crab, @game` in this thread, noting `not running` if an agent is offline.)*
- **Wakeup 1:** `@crab` answer wake line lands in the thread; input says `@crab answered in th_upd1: Updated to 3.0.0.` / `Still waiting on: @game (th_upd2).`
- **Turn 2:**
  - `thread({ action: "archive", thread: "th_upd1" })`
  - **Reply:** `END` *(stays quiet until `@game` is done too.)*
- **Wakeup 2:** `@game` answer wake line lands; no remaining watches.
- **Turn 3:**
  - `thread({ action: "archive", thread: "th_upd2" })`
  - **Reply:** *"Both updated — `@crab` and `@game` are on 3.0.0."*

---

## UX & UI Changes (Aligned with Mockups)

Both mockups ([web-client-mockup.html](docs/web-client-mockup.html) and [terminal-mockup.html](docs/terminal-mockup.html)) and both clients (`src/clients/`) share the same three levels:

### Level 1 — Agents & Rooms sidebar (`src/clients/view/agents.ts`)
- **One lantern for whatever runs:** Lit while a turn OR a background `bash` command runs (on agents, threads, rooms, and the tide), showing `working`.
- **Plain words for waiting:** An agent that only waits on another agent has no lantern and says `waiting on game` / `waiting on 2 agents` where it would say `idle`. It says `idle` only when nothing runs and it waits on no one.
- **Unread counts:** Archived threads and non-message wake lines contribute `0` unread everywhere (thread row, agent row, and phone push badge).

### Level 2 — Agent's Thread List (`chat` & `observe` tabs, `src/clients/view/list.ts`)
- **Every row is a thread:** `part.kind === "session"` (`trigger:<name>`) is gone.
- **`chat` tab:** Holds all DM threads with the agent, including named threads created for recurring triggers. Archived threads fold into `archived · N` at the bottom with `0` unread.
- **`observe` tab:** Holds agent-to-agent DM threads (e.g. `shrimpy ↔ game`) and room threads.
- **Thread row indicator:** Lights the lantern when a turn or background process runs in the thread; appends `waiting on …` in the subtitle when waiting on other agents.

### Level 3a — Agent Page (`src/clients/view/page.ts`)
Shown where a thread would be when an agent is selected and no thread is open.
- **State fact:** Shows active work (`working · #ops and your DM`) and any pending watches underneath.
- **Processes section** *(shown only while any background processes are running)*: Lists active background `bash` commands above triggers with elapsed time, process ID, clickable link to the originating thread, output tail toggle (web) / `Ctrl+O` (terminal), and `kill` button (web).
- **Triggers section** *(unified)*:
  - **Standing triggers** (`triggers/<name>.md` front matter + prompt, next run, last outcome, clickable target thread or breadcrumb note link, plus `run now` and `on/off` switch on web).
  - **One-shot triggers** (`once` block underneath with due time, prompt, clickable target thread link, and `cancel` button on web).
- **Home file tree:** Continues hiding `triggers/`, `agent.json`, and `state/`.

### Level 3b — Open Thread View (`src/clients/view/thread.ts`)
- **Single "still going" block above the input** *(replaces the old `check_back`-only `waiting` lines)*:
  1. **Running processes:** `$ command · running 12m`, expanding in place (click on web, `Ctrl+O` on terminal) to show recent stdout/stderr tail + `kill` (web) / `/kill` (terminal). *(Web polish note: avoid repeating the `$ command` line twice when expanded.)*
  2. **Waiting on other agents:** `waiting on @game 2m · @crab 2m · not running` — clicking a name jumps to that agent-to-agent DM thread in `observe`. Include a way to dismiss a stuck watch on an offline agent (archiving the DM thread drops it too).
  3. **Upcoming triggers on this thread:** one-shot (`once at 17:00 · …` with `cancel` / `/cancel`) and standing (`trigger nightly · next 03:00` with `pause`/`resume` or `/pause`/`/resume`); multiple collapse behind an expandable count.
  4. **Reverse watch bar on watched agent-to-agent DMs:** Shows `shrimpy waits on this from your DM · update the other machines`, clickable back to the calling thread.
- **Read-only agent-to-agent DMs:** While an agent is working in a read-only DM, web shows a `stop` button (calling `Session.stop`), and terminal shows `To stop it, run: shrimpy sessions stop <thread> --agent <name>`. Agent's View defaults to the remote agent's session (and notes that the asking agent has no session behind that thread).
- **Inline wake lines in the message stream:**
  Every non-message wakeup leaves a compact line (never counted as unread; consecutive wake lines stack tightly like a log):
  - **Trigger fired** (recurring or one-shot): `trigger nightly fired · 03:00` (expandable to prompt or check output).
  - **Process ended / killed / check-in:** `$ curl … exited 0 after 6m · 13:08` (expandable to output tail).
  - **Watched agent settled:** `game answered · 10:09 [Fetch the latest ROMs…]` (clickable to jump to `game`'s thread; also covers stopped/failed/silent).
- **Slash commands in threads:**
  - `/stop` stops only the current turn and prints a one-time notice naming anything still going (processes, watches, triggers).
  - `/kill`, `/cancel`, `/pause`, `/resume` act on processes and triggers in this thread and appear in `/` autocomplete only while the thread has something for them. `/kill` posts a `killed` wake line and wakes the agent; `/cancel`, `/pause`, and `/resume` leave no line and do not wake the agent.
- **Agent's View (`src/clients/view/work.ts`):**
  Renders calls to the 8 tools (`read`, `write`, `edit`, `bash` with `background` marker, `process`, `post`, `thread`, `trigger`) and the wakeup inputs.

---

## Minimal Tool Surface (8 Tools)

| Tool | Source | Parameters & Behavior |
|---|---|---|
| `read`, `write`, `edit` | Pi (`@earendil-works/pi-durable`) | Unchanged stock file tools (installed individually instead of bundled `CodingTools`). |
| `bash` | Shrimpy (`src/agent/processes/`) | `{ command, background? }`. Default (`background: false`) waits up to a built-in 60s; if still running, auto-backgrounds and returns the process ID + output so far in the current turn. `background: true` backgrounds immediately. Detached in its own process group (`shellWithShrimpy` env, output spilled to `state/processes/`). Wakes this session on exit with exit code, duration, and output tail, plus one built-in safety check-in (15m) with the latest output tail if still running so hung commands don't sit silently forever. |
| `process` | Shrimpy (`src/agent/processes/`) | `{ action: "list" \| "read" \| "input" \| "kill", id?, lines?, text? }`. Inspect running background commands, tail output, write to stdin, or kill the process group. |
| `post` | Shrimpy (`src/agent/chat-tools/`) | `{ text, to?, quiet? }`. Omit `to` for a mid-turn update here; `@name` starts a DM thread; `th_...`, `@name/<thread>`, `#room`, or `#room/<thread>` posts to an existing thread. Posting to another agent's DM automatically watches until that agent settles and wakes this session with the result (plus any other still-pending watched threads). Posting to a person or room sets no watch. |
| `thread` | Shrimpy (`src/agent/chat-tools/`) | `{ action: "list" \| "read" \| "create" \| "rename" \| "archive", to?, thread?, name?, archived?, limit?, before? }`. List threads for `@name`/`#room`, read messages, create an empty named thread without a dummy message, rename, or archive/unarchive. |
| `trigger` | Shrimpy (`src/agent/triggers/`) | `{ action: "add" \| "list" \| "pause" \| "resume" \| "remove", name?, in?, at?, every?, cron?, timezone?, prompt?, thread?, check?, when?, then? }`. One tool for one-shot (`in`/`at`) and recurring (`every`/`cron`, optional `check`), defaulting `thread` to the current thread. |

---

## Technical Plan by Area

### 1. Contracts & Chat (`src/contracts/`, `src/chat/`)
- **Chat unread fix (`src/chat/store/marks.ts`):** Exclude both archived threads (`t.archived = 0`) and non-message wake lines from `unreadIn`, `unreadInChannel`, and `unreadInAll`. (Unarchiving on a new post already works in `src/chat/store/messages.ts`.)
- **Chat wake lines (`src/contracts/chat/`, `src/chat/`):**
  - Bump `Chat` / `Thread` contract versions for 3.0; migrate `chat.sqlite` forward via `src/lib/migration/`.
  - Generalize `triggerFired` / `Message.trigger` / `trigger_lines` to **wake lines** covering:
    - `trigger`: standing or one-shot trigger fired (`name` or `once`, `firedAt`, `prompt`, `output`).
    - `process`: background command `exited` / `killed` / `checkin` / `interrupted` (`id`, `command`, `code`, `after`, `output`).
    - `answer`: watched agent `answered` / `stopped` / `failed` / `silent` (`from`, `thread`, `how`).
  - Keep `createThread`, `post`, `read`, `rename`, `archive`, `pin`, `leaveReceipt` as-is.
- **Agent & Session contracts (`src/contracts/agent/`):**
  - Bump `Agent` and `Session` contract versions for 3.0; drop 2.x `evolve` mappings.
  - Make `SessionSummary.threadId` and `SessionSummary.channelId` non-null `str()`; remove `kind: "trigger"` from `SessionPlace`.
  - Unify `Agent.triggers` + `SessionStatus.wakeups` into `Agent.triggers` (both standing and one-shot triggers, with `thread: str() | null` where `null` is only `then: note` breadcrumb checks) and `SessionStatus.triggers` (upcoming triggers on that thread, replacing `wakeups`). Drop `TriggerDetail.session`.
  - Expose live **`processes`** (`id`, `threadId`, `command`, `startedAt`) and **`watches`** (`id`, `fromThread`, `onAgent`, `toThread`, `startedAt`) on **`Agent` state** (so sidebar, thread list rows, agent page, and reverse watch bars on read-only DMs all have them without opening every session), plus per-thread slices on `SessionStatus`.
  - Add `Agent` methods: `processOutput(id)`, `killProcess(id)`, `cancelTrigger(id)` (one-shot triggers), and `cancelWatch(id)` (dismiss a stuck watch on an offline agent), alongside existing `switchTrigger` and `fire`.

### 2. Agent Program (`src/agent/`)
- **Links (`src/agent/links/chat.ts`):** Add `archive`, `rename`, and the generalized wake-line post wrapper on `ChatCalls`.
- **Inputs (`src/agent/inputs/`):**
  - Merge `WakeupInput` into `OccurrenceInput` (one trigger input type for both one-shot and recurring); replace `QuestionInput` with `WatchInput` (carrying `pending` list for fan-out); add `ProcessInput` (process exit with code/signal/duration/output tail/log path, killed by user, built-in 15m `still_running` hang check-in, or `interrupted` after restart).
  - Remove `NoThread` union branches — every running session input has a `threadId` and `channelId`.
- **Processes (`src/agent/processes/`):**
  - Unbundle `CodingTools` in `src/agent/host/host.durable.ts`: register Pi's `createReadTool`, `createWriteTool`, `createEditTool` + Shrimpy's `bash` and `process`.
  - Persist active process metadata in `ProcessesDoc` so restarts detect dead processes and post/wake the owning session once with `interrupted`.
  - Buffer output in memory + spill file under `state/processes/<id>.log` with cleanup of old logs.
  - On exit, `killProcess`, or 15m check-in, post the process wake line to chat and wake the owning session via `takeUp`.
- **Watches (`src/agent/watches/`, replacing `src/agent/questions/`):**
  - Reuse receipt matching and feed cursor coordination from `src/agent/chat/questions.ts` and `src/agent/chat/feed.ts`.
  - Support watching both newly started DM threads and follow-up posts into existing agent DM threads, with no forced timeout.
  - On settlement (`answered`, `silent`, `failed`, `stopped`), post the `answer` wake line in the calling thread and wake the calling session.
  - Archiving a watched agent-to-agent thread (or calling `Agent.cancelWatch`) drops the open watch cleanly.
  - Remove `ask_agent` tool and `QuestionsDoc` (migrating/replacing with `WatchesDoc`).
- **Chat tools (`src/agent/chat-tools/`, replacing `src/agent/message-tools/`):**
  - Implement `post` and `thread` (`list`, `read`, `create`, `rename`, `archive`).
  - Extend `placeOf` to resolve bare `th_...` thread IDs directly in addition to `@name`, `@name/<thread>`, `#room`, and `#room/<thread>`.
- **Triggers (`src/agent/triggers/`, absorbing `src/agent/wakeups/`):**
  - Implement `trigger` tool (`add`, `list`, `pause`, `resume`, `remove`).
  - One-shot triggers (`in`/`at`) use durable timer tasks (posting a trigger-fired wake line to the thread when due and waking the session; `cancelTrigger` cancels silently).
  - Recurring triggers (`every`/`cron`, optional `check`) manage `triggers/<name>.md` via `src/contracts/agent/trigger-files.node.ts` and trigger an immediate home reload. `parseTrigger` strictly requires `thread:` on every waking trigger (only `then: note` breadcrumb-only checks have none); any legacy file missing `thread:` is reported in `leftOut` until given one.
  - Remove `check_back` tool (`src/agent/wakeups/`) and threadless waking sessions (`trigger:<name>`).
- **Stopping (`src/agent/sessions/service.durable.ts`):**
  - `/stop` stops only the session's active turn and queued unhanded inputs — does not kill background `processes`, cancel `triggers`, or drop `watches`.
- **Storage & boundaries:**
  - Bump `AGENT_STORAGE` (`1` → `2`) in `src/agent/host/storage.ts` with clean forward migration.
  - Update `AGENT_TIERS` in `lint/boundaries.js`:
    `inputs, home, access` → `links, host, records` → `turns` → `watches` → `processes, triggers, chat` → `sessions, chat-tools, context`.

### 3. Clients, CLI, Instructions, Skills & Docs
- **Clients (`src/clients/state/`, `src/clients/view/`, `src/clients/web/`, `src/clients/console/`):**
  - Build to the updated mockups: unified `.still` dock, inline wake lines, `processes` + `triggers` + `once` on the Agent Page, bidirectional watch jumps, read-only `stop` button (web) / hint (terminal), and `/kill`, `/cancel`, `/pause`, `/resume`.
  - Delete all `threadId === null` / threadless-session code paths.
- **CLI (`src/cli/`):**
  - Update `shrimpy sessions` (every session is a thread), `shrimpy triggers` (supporting unified one-shot + recurring display, no threadless `trigger:<name>` sessions), and `src/cli/contracts.test.ts` + `src/contracts/released.json` at release.
- **Base instructions (`src/agent/context/base.ts`):**
  - Rewrite concisely for the 8 tools, deleting `ask_agent`, `check_back`, threadless-trigger, and "DM thread you don't remember" wording.
- **Skills (`skills/`):**
  - Update `shrimpy-chat`, `shrimpy-triggers`, and `shrimpy-update`, including guidance to archive finished threads the user doesn't need.
- **Docs:**
  - Update `docs/open.md` (remove `helpers` and the `ask_agent`/`send_message` gap), `docs/how-it-is-built.md`, `README.md` (`npm run readme`), `CHANGELOG.md`, and re-shoot mockup assets (`node docs/assets/shoot.ts`) once mockups settle.
- **Verification:** `npm run check` (typecheck, boundary lint, full test suite including `instructions.test.ts` and `contracts.test.ts`).
