# 🦐 ACP Explainer

Date: 2026-08-30
Status: Research; protocol status checked against official releases

The Agent Client Protocol (ACP) is the wire between an application where someone works with an agent and the program running that agent. The application may be an editor, chat client, or orchestrator. It already has a user interface, a workspace, and permission controls; the agent has a model loop, context, and tools. ACP gives them a shared session language.

The useful mental model is a bidirectional agent session protocol. The client can start sessions and submit prompts. The agent can stream messages and tool activity back, ask the client to perform operations, and report when work stops.

## One ACP Conversation

Suppose an editor wants to run an agent against a repository:

```text
human
  |
  v
editor or chat app                         coding agent
ACP client                                ACP agent
  |                                           |
  |--- initialize(version, capabilities) ---->|
  |<-- selected version and capabilities -----|
  |--- session/new(cwd, MCP servers) -------->|
  |<-- sessionId ------------------------------|
  |--- session/prompt(text + screenshot) ---->|
  |<-- session/update(message chunk) ----------|
  |<-- session/update(tool call) --------------|
  |<-- session/request_permission(command) ----|
  |--- permission outcome -------------------->|
  |<-- session/update(file changes) -----------|
  |<-- prompt response(stop reason) -----------|
```

The client normally launches the agent as a subprocess. Each line on stdin or stdout is one JSON-RPC message. `initialize` chooses a protocol major version and records what each side supports. `session/new` creates agent-side session state. `session/prompt` begins work, `session/update` streams what the UI should show, and the final prompt response carries a stop reason. `session/cancel` can interrupt the active work.

The connection is bidirectional. Most lifecycle calls travel from client to agent, while permissions, filesystem reads or writes, terminal operations, and structured questions can travel from agent to client. One connection can carry several sessions.

For the proposed Shrimpy integration, Buzz or bb would be the ACP client and `shrimpy acp --agent <id>` would be the ACP agent process. The client would keep its room or project UI. Shrimpy would load the selected resident, run its normal model session, and keep its own transcript. ACP would carry the live interaction between them.

## Who Owns What

| Part | Responsibility |
| --- | --- |
| Client | Launch or connect to the agent, collect user input, render updates, expose workspace services, and mediate permissions. |
| Agent | Assemble model context, run the model and tools, manage the session state it promises, and translate work into ACP updates. |
| ACP | Define method names, message shapes, lifecycle ordering, content types, stop reasons, and capability negotiation. |
| Product around them | Define durable identities, projects, transcripts, memory, scheduling, retry policy, and recovery. |

The protocol calls the two roles **client** and **agent**. An ACP agent often looks like a server in implementation because it handles client requests. In `shrimpy acp`, Shrimpy would therefore be both the ACP agent and the process serving the protocol.

## The Actual v1 Contract

ACP v1's portable core covers connection initialization, session creation, text prompts, streamed updates, cancellation, and a final stop reason.

Everything else is discovered during `initialize`. Optional capabilities cover session history and resume, richer prompt content, modes and configuration, client filesystem and terminal services, elicitation, and MCP servers. An omitted capability is unavailable on that connection.

This negotiation is central to ACP. Two implementations can both speak stable v1 while supporting different feature sets. A client should build its UI from the negotiated capabilities, and an agent should request only services the client advertised.

## Multimodal Content

A prompt is an array of content blocks, so one user message can combine instructions with media and referenced files:

| Block | Wire shape | Prompt support |
| --- | --- | --- |
| `text` | UTF-8 text | Required |
| `image` | Base64 data, MIME type, and optional source URI | Requires the agent's `image` prompt capability |
| `audio` | Base64 data and MIME type | Requires the agent's `audio` prompt capability |
| `resource` | Embedded text or base64 binary data with a URI and optional MIME type | Requires the agent's `embeddedContext` prompt capability |
| `resource_link` | URI plus display metadata such as name, MIME type, and size | The agent resolves the referenced content |

The same block shapes can appear in agent messages and tool results sent through `session/update`. An ACP client can therefore send a screenshot with a question, receive an image from an agent or tool, or attach a PDF as an embedded resource or link. The capability handshake describes what the agent accepts as prompt input; the agent's model runtime still decides whether that input reaches a vision or audio-capable model.

Video and live media use the resource path: a client can send a link or embedded binary blob with a video MIME type, while playback, frame extraction, size limits, and timed streaming remain implementation concerns. The first-class media set ends at image and audio; real-time audio or video needs another streaming layer.

ACP v2 keeps the same five content-block types. Its multimodal improvement is structural: complete messages can be replaced, corrected, replayed, or extended with additional blocks under stable message IDs, and receivers can preserve future or custom block types even when they are unfamiliar.

## ACP and MCP

ACP sits in front of the agent; the Model Context Protocol usually sits behind it:

```text
user interface -- ACP --> agent -- MCP --> tools and context servers
```

