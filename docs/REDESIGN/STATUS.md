# 🦐 Redesign Status

Progress on the [replacement plan](PLAN.md): where the code trails the plan, then what each merge and review settled.

Record review decisions, finished phases, commands and results, and blockers here. A phase is done when its Prove list has evidence from real candidate wiring, not equivalent mocks; a passing build or deleted files don't count. A newly found experience difference stays pending until reviewed.

## Where the code trails the plan

As of 2026-10-04. Before each review pause, everything under "still open" is fixed or raised with the user.

**Still open in phase 1**

- Bare `shrimpy` opens the list of agents, or your threads with the only agent. It doesn't remember your latest thread, start programs on demand, or mark what arrived while you were away.
- The terminal lists your threads with an agent, not the agent's sessions, so a session that isn't behind one of your threads can't be reached from it.
- A terminal started with no gateway can't reach a running agent, and an agent that isn't running isn't listed.
- The terminal polls the gateway's list and your thread lists every two seconds, because the contracts have no subscription for them. The agent's client has no detach and takes no abort signal, and a hung connection is only noticed when something is sent.
- `pi-tui`'s regular mode clears the terminal's scrollback on some repaints, which the old terminal didn't do. The terminal can't scroll back past the newest 200 messages of a thread.
- Joining from another machine, which waits for a VM on the LAN to test on.
- A turn that was resumed and crashed twice isn't stopped and marked failed yet.
- Commands that go through the gateway warn about a version mismatch. Programs don't compare versions when they connect, and `sessions` and `agent status` don't check.
- `--no-wait` prints the IDs to follow up with, but no command waits on one.
- `run` prints only the first part of an answer posted in parts, and can't follow a message once 200 newer ones are in its thread.
- Clients see Chord's and `pi-client`'s error types and codes, though contracts are meant to carry only Shrimpy's shapes. The check for a refusal lives in `agent/links/` and belongs in `lib/refusal`.
- Small duplicates: a pause helper in `agent/intake/` and in `lib/retry`, two stand-ins for an agent's side of chat, in `cli/testing/` and `contracts/chat/testing/`, and two fake terminals, in `cli/testing/` and the console's `draw/testing/`.

**The flip, waiting on two merges**

- `next/` moves to the repo's root and old Shrimpy into `shrimpy-old/`, in one commit of pure renames. A rehearsal in a throwaway worktree passed the full check from the root.
- Into `shrimpy-old/`: `src/`, `test/`, `web/`, `extensions/`, `themes/`, `scripts/`, the old package and config files, the old `README.md`, `CONTRIBUTING.md`, `SECURITY.md` and `THIRD_PARTY_NOTICES.md`, the developer skills, and `docs/reference/`, `docs/backlog/`, `docs/musings/`, `docs/getting-started.md` and the old docs index. The old `AGENTS.md` goes in as `AGENTS.old.md`, so no tool loads it, beside a short one that says the folder is reference only.
- Staying at the root: `docs/REDESIGN/`, `docs/research/`, the logo, `CHANGELOG.md` and `LICENSE`.
- A second commit for the words: a new root `AGENTS.md`, the 41 links in root docs that point at what moved, the paths in this plan and status, and the package's name.
- Four developer skills come back to the root as `dev-skills/`, with their old-tree lines fixed: the writing guide, the changelog skill, commit-all and the cleanup pass. The other seven stay in `shrimpy-old/` until the release decides.
- On this machine: `~/.local/bin/shrimpy` is linked again, and `shrimpy up` restarted.

**Still open in phase 2**

- Not built yet: the rewritten instructions and the four skills, compaction guidance, seeing the request a turn sent, and workspace context from the gateway.
- A reload reaches a turn that is running, at its next request. The plan says later inputs only, and its `/reload` row waits for your call.
- The facts that come with a message are fixed when it is handed to its session, not when the session takes it up. Nothing differs yet, because each fact is fixed for a message. Pi has no hook for the moment input is taken up, so a fact that changes while a message waits needs a capture of its own.
- Skills are trails only. `/skill:name`, templates, required-tool filtering and precedence aren't built, and included skills have no place to live yet.
- `send_message` and `read_messages` reach this thread and a DM the agent already has. An agent can't start a DM, because chat has no list of members to find one in. `quiet`, `#channel`, reactions, edits and delivery status come with rooms and providers.
- Nothing limits the size of `SOUL.md`, a context file, the skills list or the earlier messages that come with an input. The message tools have no timeout, so a chat server that hangs holds a turn until someone stops it.
- The starter `SOUL.md` repeats the first line of the base instructions and carries a note meant for the person, which the model reads.
- The agent's own service is named `SessionDirectory`, though it now also reloads the home.

