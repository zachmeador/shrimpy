# 🦐 Phase 0 Spike Report

Date: 2026-10-03
Status: finished. The spike's code was deleted once its proven parts were rebuilt under `next/src/`. To run it again, check it out from git: `git checkout a3c6ae4 -- next/spike`. File paths below are relative to `next/spike/` at that commit; `evidence/` sits beside this report.
Branch: `worktree-agent-a2e6c98fd0d19c97f`, directly on top of `wip` at `9d5cc47`.

All three questions come out **fits**. Durable recovers the way the plan assumes, the terminal view needed only public `pi-tui` exports, and `pi-client` runs in a browser over a 69-line WebSocket listener. Each needed some Shrimpy-owned code, and none needed a compatibility layer around Pi.

The spike also found one rule the plan should state outright: **opening a home's storage is a write**. A second process that only opened a live home changed the owner's task rows, and a second owner duplicated a model request and poisoned the first owner's session. A 21-line lock built on `node:sqlite` prevented both.

A Qwen 27B model on a LAN inference server (`qwen3.8-27b`) ran every check alongside pi-ai's faux provider. Crash tests kept the faux provider for deterministic timing and were repeated against the real model.

**Follow-up, the same day.** The first version of the spike sent Pi's own record shapes to the terminal and the browser, and both mapped them with a shared view model. That tied every client to the engine. The server now builds a Shrimpy-owned thread view (`ThreadView` in `src/contract.ts`: items, status and an entry count) in `src/session-view.ts`, the one module that knows Pi's shapes, and publishes it as its own replicated state with small patches, including string appends for streaming text. Clients only draw it. `npm run check` type-checks and runs `scripts/check-boundaries.mjs`, which fails if a client imports the engine, the server side, a Node-only module in browser code, or `pi-tui` internals. The terminal view also takes its thread source as an argument instead of importing the in-process host. The bundle, headless, terminal, browser and crash checks were run again on this version; other evidence files predate it.

Setup note: the worktree was cut from `main` (`574bb2c`) instead of `wip`. I fast-forwarded its branch to `wip` so `docs/REDESIGN/PLAN.md` was present. My commit touches only `next/spike/`.

## Verdicts

| # | Question | Verdict | Why |
|---|---|---|---|
| 1 | Durable host and crash recovery | **Fits** | SIGKILL mid-stream and mid-tool, with the faux provider and the real model. The request is sent again with identical messages. The tool is reported as interrupted and not rerun. |
| 2 | Terminal view from public `pi-tui` | **Fits** | 292 lines, drawing a thread view the server builds. Streaming text, tool cards and an editor that sends, captured in a real pseudo-terminal. |
| 3 | `pi-client` in a browser | **Fits** | The page loads a snapshot, updates live and sends, in the Browser pane. The bundle has no Node built-ins and no esbuild. |

## What was built

Everything is in `next/spike/`, with its own `package.json`. The seven Pi packages are pinned at exactly `1.0.0`.

| Piece | Files | Lines |
|---|---|---|
| Durable host, CLI, owner lock | `src/host.ts`, `src/cli.ts`, `src/owner-lock.ts` | 298 |
| Terminal view | `src/tui.ts`, `src/thread-source.ts` | 319 |
| Thread view, built on the server | `src/session-view.ts` | 141 |
| Server and client plumbing | `src/serve.ts`, `src/ws-listener.ts`, `src/contract.ts`, `src/remote.ts`, `src/remote-node.ts`, `src/endpoint.ts` | 355 |
| Browser page | `web/page.ts`, `web/index.html` | 135 |
| Scripted faux provider | `src/faux-script.ts` | 110 |
| Test, evidence and boundary-check scripts | `scripts/*` | 696 |
| **Total** | | **2,054** |

About 1,250 lines are product-shaped. The rest is test scaffolding. `evidence/` holds the captured output of every run quoted below. Browser screenshots were viewed but are not committed; `evidence/browser.txt` records what the page reported about itself.

