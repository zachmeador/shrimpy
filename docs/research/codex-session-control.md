# 🦐 Codex Session Control

Date: 2026-07-26
Status: Research update; implementation recommendation

Shrimpy already lets an agent delegate work to Codex through `shrimpy worker`. The current implementation is a useful detached job runner, but it is not an interactive Codex session controller and it does not use the Agent Client Protocol (ACP).

For the protocol's stable shape, capability model, limits, and v2 direction, see the canonical [ACP explainer](acp-explainer.md). This note keeps only the Codex-specific transport decision.

The short recommendation is:

- Keep the current `codex exec` transport while the product contract remains “run one bounded turn, inspect it, then optionally send a follow-up after it stops.”
- Harden that path before adding features to it. In particular, stop inferring outcomes from prose, reduce the default sandbox authority, parse the documented event shape, improve binary/auth discovery, and avoid buffering the complete event log in memory.
- Move the Codex backend to Codex App Server when Shrimpy needs live steering, protocol-aware interruption, approval routing, richer events, thread discovery, or reliable reattachment.
- Do not put ACP between Shrimpy and Codex solely to get better Codex control. The current Codex ACP adapter launches App Server and translates its richer native protocol into ACP. Direct App Server integration is a shorter, more capable Codex-specific path.
- Reconsider ACP if Shrimpy intentionally wants one cross-provider client protocol for Codex, Claude, Pi, and other coding agents, or wants Shrimpy workers to be consumable by external ACP clients. That is a product-level abstraction decision, not a Codex transport upgrade.

## How Shrimpy Controls Codex Today

The public flow is documented by the included `shrimpy-coding-delegation` skill:

1. The calling agent refreshes backend availability with `shrimpy worker backends --refresh`.
2. `shrimpy worker start --backend codex ...` creates a durable Shrimpy worker record and a first turn.
3. Shrimpy launches a detached Node supervisor and immediately returns the worker ID.
4. The supervisor spawns the local `codex` executable, sends a worker-contract prompt over stdin, copies Codex's JSONL stdout and stderr into worker artifacts, and records the final message.
5. The caller inspects the worker through `status`, `read`, `tail`, or `wait`.
6. A later `worker send` creates another turn and invokes `codex exec resume <thread-id> -`.
7. `cancel` and `close` terminate the detached supervisor process group and update Shrimpy's worker state.

The actual Codex invocation is equivalent to:

```text
codex exec \
  -c approval_policy="on-request" \
  -c approvals_reviewer="auto_review" \
  -c sandbox_mode="danger-full-access" \
  --skip-git-repo-check \
  --json \
  --output-last-message <artifact-path> \
  --cd <working-directory> \
  -
```

Follow-up turns use `codex exec resume` with the stored backend thread ID. Shrimpy currently discovers that ID by recursively searching JSON events for several possible session, conversation, or thread keys. The documented current event is more specific: the first event is `{"type":"thread.started","thread_id":"..."}`.

### Command Semantics

| Shrimpy command | What it means for Codex |
| --- | --- |
| `worker start` | Start a new non-interactive `codex exec` process and Codex thread. |
| `worker status`, `read`, `tail`, `wait` | Read or poll Shrimpy's state and artifact files. These commands do not query a live Codex server. |
| `worker send` | Start a new OS process with `codex exec resume` after the prior worker turn has stopped. It is not live steering. |
| `worker cancel` | Send `SIGTERM`, then possibly `SIGKILL`, to the supervisor process group. It is not a Codex protocol-level `turn/interrupt`. |
| `worker close` | Cancel if necessary and mark the Shrimpy worker closed. It does not archive or delete the Codex thread. |

### Persistence and Recovery Boundary

Shrimpy persists its own worker and turn records in `state/workers.json`, stores the Codex thread ID on the worker, and writes per-turn JSONL, last-message, and stderr artifacts under `runtime/workers/`. That is enough to inspect finished work and resume a known Codex thread in a fresh process.

It is not enough to reconnect to an in-flight turn. If Shrimpy restarts and finds a worker marked running whose supervisor PID is gone, reconciliation marks the turn failed. The implementation cannot ask Codex whether a turn is still alive, replay missed events from a server, or reattach to it.

### Current Strengths

- The interface is CLI-first, detached, inspectable, and easy for another Shrimpy agent to compose.
- Shrimpy owns durable worker identity and artifact retention rather than treating the child process as durable state.
- `codex exec` is an official interface intended for scripts and CI, and its `resume` command gives the current design lightweight multi-turn continuity.
- The supervisor/process boundary isolates a failed or timed-out worker turn from the calling agent session.
- The transport has little conceptual machinery and is easy to debug from its captured JSONL and stderr.

### Current Weaknesses

