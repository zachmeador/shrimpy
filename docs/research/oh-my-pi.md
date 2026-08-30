# 🦐 Oh My Pi Feature Survey

Date: 2026-08-30
Status: Research
Oh My Pi source: `main` at `969062200754ea02cfac922e5ebb8c608c079e15` (`@oh-my-pi/pi-coding-agent` `18.0.11`)

[Oh My Pi](https://github.com/can1357/oh-my-pi) (`omp`) is a batteries-included fork of Pi built as a terminal coding agent. It keeps Pi's model loop, sessions, TUI, SDK shape, and extension ancestry, then replaces or expands almost every surrounding surface: editing, search, shell execution, code intelligence, subagents, memory, compaction, browser and desktop control, collaboration, discovery, packaging, and external protocols.

It is a very good idea farm for Shrimpy and a poor candidate for Shrimpy's primary runtime. The useful rule is:

> Borrow contracts and experiments; do not adopt the second kernel.

The most relevant ideas are OMP's host-tool and virtual-resource callbacks over RPC, typed subagent results with durable supervision, memory freshness and mutation semantics, and argument-aware tool policy. The least attractive path is replacing Shrimpy's upstream Pi packages with OMP's fork.

## What OMP Is

OMP is no longer a thin extension bundle. It is a Bun-first monorepo with republished `@oh-my-pi/*` versions of Pi's AI, agent, coding-agent, and TUI packages; additional packages for Hashline edits, memory, compaction, statistics, collaboration, browser relay, and benchmarks; and a substantial Rust/N-API layer for shell, search, AST operations, filesystem walking, workspace cloning, desktop control, images, PTYs, and related native work. The project is MIT-licensed, with separate notices for vendored components.

The inspected README reports 60-plus providers, 31 built-in tools, 14 LSP operations, 28 DAP operations, and roughly 80,000 lines of first-party Rust. Those are the project's own inventory and benchmark claims, not results reproduced for this note. The breadth is real in source: there are 31 individual tool references and distinct host paths for interactive, print, JSON, RPC, RPC-with-UI, ACP, and SDK use.

OMP exposes one engine through four main entry shapes:

| Shape | Use |
| --- | --- |
| `omp` | Interactive terminal UI with tool cards, selectors, session navigation, and live subagent control |
| `omp -p` | One-shot or streamed headless work, with text or JSON output |
| Node SDK | In-process `createAgentSession()` integration with typed events and explicit session/model/tool options |
| `omp --mode rpc` / `omp acp` | Stdio control for non-Node hosts, process separation, editors, and other clients |

This is the important architectural distinction from Shrimpy. Shrimpy uses upstream Pi as the turn engine and owns the durable home around it. OMP is itself a full coding-agent product and owns most of the surrounding policy too.

## Feature Tour

### Coding tools

OMP's clearest investment is its tool harness.

- **Hashline editing:** the model edits against compact line anchors derived from a recorded whole-file content hash. Stale anchors are rejected or recovered through a snapshot-aware three-way merge, and multi-file patches are preflighted before any section lands. The package abstracts filesystem and snapshot storage, although the published implementation depends on OMP's native and utility packages.
- **Code intelligence:** `lsp` covers diagnostics, definitions, references, symbols, renames, code actions, and raw requests. File moves can pass through language-server rename preparation. `debug` drives DAP adapters such as LLDB, Delve, and debugpy. `ast_grep` and staged `ast_edit` add structural queries and codemods.
- **Native search and shell:** grep, globbing, ignore-aware walking, a persistent Bash-compatible shell, PTYs, and many command-line utilities run in-process through Rust instead of assuming host binaries. This improves cross-platform consistency, especially on Windows, but creates a large native build and release surface.
- **Persistent evaluation:** `eval` retains Python and JavaScript kernels across calls, can render rich outputs, and lets code call back into host agent helpers. Python runs in an NDJSON subprocess with filtered environment variables, timeouts, interrupt escalation, and an optional per-call mode. It is code execution, not a safe data-expression language.
- **Broad I/O:** `read` handles ordinary files plus directories, archives, SQLite, PDFs, notebooks, URLs, SSH paths, and internal schemes. Browser, desktop, image, speech, web-search, GitHub, and security tools extend the agent well beyond a source tree. Several expensive or consequential tools are setting-gated or disabled by default.

The unifying product move is composability. OMP tries to teach the model a few filesystem-shaped operations rather than a separate tool schema for every object. Examples include `pr://`, `issue://`, `skill://`, `rule://`, `memory://`, `agent://`, `history://`, `artifact://`, and `conflict://`.

### Subagents and workflow

The `task` tool is a full child-agent runtime, not a simple subprocess wrapper.

- One call may start one child or a parallel batch. Child types, model roles, effort, tool sets, recursion depth, timeouts, and concurrency are configurable.
- Results may follow an invocation-specific JSON Schema. The parent receives validation state and parsed data rather than having to scrape prose.
- Outputs, transcripts, patches, usage, lineage, and lifecycle state persist as artifacts. `agent://<id>` exposes final output and `history://<id>` exposes a bounded transcript.
- Finished children can remain idle, receive follow-up messages, be parked, revived, or killed. Agent Hub gives the user a live roster, usage view, transcript reader, steering input, and controls.
- Optional task workspace isolation uses APFS clones, reflinks, overlay filesystems, ProjFS, git worktrees, or recursive copies, then returns a patch or branch result.
- An optional advisor model watches the main agent on a separate context and injects concerns or blockers. Review, commit splitting, diagnostics cleanup, planning, and model handoff build on the same primitives.

The word “isolation” needs care. `pi-iso` creates a separate writable workspace view and makes change capture cheap. It does not by itself restrict network access, credentials, process execution, or reads outside that workspace. Headless OMP subagents also force the approval mode to `yolo`; configured per-tool `deny` rules still apply, while `prompt` rules fail because no UI can answer them. This is useful conflict isolation, not the session security boundary described by Shrimpy's [SECURITY-006](../backlog/proposals/security-006-session-authority.md).

### Sessions, context, and compaction

OMP substantially extends Pi's session model.

- Sessions are append-only trees with branching, labels, fork/resume/import/export, model and thinking changes, handoff documents, queued messages, and a tree navigator that can resume from earlier entries.
- Context files, rules, skills, hooks, extensions, plugins, MCP servers, and provider definitions can be discovered from OMP-native locations and several other agent ecosystems. Extensions can register tools, commands, shortcuts, renderers, providers, UI, and event handlers in-process.
- Time Traveling Stream Rules (TTSR) watch streamed prose, thinking, or tool arguments. A regex or AST match can stop generation mid-stream, inject a hidden reminder, and retry. Non-interrupting rules can instead attach reminders to tool results or a following turn.
- Compaction supports normal model summaries plus deterministic methods. `shake` replaces old bulky content with recoverable artifact references. `snapcompact` renders old transcript text into model-tuned bitmap frames for a vision model, preserving recent and oldest edges as text.
- Role-aware model selection, retry fallback chains, a second-model advisor, and “prewalk” handoff let one session use different models for planning, review, or implementation.

The discovery breadth is convenient for a coding-agent user, but it is the opposite of Shrimpy's current prompt boundary. Shrimpy deliberately suppresses ambient Pi context and skill discovery so `shrimpy context` can explain exactly what the model saw. Importing other harness formats should remain an explicit setup operation, not a silent runtime behavior.

### Memory

Memory is off by default and can use several backends:

- `local` extracts durable signal from prior sessions, then consolidates it into a long memory document, a compact startup summary, and generated skill playbooks.
- `mnemopi` provides local SQLite memory with full-text and optional embedding recall, scoped banks, automatic retention, and explicit mutation.
- `hindsight` connects to a remote Hindsight server.
- `sharpshooter` maintains friction-gated project decision files.

The model-facing contract is more interesting than the backend list. Recalled memory is labeled as heuristic background rather than instruction or current truth. The prompt tells the agent to pair it with fresh repository evidence. `retain`, `recall`, `reflect`, and `memory_edit` distinguish capture, retrieval, synthesis, update, invalidation, and forgetting; long recall previews point to a full `memory://<id>` record that must be read before replacement. Local learned lessons are redacted, capped, deduplicated, and injected only in a later session so they do not mutate the active prompt-cache prefix.

### External hosts and collaboration

OMP's RPC protocol is unusually capable. It streams correlated commands and agent events over bounded NDJSON frames, supports session and model control, and forwards optional subagent progress or full events. Two callbacks are especially relevant to Shrimpy:

- `set_host_tools` lets the parent register tool schemas. OMP calls those tools back over stdio, including progress, result, error, and cancellation frames.
- `set_host_uri_schemes` lets the parent register virtual read/write schemes. Reads and writes such as `db://users/42` bounce to the host instead of giving the child direct storage access.

ACP maps OMP tools onto editor filesystem, terminal, and permission capabilities. Collaboration uses an encrypted relay to mirror a live session into another terminal or browser with full-control and view-only links. Payloads are AES-GCM encrypted client-side, but the production relay is hosted and not published as a self-hostable service; the repository contains only a development stand-in.

## Trust and Operational Caveats

OMP has useful guardrails, but its default posture is a powerful local coding agent.

- `tools.approvalMode` defaults to `yolo`. The tiered `read` / `write` / `exec` policy and argument-dependent allow/deny/prompt decisions are well designed, but the default is not a least-authority policy.
- Workspace cloning isolates sibling edits, not the host. Shell, eval, browser, desktop, extensions, MCP, and child agents can all cross that boundary unless separately restricted.
- Extensions run in-process and can register runtime behavior. Ambient discovery covers several other tools' config, rules, skills, and MCP files. That convenience expands the trusted input and code surface.
- Secret obfuscation is optional. It can keep configured credentials out of provider-visible text and reverse placeholders before tool execution, but it is not a credential broker or process sandbox.
- Browser and desktop control intentionally reach signed-in sessions, native input, accessibility trees, the clipboard, and Electron applications. Those are valuable only behind an explicit authority boundary.
- OMP is fast-moving. The inspected `main` commit and package release are from the date of this note. Its porting guide documents a manual upstream Pi sync process with a historical March 2026 marker, so Shrimpy should expect semantic divergence rather than drop-in compatibility.

## Fit With Shrimpy

Shrimpy currently pins upstream `@earendil-works/pi-*` `0.84.4`, uses the SDK directly, disables ambient prompt-resource discovery, and owns agents, channels, watches, worker records, session identity, context assembly, publication, and the workspace. OMP `18.0.11` republishes the Pi packages under a different scope, its npm packages require Bun, and it brings its own versions of most of those concerns.

A direct dependency replacement would therefore be an architecture migration, not an upgrade. It would make every Shrimpy Pi upgrade depend on a second project's manual upstream ports, introduce native release obligations, and create competing ownership for memory, child agents, skills, sessions, approvals, collaboration, and tool policy.

The useful pieces are narrower:

| OMP idea | Shrimpy value | Recommendation |
| --- | --- | --- |
| RPC host tools and host URI schemes | Closely matches [ARCH-002](../backlog/proposals/arch-002-home-kernel.md)'s contained runner: credentials and authority stay with the parent while a child receives scoped capabilities over RPC | High-value design prior art. Borrow the correlated callback and cancellation shape for Shrimpy's runner boundary; keep Shrimpy's permit authoritative |
| Typed child output, artifacts, lifecycle, and live supervision | Shrimpy workers already have durable records and follow-up commands, but structured yield and one coherent live supervisor would reduce prose parsing and make delegation easier to inspect | Add optional output schemas and attributable artifacts to the worker contract before considering more persistent child machinery |
| Virtual resource schemes | `worker://`, `session://`, `channel://`, `skill://`, or `watch://` could make existing bounded facts composable through `read` without multiplying model tool schemas | Prototype only when every scheme delegates to the same service and authorization checks as its CLI command; URI access must not become a hidden second API |
| Argument-aware tool policy | OMP's tier plus per-call policy function is more expressive than Shrimpy's current whole-tool `disabledTools` list | Feed the idea into SECURITY-006's `SessionPolicy`, but enforce it at the host/OS boundary and use safer defaults than OMP |
| Memory provenance and mutation verbs | Freshness warnings, full-record reads before updates, explicit invalidation, scoping, and inspectable consolidation artifacts fit a resident agent better than opaque automatic memory | Borrow the contract and UX. Keep Shrimpy memory home- and identity-aware, file-inspectable, and subordinate to current channel/session facts |
| Persistent eval that can call host tools | A concise program can coordinate data transforms and typed tools better than a long sequence of model calls | Interesting only inside a contained session profile. Do not expose a credential-bearing host Python kernel as a default home-agent capability |
| Encrypted view/control links | Capability links and view-only sharing are useful prior art for a future owner-local Shrimpy chat surface | Borrow the link and authority model, not OMP's session replication or hosted relay dependency |
| TTSR stream interruption | Conditional reminders avoid paying prompt cost on every turn and could catch a narrow recurring mistake | Research-only. It is not a security control, complicates transcript semantics, and should lose to tool policy or normal context producers whenever those can enforce the rule |
| Hashline, native shell, LSP/DAP, and OMP coding workflows | Strong coding-worker capabilities without requiring Shrimpy to reproduce them | Treat OMP as a possible external worker backend or benchmark target, not Shrimpy's resident runtime. Hashline itself deserves a bounded edit benchmark before dependency adoption |
| Snapcompact | Unusual model-free compaction experiment with measurable cost/recall claims | Watch the research. Shrimpy should keep Pi's compaction boundary until independent results and an upstream extension seam justify experimentation |

## Recommended Experiments

No OMP code needs to enter Shrimpy yet. Three bounded probes would extract most of the signal:

1. **Contained-runner protocol review:** compare OMP's host-tool and host-URI RPC frames with the runner RPC proposed by ARCH-002 and SECURITY-006. Record the minimum request, progress, result, cancellation, and authorization fields Shrimpy needs without inheriting OMP session semantics.
2. **External worker spike:** drive `omp --mode rpc --no-session` in a disposable repository as a possible coding-worker backend. Verify prompt, steer/follow-up, cancellation, event completion, tool denial, transcript ownership, and whether OMP's structured-result contract is usefully exposed over RPC. The outcome should be a backend comparison, not a runtime switch.
3. **Structured worker result proposal:** add a design note for optional JSON Schema output, immutable worker artifacts, and source-attributed context inclusion using Shrimpy's existing worker records. OMP's `task` result shape is the reference case; Shrimpy's session and authority model remains the owner.

Memory and eval should wait behind the home-kernel and session-authority work. TTSR and snapcompact are watchlist items rather than roadmap candidates.

## Bottom Line

OMP demonstrates how far Pi can be pushed when one product optimizes aggressively for terminal coding. Its best ideas are not the long feature list by itself; they are the contracts that make those features composable: host callbacks, virtual resources, typed child results, durable artifacts, explicit memory mutation, and one engine behind several hosts.

Shrimpy should learn from those contracts while preserving its own noun: the durable resident home. Using OMP as an optional external coding worker could be worthwhile. Making OMP the home would give Shrimpy two agents, two memory systems, two session models, two plugin/discovery systems, and two authorities sharing one process. Keep it shrimple and leave that boundary intact.

## Sources

[Repository snapshot](https://github.com/can1357/oh-my-pi/tree/969062200754ea02cfac922e5ebb8c608c079e15) · [README and feature inventory](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/README.md) · [CLI and entry modes](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/cli-reference.md) · [SDK](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/sdk.md) · [RPC](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/rpc.md) · [Task agents](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/tools/task.md) · [Agent Hub](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/agent-hub.md) · [Approval mode](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/approval-mode.md) · [Memory](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/memory.md) · [Python eval](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/python-repl.md) · [TTSR](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/ttsr-injection-lifecycle.md) · [Compaction](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/compaction.md) · [Collaboration](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/collab.md) · [Extensions](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/extensions.md) · [Skills](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/skills.md) · [Secret obfuscation](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/secrets.md) · [Upstream porting guide](https://github.com/can1357/oh-my-pi/blob/969062200754ea02cfac922e5ebb8c608c079e15/docs/porting-from-pi-mono.md) · [Hashline package](https://github.com/can1357/oh-my-pi/tree/969062200754ea02cfac922e5ebb8c608c079e15/packages/hashline)