## 1. Durable host and crash recovery

**Verdict: fits.**

`src/host.ts` builds one agent with one thread (the Harness's root conversation) on SQLite. It creates the model runtime and a registry with Pi's `CodingTools`, supplies a `NodeExecutionEnv`, calls `Harness.open()` on `openNodeSqliteStorage`, then `harness.resume()`. The CLI has `send`, `resume`, `log` and `inspect`.

### Evidence

`node scripts/crash-test.ts` runs the CLI in a child process, SIGKILLs it as soon as the committed view shows the right state, starts a new process on the same SQLite file, and checks the result.

**Kill while the model streams** (`evidence/crash-faux.txt`):

```
first run                 pid 54821 submitted #7; committed partial of 60 chars; SIGKILL
after kill, unfinished    {"submissions":[{"id":7,"status":"placed"}],"tasks":["pi.generation:ready"]}
second run                pid 54824 reopened; submission #7 settled done
entries                   pi.user pi.system pi.assistant(aborted) pi.assistant(stop)
model requests            ["pid 54821 2 msgs digest 42e83506dbdf","pid 54824 2 msgs digest 42e83506dbdf"]
```

The provider received the request twice, from two pids, with the same messages. The partial answer stayed as an aborted assistant entry, the user input was not duplicated, and the original submission settled `done`.

**Kill while a shell tool runs:**

```
shell child after kill    pid 54827 is still running (detached process group)
after kill, unfinished    {"submissions":[{"id":7,"status":"placed"}],"tasks":["pi.tool:ready","pi.generation:waiting"]}
tool executions           1 (runs.log has 1 "attempt" line)
tool result entry         {"isError":true,"text":"started\n<harness>\n[error] Tool bash was interrupted and may have partially run\n</harness>"}
model requests            ["pid 54826 roles user,system","pid 54832 roles user,system,assistant,toolResult"]
```

The built-in `bash` tool (unsafe by default) ran once. After the restart it had an error result with the output committed before the kill, and the next model request carried that result.

**The same two kills against the real model** (`evidence/crash-real.txt`). Mid-stream: two POSTs from two pids with identical `messages` on the wire, and the 62-character thinking partial kept as an aborted entry. Mid-tool: one execution, an interrupted result, and a model that then ran one more shell call of its own to work out what happened.

**Through the clients.** After a kill during a tool call and a restart, a fresh terminal client and a fresh page both show the tool as interrupted, with its partial output (`evidence/tui-interrupted-tool.txt`, `evidence/browser.txt` item 6). The orphaned shell finished its delayed write on its own: `runs.log` ended with `attempt …`, then `finished`.

My two scenarios match the research note's generation and unsafe-tool/orphan cases on the published packages. I did not repeat its safe-replay or idempotent-effect cases.

### Surprises

1. **Opening storage is a write.** A second process that only opened a live home (`cli.ts inspect`, no `resume`) turned the owner's running generation task into `pending`. Raw read-only SQL shows `pi.generation#8:running` before and `pi.generation#8:pending` after (`evidence/second-opener-nolock.txt`). The owner finished its turn anyway.
2. **A second owner is worse.** Another `serve` on the same home resumed that generation, so the model request went out a second time. It then exited when its socket bind failed. The first owner's session was poisoned (`ID 10 already belongs to entry`), and its client was still waiting 25 seconds later for an answer that takes about 9 (`evidence/second-owner-nolock.txt`). The research note saw the same ID collision in a disposable test.
3. **Socket exclusion comes too late.** My `serve` opened storage, then bound the socket, which is the natural order. The bind was the only thing that failed, after the damage.
4. **A 21-line lock prevented all of it.** `src/owner-lock.ts` runs `PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE` on `runtime/owner.lock` through `node:sqlite`, before the Harness opens. With it, the second opener and the second owner were refused before they touched storage, and the owner finished normally (`evidence/second-opener-lock.txt`, `evidence/second-owner-lock.txt`). The kernel released the lock on SIGKILL: the crash tests restart straight after a kill. The orphaned shell, still alive then, does not hold it.
5. **The interrupted marker is structured.** Result entries carry `data.diagnostics[].code === "interrupted"`. The stored content, which the model also sees, ends with a rendered `<harness>` block. The view model reads the structured field instead of parsing text.
6. **Orphans survive a kill.** The detached shell child kept running and finished its write, as the research note found.

### Phase 1: keep and avoid

Keep:

- `Harness` on SQLite with `harness.resume()` straight after open, `submit({ requestId })`, and `viewState()` as the one thing clients read.
- A request ID carried through the whole API. `Thread.send(text, whenBusy, requestId)` returned the same submission when called twice with one ID (`evidence/headless-client.txt`).
- The owner lock as the first thing an owner does. It is a candidate for the plan's OS-held lock, pending Linux qualification.
- Faux provider scripts for crash timing, with a real model alongside.
- Reading `data.diagnostics` for interrupted and failed tools.

Avoid:

- Opening the Harness in any process that is not the owner, including for `log` or `inspect`. CLI reads should go through the owner's API.
- Starting servers or binding sockets before the lock. Close the Harness on every failure path after open: my `serve` kept running and working after a failed bind until I fixed it.
- Assuming a kill of the owner kills its tools. Supervision has to reap the process group or the container.

## 2. Terminal view from public `pi-tui`

**Verdict: fits.**

`src/tui.ts` draws the thread view with public components. Every `@earendil-works/pi-tui` import is from the package root, and nothing comes from coding-agent. Components used: `TuiMainScreen`, `TuiAltScreen`, `ProcessTerminal`, `Container`, `Box`, `Text`, `Spacer`, `Markdown`, `Loader`, `Editor`, `ScrollView`, `VStack` and `CombinedAutocompleteProvider`. The helpers are `matchesKey`, `parseColor`, `styleText`, `getTerminalColorMode` and `isViewportTUI`.

What the server reads from the committed session to build each part of the thread view:

| Shown | Source |
|---|---|
| Streaming text and thinking | `docs["pi.live"].generation.message` (committed at most every 100 ms) |
| Running tool output | `docs["pi.live"].tools[].output` |
| Finished messages and tool results | `entries` |
| Queued input | `docs["pi.inbox"]` |
| Model and usage | `docs["pi.agent"]`, `docs["pi.usage"]` |

The console owns its theme (about 40 lines of style functions), its message and tool-card renderers (about 100 lines) and its footer. Coding-agent's equivalents are internal, and the prior-art durable TUI deep-imports them.

### Evidence

`scripts/pty-drive.py` runs the CLI in a pseudo-terminal at 100x34, types keystrokes and records every output chunk with its timestamp. `scripts/render-capture.ts` replays a capture into `@xterm/headless` and prints the screen at chosen moments.

Main-screen run with the faux provider, mid-stream (`evidence/tui-main-faux.txt`, at 7.4 s):

```
 hello, show me the files

 thinking: The user wants a listing, so I will run a short shell command.
 Let me look at the work directory.

 bash $ printf 'listing the work directory\n'; ls -1 | head -5; sleep 2; printf 'done\n'  ✓ done
 listing the work directory
 done

 thinking: Composing a short markdown reply with a list and a code block.
 The command finished (isError=false).

 - first point, streamed token by token
 - second point with inline code
 - th

 ⠦ model is answering  (esc to stop)
────────────────────────────────────────────────────────────────────────────────────────────────────
                                                         (the editor)
────────────────────────────────────────────────────────────────────────────────────────────────────
 faux/faux-1 · in 695 out 50 $0.0000 · enter send · /steer text · esc stop · ctrl+o expand · ctrl+c quit
```

The same capture at 4.5 s shows the tool card as `● running` with its first output line. Other runs:

| Run | File | Shows |
|---|---|---|
| Fullscreen (`--alt`) | `evidence/tui-alt-faux.txt` | A message queued while busy (`queued [followUp] ...`), Esc stopping the answer (`(answer interrupted)`, queue withdrawn), and the transcript kept on screen at exit |
| Real model | `evidence/tui-real.txt` | Thinking, a real `bash` call (`uname -sm` → `Darwin arm64`), the answer, `local/qwen3.8-27b` in the footer |
| Attached over the Unix socket | `evidence/tui-attach-draft.txt` | The same screen from `tui --attach`. After the server was SIGKILLed: `disconnected from the agent: Byte transport closed.` A message typed afterwards came back into the editor with `not sent: ...` |
| Completion | `evidence/tui-complete.txt` | `/st` offers `steer`, and `./no` + Tab completes to `./notes.md`, through the public provider |
| Interrupted tool | `evidence/tui-interrupted-tool.txt` | `⚠ interrupted, not rerun`, the partial output, the structured note, then the model's answer |

### Surprises

1. **The editor clears itself before `onSubmit` returns.** The console has to put the draft back when a send fails. That is what the draft test above exercises.
2. **Fullscreen exit loses the transcript.** `TuiAltScreen` prints the layout unbounded on stop. With the README's layout (transcript entry at `basis: 0`) my transcript was missing afterwards. I print it myself after `stop({ preserveScreen: true })` and did not dig into the cause.
3. **`pi-tui` has no `exports` map**, so deep imports resolve. "Public only" has to be a lint rule.
4. **`@` fuzzy file completion needs an `fd` binary** passed to `CombinedAutocompleteProvider`. None is installed here, so only slash and path completion were exercised. The provider reads a local directory, so an attached console needs its own `AutocompleteProvider` (the interface is public) that asks the agent.
5. **The error for a send after the server died** is `Remote service target is unavailable`. It needs a friendlier message.
6. `Text` defaults to one row of vertical padding.

### Phase 1: keep and avoid

Keep:

- The main screen as the default and `TuiAltScreen` as the option.
- `Editor` for history, paste handling and autocomplete.
- One thread view built on the server from the committed session. Clients only draw it.
- A console-owned theme.
- Restoring the draft on a failed send.

Avoid:

- Deep imports into `pi-tui`, with no lint rule to catch them.
- Relying on fullscreen exit to leave the transcript behind.
- Parsing tool text for status. Use the structured diagnostics.
- Assuming `fd` is present, or that completion should read the client's filesystem.

## 3. Pi's client in a browser

**Verdict: fits.**

The browser reaches the durable host through `pi-client`, a WebSocket and `pi-server`:

- `src/ws-listener.ts` (69 lines) is a `ServerListener` over the `ws` package. Each binary frame is one chunk of the protocol's byte stream. The same HTTP server serves the page, so there is one origin.
- `src/serve.ts` (117 lines) wires the Harness to `pi-server` on a Unix socket and the WebSocket.
- `src/contract.ts` defines two Chord services, which are ours: `Sessions` (attach) and `Thread` (the thread view as replicated state, plus `send` and `abort`). It imports no engine types.
- `src/remote.ts` (72 lines) is the client, with no Node imports. Its `connectThread()` serves both the page and the Node clients: the terminal uses the Unix socket, and `scripts/headless-client.ts` uses either.
- `web/page.ts` is 94 lines. It draws the same thread view as the terminal.

### Evidence

**Bundle** (`npm run bundle`, `evidence/bundle.txt`), esbuild `platform=browser`:

```
bundle         478806 bytes  (minified 200706, gzip 52384)
input modules  701
    338349  typebox
     60375  @earendil-works/chord
     23759  @earendil-works/pi-protocol
     19290  @earendil-works/pi-client
      6037  (spike source)

external imports left in the bundle:    none
node: built-in modules bundled:         none
esbuild / @esbuild/* bundled:           no
```

Three negative controls fail to bundle for a browser, which shows the check can fail: `@earendil-works/chord/bundler`, `@earendil-works/chord/node` and `@earendil-works/pi-client/unix` all stop on `node:` built-ins.

**In the Browser pane** (`evidence/browser.txt`, a Chromium-based view of `http://127.0.0.1:<port>/`):

- The page loaded `/`, `/page.js` and `/config.json`, showed `connected`, and opened onto the full earlier thread. The console was empty.
- I typed a message and pressed Enter. The tool card went from `bash {} pending` to `done` with its output, and the next answer streamed in. The page then held 10 items.
- The terminal view, attached over the Unix socket, typed a message. It and its answer appeared in the page without a reload.
- With the real model behind the server, a typed request produced thinking, `bash {"command":"uname -sm"}` → `Darwin arm64`, and the answer, in under 3 seconds.

**Restarts with the page open.**

- *Graceful stop and start:* the page showed `failed` and kept the old content. It was `connected` again within 3 seconds of the restart, which was the first look I took.
- *SIGKILL mid-stream, then restart:* the page reattached and showed the interrupted partial (`line 17: the qui`, then `(answer interrupted)`) followed by the complete re-requested answer.
- Page state afterwards: user, assistant, user, **assistant (aborted, 864 chars)**, assistant (2,119 chars).

**Headless** (`evidence/headless-client.txt`), over the Unix socket and over the WebSocket from Node: a client that sent a message saw 23 live updates, and a second client's snapshot held the finished thread: 4 items and 5 committed entries. A message sent twice with one request ID returned the same submission (`same submission, admitted once`).

**Client death** (`evidence/client-death.txt`): a sending client SIGKILLed itself 2 seconds into a 9-second answer. Nine seconds later a second client attached and saw the complete answer in the thread. Accepted work does not depend on the client that sent it.

### Chord and esbuild

`@earendil-works/chord@1.0.0` lists `esbuild@0.28.2` under `dependencies`, so every install carries esbuild and its platform binary: `@esbuild/darwin-arm64` is 10 MB here. Only the `./bundler` subpath uses it. The root export that `pi-client` and the page import never reaches it: the metafile has no esbuild input, no `node:` import and no unresolved external. The cost is install weight, not bundle content.

TypeBox is the real bundle cost. `pi-protocol` depends on it at runtime, and it accounts for 338 KB of the 479 KB unminified bundle.

### Surprises

1. **`ready()` waits only for services already acquired with `use()`.** Calling it first returned an undefined state. Acquire the service, then wait.
2. **The attachment route arrives out of band.** `attach()` can resolve before `client.attachment` is set, so the client waits on `onAttachmentChange`.
3. **`pi-client` never reconnects.** The page re-runs the whole connect (fetch config, new `Client`, attach). My fixed one-second retry kept going for as long as the page stayed open after the server stopped, and the browser later held about ten thousand failed requests. Use backoff.
4. **A disconnected page shows a stale view.** It kept the last state, including `model is answering`, next to a red `failed`. Clients should mark the view stale.
5. **`pi-server` does not export its connection types from the root.** `ByteConnection` and `ByteConnectionAcceptor` can be derived from `ServerListener`.
6. **macOS limits Unix socket paths to 104 bytes.** `listen` on my 112-byte absolute path failed with `EINVAL`. I bound `s.sock` relative to the runtime directory, and every process changes directory there first. Phase 1 needs a short runtime directory. The `pi-server` README gives the same advice.
7. **The server ID survived restarts** because `runtime/endpoint.json` keeps it, so reconnecting clients saw the same identity.

### Phase 1: keep and avoid

Keep:

- One Chord contract used by the terminal and the browser, over `pi-server` and `pi-client`.
- The WebSocket as a first-class `ServerListener`.
- Browser code that imports only package roots and no engine types.
- A server ID that persists across restarts.

Avoid:

- Importing `@earendil-works/pi-client/unix` or `@earendil-works/chord/node` from shared code.
- Sockets under a long home path.
- Counting on client reconnect.
- Expecting a small bundle. The budget is about 200 KB minified, 52 KB gzipped.
- Binding anything other than loopback before there is an auth and origin policy. The spike has none.

## Real provider notes

The model was `qwen3.8-27b` behind an OpenAI-compatible Chat Completions endpoint, configured with `createProvider()` and `openAICompletionsApi()` inside `src/host.ts`. The base URL and model ID come from `SPIKE_LOCAL_URL` and `SPIKE_LOCAL_MODEL`. `scripts/real-provider-check.ts` asserts the findings below (`evidence/real-provider.txt`).

- **`reasoning_content` is sent back.** The adapter records the field a server streamed reasoning in (`thinkingSignature: "reasoning_content"` here) and echoes the thinking text under that name on earlier assistant messages. The second request's history carried `reasoning_content` on the first answer, and it did so from SQLite after a process restart. From reading the adapter, a server that streams `reasoning` would get `reasoning` echoed instead. I did not test that.
- **Output budget.** The adapter sent `max_completion_tokens: 65536`, taken from `maxTokens` on the model definition, and no `max_tokens`. The server accepted it. Set `maxTokens` high, since reasoning shares the budget.
- **An API key is required.** Without one the adapter fails with `No API key for provider: local`. The placeholder `local` works.
- **Compat flags.** I set `supportsDeveloperRole: false`, `supportsStore: false` and `supportsReasoningEffort: false`, so a reasoning-flagged model gets a `system` role and nothing OpenAI-specific. I did not test without them. pi-ai also has `thinkingFormat: "qwen-chat-template"`, which sends `preserve_thinking`. I did not use it.
- **Tool calls.** More than ten real `bash` calls across these runs. None was rejected for invalid arguments, and durable ran each one and the model read the results back correctly. After an interrupted result the model investigated with further shell calls on its own. Nothing was stress-tested: no multi-step edits, no parallel calls, no long contexts.
- **Speed.** Short turns took 0.4–1.1 s including Node startup.

## Installed versions and footprint

Pinned at exactly `1.0.0`: `@earendil-works/pi-durable`, `pi-ai`, `chord`, `pi-server`, `pi-client`, `pi-protocol`, `pi-tui`. `pi-protocol` is installed and used through `pi-client` and `pi-server`, not imported directly.

| Also installed | Version | Why |
|---|---|---|
| `@earendil-works/pi-telemetry` | 1.0.0 | pulled in by `pi-ai` |
| `typebox` | 1.3.27, one copy | `pi-ai`, `pi-durable`, `pi-protocol` |
| `openai`, `@anthropic-ai/sdk`, `@google/genai` | 7.19.0, 0.124.0, 2.21.0 | `pi-ai` |
| `ws` | 8.22.0 | the WebSocket listener |
| `esbuild` | 0.28.2 | `chord`'s dependency; also my bundler |
| `typescript` | 5.9.3 | Shrimpy's root version |
| `@xterm/headless` | 6.0.0 | replaying pty captures |
| `@types/node`, `@types/ws` | 26.6.4, 8.18.2 | types |

Runtime: Node 26.7.0, npm 11.19.0, macOS arm64. `node:sqlite` printed no warning.

`npm ci --omit=dev` gives 121 MB in 55 top-level directories. The largest are the provider SDKs that `pi-ai` pulls in: `openai` 28 MB, `@anthropic-ai/sdk` 13 MB, `@google/genai` 11 MB, and the AWS SDK with smithy about 14 MB. `@esbuild/darwin-arm64` is 10 MB. For comparison, `pi-ai` is 6.3 MB, `pi-tui` 2.8 MB, `pi-durable` 2.7 MB and `chord` 1.3 MB. A process that opens a home costs about 0.6 s and 110 MB of resident memory cold (`/usr/bin/time -l` on `cli.ts log`).

Type-checking: TypeScript 5.9.3 checks the spike against the published `.d.ts` files, including Chord's JSON-contract typing for `ReplicatedState<ConversationView>`. With `skipLibCheck: false` there is one error, from `@google/genai`'s typings (`@modelcontextprotocol/sdk` types are missing). The root `tsconfig.json` already sets `skipLibCheck: true`.

## Differences from the plan and the research note

- **Plan: "Clients never open storage for writing."** Correct, and stronger than it reads: `Harness.open` itself writes, so opening is not a read-only operation. `log`, `inspect` and anything like them must ask the owner.
- **Plan: "OS-held advisory lock before opening storage."** Confirmed as necessary, and a working 21-line candidate exists. It is qualified on macOS only.
- **Plan: "a small WebSocket bridge."** Confirmed: 69 lines, as a public `ServerListener`.
- **Plan: the page bundles `pi-client` and Chord without Node-only dependencies.** Confirmed. The bundle also includes TypeBox through `pi-protocol`, which the plan does not mention.
- **Research note: the experimental controller has no request ID.** The spike's own `Thread.send` carries one, and the retry behaved as the plan expects.
- **Plan's terminal list: "Ctrl+C doesn't exit immediately."** My Ctrl+C exits at once. That affordance is not built.
- **Worktree base.** It was `main`, not `wip`, as noted at the top.

I found no contradiction of the research note's findings.

## Still pending

| Item | Why it is open |
|---|---|
| Linux | Everything ran on macOS arm64: the owner lock, Unix sockets and the pty runs. The plan already schedules Linux qualification. |
| Other Node versions | Only 26.7.0. Shrimpy declares `>=22.19.0`, and I did not check `node:sqlite` there. |
| Hosted providers and OAuth | The only real provider was a LAN Qwen server. Images, long contexts, compaction, model switching, reload and forks were not exercised. |
| Concurrent model use | The report on that server says it handles one request at a time. I did not test concurrency. |
| Other terminals | Only an xterm.js replay of pty captures. No iTerm2, Terminal.app, Linux terminals or tmux. Clipboard images, an external editor, `!` and `!!`, editing a queued message, theme detection and `@` file search (needs `fd`) are not built or not tried. Ctrl+O was sent in the fullscreen run, but that scenario had nothing to expand. |
| Other browsers and origins | One Chromium-based pane on loopback. There is no auth, TLS, origin or CSRF handling, no reconnect backoff, and no large-transcript test. |
| Faults beyond SIGKILL | Power loss, a full disk, WAL damage, and a kill during compaction or the tool-result commit. |
| Sandboxing | Not tried. |
| Crash-loop policy | "Resumed and crashed twice" is a Shrimpy rule and is not built. |
| Lock scope | Tested with same-user processes on a local APFS volume. Network filesystems and sandbox mounts are untested. |

## Run it again

From `next/spike/` after `npm install --ignore-scripts`:

```bash
npm run check                               # types and boundaries
node scripts/crash-test.ts                  # question 1, faux provider
node scripts/second-opener.ts [--second-owner] [--no-lock]   # opening a live home
npm run bundle                              # question 3, bundle check

# real model (base URL includes /v1)
export SPIKE_LOCAL_URL=http://HOST:PORT/v1 SPIKE_LOCAL_MODEL=MODEL
node scripts/crash-test.ts --real
node scripts/real-provider-check.ts

# terminal view and server
SPIKE_SCENARIO=chat node src/cli.ts tui --home DIR [--alt]
python3 scripts/pty-drive.py --out cap.json --steps '[[2,"hello\r"],[10,"\u0003"]]' -- node src/cli.ts tui --home DIR
node scripts/render-capture.ts cap.json --at 3,6
node src/cli.ts serve --home DIR --port 8787     # then open http://127.0.0.1:8787/
node src/cli.ts tui --attach --home DIR
node scripts/headless-client.ts --home DIR [--ws] --send TEXT --twice
```

`SPIKE_SCENARIO` picks a faux script (`chat`, `stream` or `tool`) and `SPIKE_TPS` its speed. Without `SPIKE_LOCAL_URL` the faux provider is used. `SPIKE_NO_LOCK=1` turns the owner lock off and exists only for `scripts/second-opener.ts --no-lock`.