**Planned for a later phase**

- OAuth sign-in, and a way to set who you are in chat, which is always `person:<OS username>` today: phase 3.
- A web client in phase 3, and `chat/providers/` in phase 5.
- In `agent/intake/`: chat commands, wake policies and the unread cache for rooms.

## Log

Planning evidence: Shrimpy `main` at `574bb2c` runs Pi `0.84.4`. Its source and its CLI, TUI, context, tool, channel, watch, worker, Telegram and web contracts were inspected. No live workspace, configuration or installed watches were inspected to infer actual usage. Pi was inspected at `a276dabe57911253350bffb93cb7d7aff6a73261`, whose durable code matches `v1.0.0`. The research record covers 278 selected upstream tests, six real SQLite owner-kill scenarios, cancelled-wait and storage probes, and three in-memory client/server scenarios. These qualify upstream mechanisms, not a replacement Shrimpy or a production deployment.

**Phase 1 progress, 2026-10-03: the wire-up is in, and an agent answers in a thread.** `shrimpy up` starts the gateway, the chat server and an agent, and `shrimpy run` gets a reply. The agent registers with the gateway, joins chat, turns a message into a turn and its final text into a reply, and leaves a receipt. `threads` and `read` show what was said. Checked on macOS arm64 with Node 26.7.0: 852 tests pass.

- Against `qwen-3.8-flash-next-180b-a6b-nvfp4` on `cashmoney:8090`, a message in a thread became a turn that used the shell tool and came back as a reply, and the agent stayed silent with `END` when told to say nothing.
- Shrimpy's own documents (the thread each session is behind, the outbox and the feed cursor) live in `agent/sessions/`, because the code that takes messages in must not touch Pi, and the lint now enforces that. The agent's links to the gateway and chat got a module of their own, `agent/links/`. The plan's layout was updated to match.
- Three behaviors were decided during the merge and wait for review in the plan's table: queued messages are answered together, a failed turn takes back what waits behind it, and a new agent reads its channels from the start.
- A lost chat connection is retried quietly. A message is handed to its session once, even when both the outbox and the feed bring it up after a restart.
- `next/src/` now holds 8,420 lines of product code, 14,007 of tests and 3,091 of test support.

**Phase 1 progress, 2026-10-04: the terminal client is in.** Bare `shrimpy` at a terminal opens it: the agents on the network, your threads with one, a thread to talk in, and the agent's work shown live under the messages, with Esc to stop it. 1,017 tests pass.

- The gate held. Everything is drawn with `pi-tui`'s public pieces from the package root, with no patch and no private import. The drawing is 562 lines; the rest of the console doesn't depend on what draws it.
- `pi-tui` doesn't make foreign text safe on its own, so the console strips control sequences from every message, name and tool output before drawing.
- `next/src/` now holds 10,870 lines of product code, 16,779 of tests and 3,813 of test support.

**Phase 2 progress, 2026-10-04: an agent is told how Shrimpy works, and has the message tools.** Every session gets four sections of instructions from its home: what every agent is told, `SOUL.md`, the context files and the skills. `shrimpy agent context` previews them, `shrimpy agent reload` makes a running agent read them again, and `send_message` and `read_messages` are in. Checked on macOS arm64 with Node 26.7.0: 1,122 tests pass.