- Shrimpy labels a successful final message `blocked` if the first 1,000 characters contain the word “blocked.” A worker can therefore be misclassified by ordinary prose, while a genuine blocker expressed differently is marked complete.
- The entire stdout JSONL stream is accumulated in memory even though it is also streamed to disk.
- Session-ID extraction is broader and more heuristic than the documented `thread.started.thread_id` contract.
- `danger-full-access` is the unconditional default. OpenAI's non-interactive-mode guidance reserves full access for controlled environments such as isolated runners or containers; it should not be the quiet default for a general local worker.
- OS signals are the only cancellation mechanism, so Shrimpy cannot distinguish a gracefully interrupted Codex turn from a killed process or retain a structured final turn state.
- The child-process transport does not expose approval requests, `turn/steer`, rich item events, thread listing/reading/forking, or usage as first-class Shrimpy concepts.
- Backend discovery depends on a bare executable lookup in the service environment, caches the result, and reports external authentication as unknown. A GUI-bundled Codex executable or a different service `PATH` can be missed even when Codex works in the user's shell.
- `--skip-git-repo-check` and the fixed approval/sandbox overrides are policy choices embedded inside the transport rather than explicit worker policy.
- Compatibility with the installed Codex version is not recorded or checked even though event and App Server schemas evolve with the CLI.

## Available Control Surfaces

| Surface | Model | What Shrimpy gains | Main limitation | Fit |
| --- | --- | --- | --- | --- |
| `codex exec --json` | One subprocess per turn, JSONL events | Small dependency surface, official automation interface, final output, thread resume | No live session-control protocol; process signals for cancellation | Good for today's bounded worker |
| TypeScript Codex SDK | Typed wrapper around the Codex CLI JSONL process | Less hand-written spawning/parsing, `runStreamed()`, thread resume | It preserves the same basic subprocess transport and does not become App Server | Low-risk cleanup, not a control upgrade |
| Codex App Server | Long-lived JSON-RPC-like server over stdio or Unix transport | Native threads, turns, steering, interruption, approvals, history, forks, streamed events, usage, auth/config integration | Larger stateful client and versioned schema surface to own | Best long-term Codex backend |
| Codex MCP server | Two tools, `codex` and `codex-reply`, exposed to an MCP orchestrator | Makes Codex a specialist tool inside a broader agent workflow | Deliberately narrower than full session control; Shrimpy does not currently use MCP as its worker orchestration substrate | Useful only with a broader MCP/Agents SDK decision |
| ACP through `codex-acp` | Cross-agent JSON-RPC protocol translated to Codex App Server | Common lifecycle, permissions, updates, filesystem/terminal collaboration, multiple provider adapters | Adds an adapter and common-denominator model over the native Codex protocol | Best only for deliberate cross-provider uniformity |
| Direct Responses API | Shrimpy implements its own model/tool harness | Maximum policy and tool-loop control | No Codex harness/session semantics; rebuilds the coding agent Shrimpy wants to delegate to | Poor fit |
| Codex desktop host/task tools | Private host integration used by Codex application surfaces | Rich task creation, messaging, waiting, and handoff in supported hosts | Not a documented, stable external API that Shrimpy should depend on | Do not use as a Shrimpy backend |

## Codex App Server

App Server is the interface behind rich Codex clients. OpenAI describes it as the maintained, first-class integration path for clients that need the full Codex harness, while recommending the SDK or exec path for simpler automated jobs.

Its current native lifecycle maps closely to what a richer Shrimpy worker wants:

- `initialize` negotiates capabilities.
- `thread/start`, `thread/resume`, `thread/list`, `thread/read`, `thread/fork`, and archive operations manage durable conversations.
- `turn/start` begins work.
- `turn/steer` adds input to an active turn.
- `turn/interrupt` performs protocol-aware cancellation.
- Server notifications stream item, plan, diff, command, file, reasoning, token, and lifecycle updates.
- Server-initiated requests carry approval decisions back through the client.
- Codex can generate version-matched TypeScript or JSON schemas for the installed server.

This is a better semantic match than repeatedly spawning `exec` once “worker” means a session that remains controllable while it runs. A managed App Server process can host multiple threads, so Shrimpy need not run one daemon per worker. A practical shape is one supervised local Codex transport per Shrimpy gateway, with backend thread IDs remaining attached to Shrimpy worker records.

The stable local choice is stdio, or a local Unix transport if process architecture calls for it. The documented WebSocket surface and current `remote-control` command are experimental and should not be foundational.

The cost is real: Shrimpy must own initialization, request IDs, event routing, per-thread subscriptions, reconnect policy, approvals, compatible schema generation, and server-version testing. That work is justified by richer product behavior, not merely by aesthetic preference for JSON-RPC.

## ACP as a Codex Control Surface

ACP matters here when cross-agent uniformity is the goal. Its generic lifecycle and limits are described in the [ACP explainer](acp-explainer.md); the Codex-specific question is whether Shrimpy benefits from inserting an adapter in front of Codex App Server.

For Codex, however, ACP is currently an adapter:

```text
Shrimpy → ACP client → codex-acp → Codex App Server → Codex
```

