# 🦐 bb and Shrimpy: Resident Agents in an Agentic IDE

Date: 2026-08-07
Status: Research

This note examines how Shrimpy could be interesting in or alongside [bb](https://github.com/get-bb/bb) without assuming that Shrimpy needs a dedicated bb integration. The useful question is not how to connect two agent runtimes for its own sake. It is whether their different core abstractions create a product shape that neither has alone.

For ACP's protocol mechanics, stability, and limits, see the canonical [ACP explainer](acp-explainer.md). This note owns the bb-specific product and authority questions.

Primary sources checked:

- [bb README](https://github.com/get-bb/bb/blob/main/README.md)
- [bb vision](https://github.com/get-bb/bb/blob/main/docs/VISION.md)
- [bb system overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md)
- [bb repository overview](https://github.com/get-bb/bb/blob/main/docs/repository-overview.md)
- [bb configuration, including custom ACP agents](https://github.com/get-bb/bb/blob/main/docs/configuration.md)
- [bb packaged app, CLI, and SDK](https://github.com/get-bb/bb/blob/main/packages/bb-app/README.md)
- [bb plugin SDK](https://github.com/get-bb/bb/tree/main/packages/plugin-sdk)
- [bb official Tasks plugin](https://github.com/get-bb/bb/tree/main/official-plugins/tasks)
- [bb official Memory plugin](https://github.com/get-bb/bb/tree/main/official-plugins/memory)
- local Shrimpy reference docs: [overview](../reference/overview.md), [runtime](../reference/runtime.md), [sessions](../reference/sessions.md), [channels](../reference/channels.md), and [tools](../reference/tools.md)
- local Shrimpy ACP work: [ACP explainer](acp-explainer.md), [SURFACE-010](../backlog/proposals/surface-010-acp-agent-server.md), and [SURFACE-008](../backlog/proposals/surface-008-buzz-chat-adapter.md)

bb is in active development, and its own README says that workflows and surfaces are still evolving. This note describes the repository and documentation inspected on the date above, not a stable external contract.

## Finding

The strongest relationship is:

> bb gives agents somewhere to work. Shrimpy gives an agent somewhere to come from and return to.

bb is a programmable workspace for coding agents. Its central unit is the thread: a bounded conversation with a provider, attached to a project and environment, emitting an append-only stream of work events. It is unusually strong at selecting providers, provisioning local or remote workspaces, following and steering live work, delegating child threads, and exposing the same operations through app, CLI, HTTP API, and SDK.

Shrimpy is a home for persistent agents. Its central unit is the resident: an agent with a durable identity, context, skills, files, sessions, channel relationships, authority, and watches. A Shrimpy agent can participate in many conversations and obligations without being reduced to any one task or repository.

Those orientations are complementary when kept separate:

- bb is an execution and observation plane for project work.
- Shrimpy is an identity, relationship, and attention plane for a persistent agent.
- A bb thread is a job; a Shrimpy agent can be the colleague who enters, commissions, follows, or learns from that job.

The uninteresting version is to make Shrimpy another generic coding-provider wrapper or to copy bb's threads, tasks, memory, and UI into Shrimpy. The interesting version is to let a durable resident cross into bb-managed work without surrendering its identity and without making either system own the other's state.

This does not currently justify a bb-specific feature or plugin. It does make bb a compelling real client for the generic ACP server already proposed in SURFACE-010, and it suggests a separate outbound experiment in which a Shrimpy resident commissions bb through its public CLI or SDK.

## The Different Authoritative Nouns

The most important design fact is that the systems do not mean the same thing by an agent session.

| Concern | bb | Shrimpy |
| --- | --- | --- |
| Primary durable actor | Provider-backed work is represented by a thread | A configured agent is a persistent actor |
| Unit of work | Thread, standard or manager, with optional child threads | Turn inside a private session, or a separately recorded worker run |
| Place | Project plus an environment bound to a host and workspace | One file-backed home workspace, with an agent-owned configured `cwd` |
| Shared communication | Thread event stream and app surfaces | Durable channels separated from private sessions |
| Time and initiative | Thread lifecycle, task delegation, plugin services and schedules | Agent-owned watches that route attention through channels |
| Provider identity | A provider/model selected for a thread | An implementation detail beneath the durable agent profile and session |
| Memory | Optional official cross-provider Memory plugin with global/project scopes | Agent files, context, vault, sessions, channel evidence, and agent-owned memory direction |
| Planning | Manager/child threads and official Tasks plugin | Ordinary agent reasoning, channels, watches, skills, and workers |
| Main inspection surface | App plus CLI/API/SDK backed by SQLite and event streams | Ordinary workspace files plus CLI and read-only inspector |

bb's system overview explicitly names the thread as the unit of work. A thread records a provider conversation, lifecycle state, and append-only events; manager threads may own children. An environment binds a workspace to a host and may be automatically cleaned when managed work no longer uses it. The host daemon provisions workspaces and runs provider processes, while the server, UI, and CLI coordinate and display them.

Shrimpy instead gives one agent many session identities: local, channel, and worker sessions all belong to the same agent. Channels are the shared evidence and routing surface; sessions remain private working context. Watches belong to agents and use normal channel delivery, rather than creating a separate global scheduler abstraction. The same resident may therefore appear in a terminal conversation, a home channel, a Telegram thread, a scheduled review, and a delegated coding job while retaining one profile and home.

This creates a useful conceptual distinction:

- A bb provider answers: **what harness should do this work here?**
- A Shrimpy agent answers: **who is responsible, what do they know, and what do they continue caring about afterward?**

If Shrimpy enters bb, it should preserve that distinction rather than translate one data model into the other.

## What bb Already Covers

Several obvious pitches for Shrimpy inside bb are already weak because bb covers them directly.

### Provider orchestration and live work

bb already launches and mixes multiple coding-agent providers, including Codex, Claude Code, Pi, Cursor through ACP, and other ACP-compatible agents. Threads can be followed live, steered, queued, handed off, or managed through child threads. The app, CLI, HTTP API, and Node SDK expose the same core system, and scripts launched by bb receive thread and server context in their environment.

Shrimpy should not recreate bb's provider picker, event normalization, worktree lifecycle, host daemon, multi-machine dispatch, thread steering UI, or child-thread graph. If a Shrimpy resident needs those behaviors, bb is already the better owner.

### Tasks and delegation

bb's official Tasks plugin is a substantial tracker rather than a toy checklist. It has projects and folders, task keys, statuses, priorities, labels, subtasks, comments, attachments, agent presets, task mentions, a CLI, and delegation that creates and attaches worker threads. Workers receive task context and a report-back contract, while task comments can notify the latest responding agent thread.

A Shrimpy-to-bb idea should therefore not begin with a second task schema or an automatic mirror from bb tasks into Shrimpy channels. A home agent may care about a promise or obligation represented in bb, but bb should remain authoritative for the coding task and its linked threads.

### Cross-provider memory

bb's official Memory plugin provides global and project scopes, private SQLite storage, an injected summary catalog, FTS5 retrieval, provenance, tags, importance, pinning, version history, and an agent-facing CLI taught through an installed skill. It exists specifically to avoid splitting useful memories across provider-native systems.

Shrimpy is not differentiated merely because it can persist facts. The distinctive part is ownership and scope: a Shrimpy resident's home includes identity, relationships, channel history, files, watches, and potentially personal or cross-domain context that should not be flattened into bb-global or repository memory. If the same fact is useful only for work in a bb project, bb Memory may be its better home. If it changes how a resident understands a person, commitment, or long-lived role, it may belong in Shrimpy. Copying every item both ways would create uncertain authority and stale contradictions.

### Instructions, skills, plugins, and schedules

bb can inject user- and project-level `AGENTS.md`, loads user/project/plugin skills, and exposes a broad plugin SDK with backend services, schedules, agent enrichment, CLI commands, RPC, panels, composer customization, storage, and realtime events. Shrimpy cannot claim uniqueness simply from Markdown skills, prompt enrichment, a scheduler, or an extension point.

The sharper Shrimpy claim is that these resources belong to named resident agents inside an inspectable home, not merely to the user, repository, provider, or application installation.

## Interesting Product Shapes

### 1. A resident goes to work in bb

bb supports manually registered ACP agents. A command, arguments, environment, optional working directory, model-discovery behavior, reasoning controls, and logo can define a provider that appears in bb's provider and model pickers. This is a direct conceptual fit for the proposed `shrimpy acp --agent <id>` process from SURFACE-010.

The resulting thread could have a clean split:

- bb owns the project, selected environment, host, workspace lifecycle, thread event stream, steering, app presentation, and handoff controls.
- Shrimpy owns the selected agent's identity, stable instructions, home context, model policy, skills, maximum tool authority, and its own durable session record.
- ACP carries prompts, updates, cancellation, and only the capabilities both sides honestly negotiate.

The value is not that Pi can run inside another IDE. bb already has a pinned Pi runtime. The value is that the same Shrimpy maintainer, mechanic, documentation steward, or story-world resident can appear in a bb thread without being reconstructed as a one-off preset.

A preset is repeatable configuration. A resident is a continuing actor. The difference matters only if the agent actually accumulates useful files, relationships, role-specific judgment, or obligations between jobs.

This shape also exposes the hardest boundary: the resident's home and the thread's workplace are not the same directory. Shrimpy sessions currently default to the agent's configured `cwd`, while bb expects a provider process to work in the thread environment. A viable resident must be able to bring its home context into an explicitly admitted bb workspace without treating the workspace as its home or allowing client metadata to silently expand its authority.

That is a more important design problem than ACP framing. It asks whether Shrimpy can model a resident temporarily working somewhere else.

### 2. A home agent commissions work in bb

The inverse direction may produce more immediate value and less lifecycle conflict. A user continues talking to a Shrimpy resident through the TUI, a home channel, or an external chat surface. When the conversation produces a bounded coding job, the resident uses bb's CLI or SDK to create a thread with the right project, environment, provider, model, reasoning level, and permission mode.

For example:

> The deployment felt brittle yesterday. Ask a strong coding agent to investigate the release path, make no changes, and tell me if this is one bug or accumulated design debt.

Shrimpy remains the conversational principal. bb performs and records the bounded investigation. The resident can inspect progress, supply a follow-up, wait for completion, and translate the result back into the user's normal channel. If the result creates a durable commitment, the resident can record or schedule that commitment without making bb the user's whole personal environment.

The responsibility split would be:

- Shrimpy owns the relationship with the user, interpretation of broader intent, interruption policy, and return communication.
- bb owns execution, workspace provisioning, provider lifecycle, thread evidence, and coding-specific delegation.
- The selected coding provider owns the implementation turn inside the authority bb grants it.
- Any promoted artifact or task remains in the repository or bb Tasks rather than being copied into Shrimpy state by default.

This is more like hiring a workshop than embedding one. It fits Shrimpy's philosophy of leaning on a real runtime until it becomes the constraint, and it avoids making provider orchestration a new Shrimpy core concern.

### 3. Longitudinal stewardship above repositories

A durable resident can notice patterns that are difficult to express inside one project thread:

- several repositories are blocked by the same deployment assumption;
- a decision in a coding thread conflicts with a promise made in a home conversation;
- an investigation completed but the person who requested it has not received a useful answer;
- the same maintenance task repeatedly produces the same repair and should become a skill or documented convention;
- a result matters to a non-coding project, personal plan, or another resident agent;
- a thread is technically complete while the larger obligation remains open.

bb supplies unusually rich evidence for this role because thread events expose messages, tool calls, file changes, lifecycle state, and child work. Shrimpy supplies agent-owned time and attention through watches and channels. The combination could support a maintainer who cares about a system over months rather than a manager thread that exists for one tree of work.

This should not imply automatic ingestion of every bb event into a resident's prompt. A better shape is progressive, deliberate retrieval: the resident receives a compact completion or change signal, inspects the relevant thread through bb when needed, and decides whether anything merits a durable note, task update, message, or future watch. Thread logs remain evidence, not memory by themselves.

### 4. A small resident team uses bb as a shared workshop

Several Shrimpy agents could carry distinct long-term roles into the same bb projects:

- a maintainer who knows architectural intent and recurring tradeoffs;
- a mechanic responsible for setup, repair, dependency health, and operational sharp edges;
- a documentation steward who follows implementation changes into reference material;
- a cautious reviewer whose authority and working style remain stable across repositories;
- a project character or domain specialist whose identity is meaningful beyond coding competence.

bb can already implement temporary roles through presets, instructions, manager threads, and provider choice. Resident agents become interesting only when the roles have genuinely different histories, relationships, files, and responsibilities. If all four are just prompt variants, bb presets are the simpler and more honest abstraction.

### 5. Reflection after work returns home

When a bb job ends, a resident could review the outcome for consequences outside the patch itself:

- Did the work reveal a stable project convention worth documenting?
- Did it invalidate something in the resident's context or vault?
- Did it create a promise that needs follow-up next week?
- Did a worker repeatedly misunderstand the same instruction, suggesting a skill improvement?
- Was the task expensive or risky enough to change how similar work should be delegated?

This is not a reason to copy the complete bb transcript. It is a reason to preserve a small, inspectable return path from execution evidence into agent-owned reflection. The resident should cite the bb thread or artifact it used, and any updated Shrimpy file should remain an explicit change rather than an opaque automatic memory mutation.

## Interface Shapes

The systems expose several possible seams. They are not equally interesting.

| Shape | What it means | Strength | Main risk | Assessment |
| --- | --- | --- | --- | --- |
| Shrimpy as an ACP provider in bb | bb launches `shrimpy acp --agent <id>` for a thread | Makes a real resident selectable in bb and exercises the generic ACP server | Dual session ownership and workspace-authority mismatch | Strongest inbound experiment; no bb plugin required |
| Shrimpy operates bb through CLI or SDK | A resident creates, waits on, reads, steers, or hands off bb threads | Keeps bb authoritative for coding work and Shrimpy authoritative for the user relationship | Shrimpy may grow accidental orchestration policy around bb | Strongest outbound experiment; keep it an external capability first |
| bb plugin for Shrimpy | A plugin adds resident status, channels, watches, or actions to bb's UI | Could make cross-system state visible in the coding workspace | Large UI/state integration before a product need is proven | Defer until a repeated UI pain exists |
| Mirror bb threads into Shrimpy channels | Every bb event or message becomes a Shrimpy channel message | Makes bb activity visible to gateway agents | Duplicate logs, replay cursors, loops, noisy prompts, confused lifecycle | Avoid by default |
| Use Shrimpy as bb's memory backend | bb agents read and write Shrimpy resident files as common memory | One apparent source of continuity | Breaks agent ownership and competes with bb Memory | Poor general fit |
| Use bb Tasks as Shrimpy's obligation system | Home-agent commitments become bb tasks | Strong coding-task UI and delegation | Forces non-coding relationships and promises into a project tracker | Use selectively, never globally |
| Rebuild bb behavior as Shrimpy workers | Shrimpy directly owns providers, environments, event streams, and steering | One product boundary | Duplicates bb's core and expands Shrimpy dramatically | Do not pursue because bb exists |

The first two seams compose cleanly and remain useful independently:

- ACP lets bb call a resident.
- CLI/SDK lets a resident call bb.

They should not be bundled into one bidirectional integration. Each direction has a different authority model, lifecycle, and user story, and either may prove valuable without the other.

## Boundary Questions

### Which transcript is authoritative?

If bb launches Shrimpy through ACP, bb needs its thread event stream for observation and steering, while Shrimpy needs its session transcript for the resident's actual model context and durable history. Both records are legitimate, but they serve different systems.

The boundary should be:

- Shrimpy's session is authoritative for exactly what the resident saw, did, and retained as model context.
- bb's thread is authoritative for project-work lifecycle, environment, provider events, app presentation, and handoff.
- Neither system promises byte-for-byte mirroring of the other.
- Cross-links use stable identifiers such as the bb thread id and Shrimpy session id rather than copied protocol objects.
- A reset or archive in one system does not silently rewrite the other's history.

SURFACE-010 already recommends keeping ACP objects out of Shrimpy's durable transcript schema. bb strengthens that recommendation: external clients will have their own durable nouns, and Shrimpy should not adopt each client's data model.

### Who owns the working directory?

This is the critical unresolved question for the inbound ACP shape.

bb normally launches a provider in the thread workspace. Shrimpy normally opens a selected agent in its configured `cwd` and treats the agent profile and session policy as authoritative. Silently choosing either side is wrong:

- forcing the resident to work only in its home makes it a poor coding provider for bb;
- accepting any client-provided path allows an external client to relocate the agent and possibly expand authority;
- copying project files into the Shrimpy home confuses ownership and cleanup;
- treating a disposable bb environment as durable Shrimpy memory loses information when bb legitimately removes it.

The conceptual requirement is an explicit visiting-workspace grant: the operator chooses that a named resident may work in the bb-provisioned directory for this session, Shrimpy validates it within the resident's ceiling, and the grant does not redefine the resident's home. Whether that is expressed through a startup option, inherited process directory, manifest, or negotiated ACP capability is an implementation decision for later.

### Which instructions win?

bb can inject user-level and project-level instructions and skills regardless of provider. Shrimpy assembles a stable system prompt from workspace and agent resources and deliberately suppresses ambient instruction discovery so its context remains inspectable.

A safe order would preserve the resident's identity and authority while still giving the workplace a voice:

1. Shrimpy system and agent profile remain authoritative for identity and maximum authority.
2. The explicitly admitted bb project guidance becomes external workplace context.
3. Thread prompts and mentions remain user/session input.
4. No bb instruction may switch the selected resident, replace `SOUL.md`, widen tools, attach unapproved MCP servers, or change the resident's durable home.

The two systems should show the effective instruction sources during inspection. Hidden double-injection would make surprising behavior difficult to diagnose.

### Which memory owns a fact?

Running bb Memory and Shrimpy resident memory together is plausible only with a scope rule:

- bb Memory owns reusable global or project facts intended for whichever provider works in bb.
- Shrimpy owns the resident's personal context, relationships, commitments, and agent-specific working model.
- Repository documentation owns stable facts that should travel with the code and be reviewable by humans.
- Thread and channel logs remain evidence, not memory products.

The resident may retrieve bb Memory while working in bb, but it should not automatically import the catalog into its home. Conversely, bb should not inject private Shrimpy relationship context into every provider. Promotion between scopes should be an explicit agent or human act with provenance.

### Which scheduler or task system owns follow-up?

bb Tasks is appropriate for project work that needs statuses, attachments, delegation, and linked coding threads. A Shrimpy watch is appropriate when a named resident should pay attention at a time, inspect a condition, or communicate through a channel. The same obligation should not normally be active in both.

Examples:

- "Implement the release preflight" belongs in bb Tasks.
- "Check whether the release preflight has helped after two releases and ask me" may belong to the maintainer's Shrimpy watch.
- "Run this repository audit every Monday" could live in either system; choose the one that owns the result and audience rather than duplicating it.

### Who mediates permissions and cancellation?

bb has per-thread permission modes and machine ceilings. Shrimpy has agent and per-channel session-policy ceilings, tool allowlists, optional native containment, and its own cancellation lifecycle. ACP can carry permission requests and cancellation, but negotiation must not make either side's UI imply authority the other side cannot enforce.

The effective authority must be the intersection, not the union:

- bb may narrow what the thread may do in its environment.
- Shrimpy may narrow what the resident may do anywhere.
- the resident runs only when both permit the operation;
- an unsupported permission request fails rather than silently falling back;
- bb cancellation stops the correct active Shrimpy turn but does not delete the resident or corrupt unrelated sessions.

### How is identity mapped?

A bb provider id such as `acp-shrimpy-maintainer` is not itself a durable Shrimpy identity. The selected Shrimpy agent id should be fixed by the launched command or trusted configuration for the process lifetime. Prompt text, project files, or ACP metadata must not switch the process to another resident.

The bb thread id can be useful correlation, especially because bb supplies `BB_THREAD_ID` to launched scripts, but it should remain external provenance rather than becoming the resident's identity. If one process serves multiple ACP sessions, each external session needs an unambiguous mapping to a Shrimpy session key and one active turn at a time.

### What happens when the workplace disappears?

bb may clean a managed environment when no unarchived thread uses it. Shrimpy must assume that visited workspaces can be temporary. A resident should not store long-lived memory or irreplaceable artifacts only inside that environment. Before the thread is archived, meaningful results should live in the repository, an attached artifact, bb task/comment, or an explicit Shrimpy-owned note that points back to evidence.

## Relationship to Existing Shrimpy Work

### SURFACE-010 is the enabling boundary

SURFACE-010 proposes a stable ACP v1 server over stdio, launched as `shrimpy acp --agent <id>`, with fixed agent selection, multiple sessions, streamed updates, cancellation, honest capabilities, Shrimpy-owned context and authority, and ordinary Shrimpy session files as the durable record. It currently names Buzz as the interoperability client.

bb makes the proposal more general and more valuable. Buzz tests a resident participating in an external chat environment. bb tests a resident participating in an externally managed coding workspace. Supporting both would show that ACP is genuinely a Shrimpy agent/server boundary rather than a Buzz-specific adapter.

This research does not require changing SURFACE-010's scope now. If that item is implemented, bb is a strong second smoke client after the minimum protocol works. The important additional test would be the explicit visiting-workspace authority described above.

### SURFACE-008 remains a separate Buzz concern

The revised Buzz proposal assigns chat identity, relay connectivity, mention filtering, queues, and visible history to Buzz while Shrimpy owns the resident and ACP sessions. bb suggests the same architectural taste—external products should retain their native nouns—but the two clients are not one integration:

- Buzz is a human communication environment.
- bb is a coding execution environment.
- both may launch the same resident through ACP.
- neither should be mirrored into Shrimpy channels merely because ACP is involved.

### Outbound bb use resembles a worker backend, but should start looser

Shrimpy already has Pi and Codex workers for detached coding delegation. bb could eventually act as a higher-level external worker backend with provider choice, managed environments, live steering, handoff, and richer observation. That is tempting, but prematurely naming bb a worker backend would force Shrimpy to normalize bb thread lifecycle into its worker schema.

The lighter first interpretation is simply that `bb` is an agent-friendly CLI and `BBSdk` is an external tool a resident can use. Repeated successful use can reveal whether a durable `backend: bb` abstraction is warranted. Until then, the resident can keep a bb thread id in an ordinary project note or channel message and inspect it on demand.

## Questions Worth Testing

These are research probes, not a proposed integration roadmap.

### Probe A: resident continuity

Launch one named Shrimpy maintainer as a custom ACP provider in two separate bb threads for the same repository. Determine whether its durable identity and selected context produce useful continuity beyond what bb project instructions, skills, and Memory already provide.

The probe fails if the result is indistinguishable from a bb preset or if the necessary resident context creates prompt bulk, privacy surprises, or conflicting instructions.

### Probe B: visiting workspace authority

Give the resident an explicitly approved bb-managed worktree while keeping its home elsewhere. Verify path authority, instruction precedence, tool policy, cleanup behavior, and what survives after the bb environment is removed.

The probe fails if safe behavior requires treating the worktree as the resident's home, accepting arbitrary client paths, or maintaining a second copy of the repository.

### Probe C: commission and return

From an ordinary Shrimpy conversation, ask a resident to create a read-only bb investigation thread, follow it, and report the conclusion back to the originating channel with a link or identifier. Do not add a bb plugin, mirrored channel, new task schema, or Shrimpy core command for the probe.

The probe succeeds if the user experiences one coherent relationship while bb remains independently inspectable. It fails if the resident must continuously poll noisy events, cannot recover the thread, or obscures which system performed and authorized the work.

### Probe D: memory scope

Let bb Memory contain repository conventions while the Shrimpy resident retains personal commitments and role history. Run work that needs both, then inspect whether the agent can explain where each fact came from and where a new fact should be stored.

The probe fails if facts are silently duplicated or if neither the human nor the agent can tell which store is authoritative.

## Non-Goals and Failure Modes

- Do not create a bb-specific Shrimpy surface. bb threads are not chat transport channels in the Shrimpy sense.
- Do not mirror all bb events into `channels/*.jsonl`. A compact notification plus on-demand inspection is safer and clearer.
- Do not make Shrimpy the backing database for bb Memory, Tasks, projects, threads, or environments.
- Do not make bb the backing database for Shrimpy identities, relationships, watches, or private session context.
- Do not load a Shrimpy resident merely to run the same generic coding prompt that native Pi, Codex, or Claude could run more directly.
- Do not treat a provider picker entry as proof that identity continuity is useful.
- Do not let project instructions or ACP metadata replace the selected agent's profile or widen its authority.
- Do not assume that bb's permission display proves Shrimpy containment, or that Shrimpy's tool list proves bb workspace containment.
- Do not maintain two active task records, schedules, or retry loops for one obligation.
- Do not build a bb plugin until a recurring need exists for Shrimpy-specific state inside bb's UI that the CLI, SDK, links, and ordinary provider presentation cannot satisfy.
- Do not put bb orchestration into Shrimpy core merely because bb is programmable. A skill, resident convention, or external command may remain the right level indefinitely.

## Recommendation

Keep the relationship conceptual and protocol-shaped for now.

1. Treat bb as evidence that SURFACE-010 should be a generic, honest ACP agent boundary, not only a Buzz enabler.
2. If SURFACE-010 is built, use bb as a second real client and focus the test on resident identity plus an explicitly admitted external workspace.
3. Separately explore Shrimpy-to-bb commissioning through the existing `bb` CLI or `BBSdk`, without adding a Shrimpy integration layer first.
4. Let bb retain authority over projects, environments, threads, coding tasks, provider events, and execution UI.
5. Let Shrimpy retain authority over residents, home context, relationships, channels, watches, session policy, and return communication.
6. Use bb Memory for cross-provider work facts and Shrimpy files for resident-owned context; promote between them explicitly rather than synchronizing.
7. Reject any design whose main effect is duplicated logs, duplicated tasks, duplicated memory, or another provider orchestrator inside Shrimpy.

The product test is simple: does the user feel that the same agent went somewhere, did or commissioned serious work, and came back with better judgment and an intact relationship? If not, native bb providers and presets are enough.

## Bottom Line

bb and Shrimpy are most interesting together precisely because they should not collapse into one system. bb is shaped around work that can be started, observed, steered, delegated, and completed. Shrimpy is shaped around agents that persist before and after any one piece of work.

The promising object is therefore not a bb integration. It is a resident agent with a home-work boundary: able to enter a bb project or hire bb to perform a job, while identity, authority, memory scope, and responsibility remain legible on both sides.