- Against `qwen-3.8-flash-next-180b-a6b-nvfp4` on `cashmoney:8090`, five real-model tests pass: the shell tool, `END` when told, silence after a plain goodbye without being told, `send_message` before the reply, and `read_messages`.
- The builder's probe of the same model, 30 tries each: with the base instructions it stayed silent after a plain closer 30 times, without the sentence about ended conversations 12 times, and with `SOUL.md` alone never. It still answered a new question, a greeting and a follow-up every time. A bare "ok" to a question the agent had asked went silent once in six.
- `SOUL.md` is no longer the engine's instructions field, which renders after the skills. It is a section of its own, so the order holds.
- The builder raised fifteen mismatches. The ones that change what the plan says are in its `/reload` row and its layout; the rest are in the list above.
- `next/src/` now holds 11,895 lines of product code, 18,370 of tests and 4,021 of test support.

**Core first, 2026-10-04.** The new Shrimpy focuses on getting the core architecture and design right, and a feature that isn't part of that waits until daily use asks for it. Memory breadcrumbs, their search index and the `memory-management` skill moved from phase 2 to phase 3's candidates: agents are trusted to search Shrimpy's state with the tools they have. The search and image tools moved there too: the shell covers search, and you confirmed that a picture goes to the model with its message, which durable takes as input, so it needs no tool.

**A client that leaves mid-answer, 2026-10-04.** The `up` test that failed now and then is fixed. When a client dropped its connection while a server was writing to it, the gateway, the chat server and the agent each printed `write EPIPE` as an error. A client may leave at any moment, so they no longer report it. A test for each program reproduces the line with the fix switched off. 1,023 tests pass.

**First use, 2026-10-03.** A fresh home and chat store were set up outside the repo, `shrimpy up` was started, and the first `run` got its answer from the local Qwen model. The old command links were removed at the user's request, and `shrimpy` on the PATH now runs the new command from source through `next/bin/shrimpy.js`.

**The old dev workspace moved, 2026-10-03.** It was moved out of the checkout to a sibling directory, untouched, so the new Shrimpy starts fresh and things are brought over from it as wanted. Its location is in the private notes. Nothing of old Shrimpy is running.

**Docs, skills and agent instructions, 2026-10-03.** They get rewritten from scratch for the new Shrimpy, keeping the charming parts of today's. Agent instructions and included skills come in phase 2, and reference and developer docs at the release. The [keep list](KEEP-LIST.md) of those parts was compiled on 2026-10-04. Your answers: the habits to drop are purged from the rewrite and the musings stay as they are for now, the footer shrimp waits, and phase 2 rewrites four skills: setup, agents, where messages go, and skills. Setup leans toward one agent, named `shrimpy`, with the admin role the mechanic had; that row in the plan is open.

**Phase 1 progress, 2026-10-03: receipts, versions and the serve commands are in.** Agents leave receipts on messages in place of the skipped mark, registrations carry Shrimpy's version, the chat server stays registered with the gateway, and `shrimpy gateway serve`, `gateway status` and `chat serve` exist. `lib/` says "route" where it said "session", and the lint keeps every `lib/` main door safe for browsers.

- A failed receipt must carry its reason. The builder had left it optional, which the plan didn't allow.
- The loop that keeps a program registered lives in the gateway contract's Node door. The plan was silent on where it belongs; a contract's client caller is the closest home, since both the chat server and the agent need it.
- A silent receipt reaches every reader in `Message.receipts`. Not drawing it is each client's job.
- `next/src/` now holds 5,966 lines of product code, 9,432 of tests and 1,582 of test support.

**The MVP, 2026-10-03.** A core part of it is opening the terminal, browsing the agents that have joined the Shrimpy network and seeing their sessions, along with talking in threads. Phase 1 is now the MVP, and it gained joining with a token, the gateway's network entry, and routing to an agent that only connects out. Joining from another machine is part of the MVP but comes last: it waits for a VM on the LAN to test on, and using the MVP on this machine doesn't wait for it.

**Plan rework, 2026-10-03: use it early.** The phases were reordered so the new Shrimpy is used from the end of phase 1 and is the daily one from the end of phase 2. Phase 1 gains a thin terminal client and loses the web view, the sandbox proof and the Linux check. Terminal affordances come back on demand. Triggers and helpers moved ahead of agents everywhere, which now has to settle how peers stay compatible across machines. Cutover and rollback shrank into the release, because no live deployment depends on the old Shrimpy.

