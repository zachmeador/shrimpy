# 🦐 What changes from old Shrimpy

## Replacement map

The old paths in this table are under `shrimpy-old/`.

Reuse small filesystem, search, formatting, calendar, model-policy, transport and installation helpers where they still serve the new owner. This maps responsibilities, not folders to move.

| Current responsibility and source | New owner, and what gets deleted |
|---|---|
| `src/app/runtime.ts`; `src/sessions/open.ts`, `bootstrap.ts`, `resolver.ts`, `spec.ts`, `foreground.ts` | Explicit home and host construction. Delete the global workspace composition and foreground session owner. |
| `src/sessions/pool.ts`, `turn-output.ts`; gateway turn and runtime state | Pi admission, inbox, submission settlement and committed views. Delete lane promise chains, completion inference and parallel activity and outcome records. |
| `src/sessions/ownership.ts`, `control.ts`; gateway control messages | One home lock and service operations. Delete competition for transcripts between foreground, gateway and maintenance, and channels used as control transport. |
| Session recording, manifest, transcript store, inventory and search; the copied compaction runner | Pi entries and projection, minimal session metadata and derived queries. Delete the second transcript lifecycle and compaction paths. |
| `src/context/*`, resource loading, included instructions and skills | The durable home-context extension, breadcrumbs and committed provenance. Delete global-runtime dependencies and `ExtensionAPI` bindings. |
| `src/tools/daemon.ts`; channel routing, bus, activity and outbox; `src/agents/channel-policy.ts` | The two message tools, the chat server, which owns routing and delivery, and wake policy in each agent's service. Delete the shared bus and duplicate turn state; keep needed delivery receipts. |
| `src/workers/*` | Helpers on durable's child and background ownership; a focused adapter or skill for Codex. Delete the universal worker supervisor and backend state. |
| `src/watches/*`; gateway watch service and clock | The durable trigger extension. Delete the global clock, execution history and orchestration state. |
| `src/tui/*`, root UI extensions, `src/app/pi-internals.ts` | The attached console client on public components. Delete private `InteractiveMode` patches and runtime lifetime coupling. |
| Telegram and shared surface code; `gateway/web-sidecar.ts`; web JSONL readers | The chat server with Telegram as its first provider, and the API-backed web client. Delete sidecar lifetime coupling and byte-cursor reading. |
| `src/cli.ts`, commands, setup, update, service installers, help and completion | Commands over the new owners, per-home service installation, deterministic setup and update helpers. Delete obsolete registrations and aliases once coverage is reviewed. |

A replaced slice removes its old imports, registrations, unused dependencies, fixtures and instructions. The shipped result has no `legacy` path, dual-engine mode, error-only shim, renamed task manager or second application tree.

## Old command families

The table below says what each old family is for in the replacement, not that each of its verbs comes back.

The current catalog is [src/commands/catalog.ts](../../../shrimpy-old/src/commands/catalog.ts). Before implementation, record its exact entries and the JSON and exit behavior that scripts rely on. Each shipped operation gets a concrete command and a reviewed argument and result contract. Old aliases are removed directly, without shims.

| Current family | Outcome in the replacement |
|---|---|
| Bare launch, initial prompt, `chat`, `run`, `agent tui`, `agent run` | Select, start or attach the right home; reviewed run retention and output; explicit model, thinking and skill overrides. |
| Sessions: new, clear, restore, set, stop, list, search, read, compaction | Split between threads (new, archive, rename, read, search) and the sessions behind them (reset, stop, inspect, compaction), with the new IDs, bounded raw and effective queries, and Pi submission status. Renamed aliases and JSON behavior need review. |
| Models: inspect, resolve, policies, provider addition | Per-home credentials, candidate precedence, session choice versus saved defaults, favorites and local endpoints. |
| Context: composition, files, sources, producers, provenance | Captured requests and labelled previews, and bounded source evidence. Producers are gone, and what replaces them needs no command: breadcrumbs are files in the home. |
| Agents: list, show, inspect, add, set, policy, rename, remove | Home registration, configuration and endpoint policy; registration isn't the runtime. Remove stays explicit and preserves data by default. |
| Skills: list, show, add, update, remove, new, validate | Per-home instruction management and precedence. Pi extension and theme discovery follows its decision above. |
| Channels: list, show, read, search, tail, create, post, bind, unbind, dm, members, join, leave | Reviewed routing, log, thread and recipient operations owned by the chat server. The internal bus is removed. |
| Surfaces, users, presence, owner | Explicit provider bindings, authenticated sender and contact policy, and current presence. Owner fallback and last-active addressing aren't removed silently. |
| Workers: backends, start, list, status, read, send, tail, wait, cancel, close | Helpers and real external CLI workflows. Unsupported backends are proposed removals, not empty placeholders. |
| Workspace: setup, tracking, search, index, status | Explicit home selection, ordinary file search and checkpoints, derived indexes with provenance. Shared global scope needs review. |
| Gateway: install, start, stop, restart, status, logs, uninstall | Service operations for each agent, the gateway and the chat server. Command names and independent shutdown need review. |
| Telegram setup; update dry-run, exact tag or SHA apply, hidden `check-mechanic` | The reviewed preview, guide and apply workflow, and provider setup that preserves files. Mechanic-specific preflight is replaced. |
| Help, version, completion, write-state, status, workspace override | Generated from the real catalog, with home-aware completion and selection. Renamed selection flags need review; no hidden dependency on the old pointer. |