The maintained `agentclientprotocol/codex-acp` package starts Codex App Server and translates ACP requests and Codex events. It supports approvals, sandbox/model configuration, tools, file changes, terminals, reasoning, plans, web and image events, usage, review, subagent metadata, and client-provided MCP servers. It also pins a compatible Codex package and regenerates App Server types; its development notes warn that substituting another local Codex version may be incompatible.

That adapter is useful when ACP uniformity is itself valuable. It is not a more native or more direct Codex interface, and a common protocol can omit or flatten provider-specific behavior. OpenAI's own harness guidance makes the same tradeoff explicit: cross-provider protocols reduce integration count but expose a common subset, whereas App Server exposes the complete Codex harness.

For a Codex-only backend that needs rich control, App Server remains the shorter and more capable path. ACP becomes worth the extra layer when Shrimpy deliberately wants one client contract across Codex and other agents, or wants external ACP clients to drive Shrimpy agents. Brittle spawning, event parsing, and result classification do not require that product-level abstraction.

## Recommended Path

### 1. Harden the Existing Exec Backend

Keep the present worker contract while making its meaning explicit and reliable:

1. Parse `thread.started.thread_id` directly, retain a narrow compatibility error with the raw event artifact, and fail clearly if no new-thread ID is observed.
2. Stream-decode JSONL and write it to the artifact without retaining the complete log in memory.
3. Replace prose inspection with a structured Shrimpy worker-result envelope such as `outcome: "complete" | "blocked" | "failed"`, `summary`, `artifacts`, and `blocker`. Codex `--output-schema` can enforce the final response shape, or Shrimpy can require a machine-readable final block.
4. Separate transport completion from task outcome. Exit status and Codex turn events determine transport state; the structured worker report determines complete versus blocked.
5. Default to `workspace-write` with a bounded working directory. Make full access, approval policy, and git-repository bypass explicit named worker policies.
6. Add an executable-path configuration or robust resolver, run an actual auth/preflight probe, record the detected Codex version, and make availability cache refresh behavior visible.
7. Put size bounds on retained events and logs while preserving enough tail and final output for diagnosis.
8. Rename or document `worker send` as post-turn continuation until active steering exists.

These changes improve the current feature without committing Shrimpy to a new transport.

### 2. Prototype App Server at the First Rich-Control Feature

Use a narrow spike before replacing the backend. The acceptance test should prove:

1. Start one supervised App Server and initialize a generated, version-matched TypeScript client.
2. Start two Codex threads and correctly route interleaved events.
3. Persist Shrimpy worker-to-thread mappings and resume them after restarting the Shrimpy client.
4. Steer a running turn, interrupt another, and distinguish interruption from process failure.
5. Surface an approval request through a Shrimpy-owned policy decision.
6. Preserve the existing CLI contract and artifact trail.

If this works cleanly, introduce a transport boundary such as `CodexWorkerBackend` with `startThread`, `startTurn`, `steerTurn`, `interruptTurn`, `subscribe`, `readThread`, and `close`. Keep Shrimpy lifecycle and policy above it.

### 3. Evaluate ACP Separately as a Multi-Backend Initiative

Do not make ACP a hidden implementation detail of the Codex migration. Prototype it only when at least two real backends need the same lifecycle. Compare the stable ACP v1 behavior of `codex-acp`, a Claude adapter, and Pi's ACP support against a Shrimpy-owned capability matrix. Preserve backend-native identifiers and expose unsupported operations honestly instead of pretending all agents are identical.

## Decision

The current approach is reasonable for the feature Shrimpy actually ships: detached, bounded Codex turns with inspectable artifacts and later resume. It is no longer the best mechanism if the intended feature is “Shrimpy agents can actively control Codex sessions.”

For that richer goal, direct Codex App Server integration is the best next architecture. ACP is the best candidate only for a broader, explicit decision to make Shrimpy a provider-neutral coding-agent client or server. The TypeScript SDK is a worthwhile implementation cleanup if Shrimpy stays on bounded exec turns, while Codex MCP and the direct Responses API solve different orchestration problems.

## Sources

- [OpenAI Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [OpenAI Codex CLI command reference](https://learn.chatgpt.com/docs/developer-commands#codex-exec)
- [OpenAI Codex SDK](https://developers.openai.com/codex/sdk)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server)
- [OpenAI Codex MCP server](https://developers.openai.com/codex/guides/agents-sdk)
- [OpenAI: Unlocking the Codex harness](https://openai.com/index/unlocking-the-codex-harness/)
- [OpenAI Codex TypeScript SDK source](https://github.com/openai/codex/tree/main/sdk/typescript)
- [OpenAI Codex Python SDK API reference](https://github.com/openai/codex/blob/main/sdk/python/docs/api-reference.md)
- [ACP protocol background and status](acp-explainer.md)
- [Codex ACP adapter](https://github.com/agentclientprotocol/codex-acp)