**Phase 0, 2026-10-03: done.** All three questions fit, with no compatibility layer around Pi. The [spike report](spike/REPORT.md) and its evidence are in `docs/REDESIGN/spike/`; the spike's code is in git at `a3c6ae4` under `next/spike/`. It ran on macOS arm64 with Node 26.7.0, the published `1.0.0` packages, pi-ai's faux provider and the LAN `qwen3.8-27b` model.

- Crash recovery behaved as planned, killed mid-stream and mid-tool. A shell child kept running after its owner died, so supervision has to reap it.
- The terminal view used only public `pi-tui` pieces, and the browser page bundled without Node built-ins or `esbuild` and recovered after server restarts.
- Opening a home's storage is a write, which makes the owner lock mandatory; the rule is now under [Host and Pi](#host-and-pi).
- The spike first sent Pi's record shapes to its clients. That shortcut was removed in `a3c6ae4`: the server builds a Shrimpy-owned view, and a boundary check fails the build on a violation.
- The spike was then realigned into the seed of the real tree under `next/src/`: `contracts/agent` (the session view, two services, the client caller and a Node-only door), `agent/host` (lock, storage, engine), `agent/sessions` (the one place that reads Pi's records) and the agent's server on a short Unix socket path. Direct input is now `steer`, a control action; talking arrives with the chat server. The terminal view, browser page and WebSocket listener were deleted, to be rebuilt in `clients/` and `gateway/` from the report.
- Each agent process took about 0.6 s and 110 MB of memory to start cold.
- The local Qwen model works through pi-ai with a placeholder key `local`, `maxTokens` set high, and the compat flags `supportsDeveloperRole`, `supportsStore` and `supportsReasoningEffort` set to false. pi-ai sends earlier `reasoning_content` back.
- Still untested: Linux, Node versions other than 26.7.0, hosted providers and OAuth, other terminals and browsers, authentication on the WebSocket, faults beyond SIGKILL, and sandboxing.

**Phase 1 progress, 2026-10-03: the consolidation pass is in.** One builder moved what the three parallel builds had duplicated into `lib/`: the lock, test support, the client connection core, offering a service, refusals, and a listener helper. It fixed four defects in the agent's client and one in the chat's, and every test now cleans up after itself.

- The total grew instead of shrinking. Program code fell by about 260 lines and their test support by about 220, but the shared modules and their tests are larger than the copies they replaced. `next/src/` now holds 5,492 lines of product code, 8,062 of tests and 1,478 of test support.
- The import rule is simpler: a file imports its own directory or another directory's front door.
- Earlier test runs left about 4,000 `shrimpy-*` directories in the OS temp directory. They haven't been removed.

**Phase 1 progress, 2026-10-03: an agent runs from its home, with a CLI.** `shrimpy agent init`, `agent serve` and `agent status` create and run an agent, and `sessions list`, `read`, `steer` and `stop` talk to it. Run them from source in `next/` with `npm run shrimpy -- <command>`. Checked on macOS arm64 with Node 26.7.0.

- A home holds `agent.json` (name and default model), `SOUL.md`, and Pi's `state/pi/models.json` and `auth.json`. `models.json` takes a strict subset of Pi's format, with `openai-completions` as the only API, and an unsupported key is an error.
- Keys come only from the home's files. The environment isn't read, so two homes can't share a key by accident, and a key written as a command or a variable is refused. OAuth sign-in isn't built yet.
- A stop signal stops intake, gives running turns five seconds, then pauses the rest for the next start. `--now` or a second signal skips the wait.
- Exit codes: 0 for success, 1 for failure, 2 for wrong use, and 130 for a cancelled `steer --wait`.
- The home's model and instructions are applied to the main session at every start. That needs a rule once sessions can override them in phase 3.
- The real-model test passed against `qwen-3.8-flash-next-180b-a6b-nvfp4` on `cashmoney:8090`: init, serve, a turn that calls the shell tool, read and stop, each as its own process, in 4.4 seconds. To run it again, in `next/`: `SHRIMPY_TEST_MODEL_URL=http://cashmoney:8090/v1 SHRIMPY_TEST_MODEL_ID=qwen-3.8-flash-next-180b-a6b-nvfp4 node --test --test-name-pattern="real model" src/cli/shrimpy.test.ts`.

After the three merges `next/src/` holds about 5,300 lines of product code, 7,000 of tests and 1,400 of test support. A consolidation pass is removing what the three parallel builds duplicated.

**Phase 1 progress, 2026-10-03: the chat server is in.** `next/src/chat/` keeps members, DMs, threads and messages in its own SQLite store and serves the chat contract on a Unix socket. About 1,750 lines of product code and 380 in its contract, checked on macOS arm64 with Node 26.7.0.

- Opening the store is the single-owner check for a data directory: a second chat server on it is refused, and a killed owner's lock goes with it. A lock beside the socket keeps one chat server per machine, because Pi's listener can't arbitrate simultaneous starts: three at once left no chat server in 16 of 40 rounds before the lock, and exactly one in 40 of 40 after. The store syncs fully on commit, so an accepted post survives a power cut.
- A message holds up to 400,000 characters. Views, pages and feed batches are bounded by their encoded size, so an answer always fits one protocol frame; a page of very long messages holds fewer.
- A feed cursor past the newest message is refused, so an agent whose chat store was replaced starts again from the head.
- IDs look like `ch_`, `th_` and `msg_` plus 12 characters. A thread's preview is the first 80 characters of its first message on one line. A DM is named for the other member.
- Refusals carry a message and one of Chord's two general codes, for wrong arguments or for something not allowed now. There are no codes of Shrimpy's own yet. Thread rename and archive are plain set-to-value, so clients must not retry them automatically.
- A hosted thread's view stays in memory until the server stops, which is how `pi-server` holds sessions.
- `head` is server-wide, so it shows how many messages exist in channels the caller isn't in.

**Phase 1 progress, 2026-10-03: the gateway is in.** `next/src/gateway/` keeps the registry of running programs on a Unix socket and opens a loopback browser entry that pipes a WebSocket to a registered program. About 540 lines of product code and 190 in its contract, checked on macOS arm64 with Node 26.7.0.

- One gateway per machine is held by an OS lock, because Pi's Unix listener can't arbitrate simultaneous starts: three at once left no gateway running in 21 of 40 rounds.
- A browser can list programs but can't register one. A registration names a socket the entry then pipes to, so a page that could register could reach any socket the user can.
- A WebSocket request with no `Origin` is accepted, since only non-browser clients send none. A foreign origin is refused.
- To review with the web client: the browser URLs `/ws/gateway` and `/ws/<kind>/<name>`, IPv4 loopback only, no default port yet, and the static file rules (no fallback page, no cache or security headers, dotfiles served).
- A second program registering the same kind and name isn't refused; the newest one is the one reached.

**Design review of the contracts and the message flow, 2026-10-03.** Confirmed: a session's address is its thread's ID, and there's no main session; receipts on messages replace the skipped mark and an agent-side wait; the contract says `stop` where it said `abort`; and registrations carry Shrimpy's version. Pi's session view holds only the active context, which compaction keeps inside the model's window, so it stays far below the protocol's 16 MiB frame. Also confirmed: the agent's `react` tool and the `edit` option on `send_message`; silent receipts stay invisible by default; the first command names, `person:<OS username>` as the default identity, explicit paths for machine-level data until phase 6, `/stop` among the first chat commands, and the five things a provider gets.

**Chat review, 2026-10-03.** Confirmed: each agent has its own bot account on an outside chat app, bridges only post as bots, and threads carry reactions, edits and deletes. The agent runs chat commands, starting with `/new`, `/status` and `/help`, and each provider does its own translation. Three recommendations are waiting for a decision. The [chat bridge scout](../research/chat-bridge-scout-2026-10-03.md) found nothing to adopt as the bridge layer.

**Reply review, 2026-10-03.** Four changes confirmed, and the rows above carry them: final text always posts unless it's `END` or empty; `END` is matched forgivingly; final replies wait in an agent-side outbox while chat is unreachable; and threads carry who is working in them.