ACP carries the conversation and work lifecycle. MCP supplies tools and context to the agent. During session creation, an ACP client can tell the agent which MCP servers are available, connecting the two protocols without merging their jobs.

## Where the Common Contract Ends

ACP standardizes communication. The surrounding systems still decide what the messages mean operationally:

| Concern | ACP carries | Authority remains with |
| --- | --- | --- |
| Files and working directories | Absolute paths, `cwd`, and optional client filesystem calls | The launcher, client, agent, and operating-system sandbox |
| Permission prompts | A structured request and selected outcome | The policy and enforcement code on both sides |
| Session persistence | Session identifiers plus optional list, load, resume, close, and delete operations | The agent or product storing the transcript and recovery state |
| Identity and product structure | Implementation information and session identifiers | The product's people, resident agents, rooms, projects, tasks, and memory |
| Provider-specific behavior | Shared content, tool, plan, and extension shapes | The provider's native API or an adapter when ACP has no equivalent |

This boundary is ACP's main tradeoff. A client gains one integration shape across several agents, while the richest provider-specific controls may still need a native path. A `cwd` or approved command also describes protocol intent rather than creating process containment; the launcher must enforce the claimed boundary.

## What Is Stable

| Layer | Status on 2026-08-30 | Meaning |
| --- | --- | --- |
| ACP v1 | Stable; schema release `v1.21.0` | Production interoperability target. Compatible capabilities can continue to join the v1 schema. |
| Subprocess stdio | Stable and recommended | Portable transport for local clients launching agents. |
| Streamable HTTP and WebSocket | Draft | Remote interoperability is still being designed. |
| ACP v2 | Draft; schema release `v2.0.0-alpha.3` | Experimental wire protocol with breaking changes still allowed. |
| Shrimpy ACP | Draft backlog proposal | [SURFACE-010](../backlog/proposals/surface-010-acp-agent-server.md) describes it; implementation is pending. |

The version labels describe different layers. `protocolVersion: 1` is the negotiated wire major. `v1.21.0` is a release of the v1 schema. SDK package majors describe library API compatibility; wire support comes from the negotiated protocol version and schema.

## Why v2 Exists

ACP v1 makes a prompt request the envelope for one turn:

```text
session/prompt starts
  session/update streams while it runs
session/prompt response ends the turn with a stop reason
```

That shape is simple, but it couples accepted input, foreground completion, and session readiness to one request. It becomes awkward when an agent keeps working after a foreground step, when several clients observe the same session, or when streamed output needs correction rather than another appended chunk.

ACP v2 turns the session into a longer-lived stream of identified items and state:

```text
session/prompt is accepted
  messages, tool calls, and terminal output are added or patched by ID
  work can keep updating the session
session state becomes idle and records the foreground stop reason
```

The same patch rules apply across messages, tool calls, and terminal output. File changes gain explicit add, delete, modify, move, copy, binary, and non-text forms. Permission requests gain their own title, description, and extensible subject. Unknown variants have defined forward-compatibility rules.

The direction is toward sessions that can outlive a single turn-shaped request and remain legible to multiple clients, proxies, and richer UIs. That is a meaningful protocol change rather than a feature bundle added to v1.

## v2 Status and Shrimpy

The v2 draft is active. Its public draft appeared on 2026-07-20, followed by three alpha schema releases through 2026-08-20. The TypeScript SDK exposes v2 through an experimental import. The maintainers have published no stabilization date and recommend version negotiation, feature flags, and continued v1 support during experimentation.

Shrimpy's first ACP server should target the stable v1 lifecycle over stdio. The implementation should keep ACP messages at the transport boundary, map them into ordinary Shrimpy sessions, and advertise only capabilities Shrimpy enforces. Version negotiation can leave room for a separate v2 mapper when real clients need its asynchronous session model.

Related Shrimpy research applies ACP to [Codex control](codex-session-control.md), [bb as an agentic IDE](bb-shrimpy-resident-agents.md), [Buzz as a chat environment](buzz-shrimpy-environment.md), and [a possible desktop](gooey-pi-desktop.md).

## Sources

- [ACP architecture](https://agentclientprotocol.com/get-started/architecture), [v1 overview](https://agentclientprotocol.com/protocol/v1/overview), [initialization and capabilities](https://agentclientprotocol.com/protocol/v1/initialization), [content blocks](https://agentclientprotocol.com/protocol/v1/content), and [transports](https://agentclientprotocol.com/protocol/v1/transports)
- [ACP releases](https://github.com/agentclientprotocol/agent-client-protocol/releases)
- [ACP v2 draft announcement](https://agentclientprotocol.com/announcements/acp-v2-draft), [overview](https://agentclientprotocol.com/protocol/v2/overview), [content blocks](https://agentclientprotocol.com/protocol/v2/content), and [migration guide](https://agentclientprotocol.com/protocol/v2/migration)
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)
