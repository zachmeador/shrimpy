---
status: draft
priority: P3
area: Surfaces
depends_on: []
---

# 🦐 SURFACE-010: ACP Agent Server

## Why

External clients increasingly know how to launch and control an agent through the Agent Client Protocol. Buzz now accepts any ACP-speaking harness, and editors or future orchestrators could use the same narrow process boundary. Shrimpy already has the important runtime pieces—agent profiles, `AgentSession`, context assembly, tools, session persistence, cancellation, and streamed events—but it cannot currently expose them through ACP.

Pi 0.83.0 does not provide a native ACP mode. Its headless RPC mode is a separate Pi-specific JSONL dialect, while the community `pi-acp` adapter launches standalone Pi and would bypass Shrimpy's agent selection, context, session layout, and authority boundaries. Shrimpy therefore needs a thin ACP server over its own session services rather than another subprocess translation layer.

See [codex-session-control.md](../../research/codex-session-control.md) for the broader ACP client/server tradeoffs. This item is only the server direction: let an ACP client drive a Shrimpy agent.

## Current State

- `src/sessions/open.ts` creates Shrimpy-owned Pi sessions and already exposes events needed to observe a turn.
- The CLI has no `shrimpy acp` command, JSON-RPC stdio transport, ACP capability negotiation, ACP session registry, or protocol event mapper.
- There is no settled rule for mapping client-provided working directories, system context, MCP servers, permissions, or session-resume requests into Shrimpy authority.
- Stable ACP v1 is suitable for an initial interoperability target. ACP v2 remains a moving draft and should not define durable Shrimpy state.

## UX Implications

An operator or another application can launch `shrimpy acp --agent <id>` as a machine-facing stdio process. The ACP client initializes the connection, creates one or more sessions, submits prompts, receives streamed updates, and can cancel an active turn. Every session runs the selected Shrimpy agent with its normal profile, context, model, tools, workspace boundaries, and persisted transcript.

This is not a new interactive Shrimpy UI. Standard output is reserved entirely for protocol frames, diagnostics go to redacted standard error, and ordinary users continue to use the TUI and chat surfaces. Unknown agents, unsupported capabilities, invalid framing, and policy conflicts should fail clearly without partially opening a session.

The first version should advertise only behavior it actually honors. An ACP client must not appear to receive filesystem delegation, terminal delegation, MCP attachment, permission mediation, session loading, or active-turn steering when Shrimpy has not implemented those paths correctly.

## Open Decision

Settle whether the first supported contract is deliberately Buzz-minimum or a broader stable ACP v1 agent. The recommended spike is a small standards-compliant server that implements the stable lifecycle required by Buzz—`initialize`, `session/new`, text `session/prompt`, `session/update`, cancellation, and terminal `stopReason`—while keeping every additional capability false until a second real client proves its value.

Also settle whether ACP sessions persist only as ordinary Shrimpy session files or support `session/load` across ACP process restarts. Do not invent a second durable session database or claim load/resume semantics until client session ids can map unambiguously to Shrimpy's authoritative session records.

## Build

- Add a CLI-first `shrimpy acp --agent <id>` entrypoint and keep protocol implementation in a focused `src/acp/` boundary rather than adding ACP behavior to the TUI or gateway orchestration.
- Implement stable ACP v1 JSON-RPC over stdio with strict framing, request correlation, graceful shutdown, bounded input, and standard output reserved for protocol messages. Prefer the maintained ACP SDK with an exact reviewed version unless a measured dependency or compatibility problem justifies a smaller implementation.
- Resolve and validate the selected Shrimpy agent before accepting sessions. Keep agent selection fixed for the process lifetime and do not accept an agent id, profile path, or authority override from ACP prompt text or client metadata.
- Create each ACP session through Shrimpy's existing session/bootstrap services and drive the in-process `AgentSession` API directly. Do not spawn `pi --mode rpc`, standalone Pi, or another Shrimpy CLI process per prompt.
- Maintain an in-memory ACP-session-to-Shrimpy-session registry with one active turn per session and independent concurrency across sessions. Dispose leases and subscriptions on session close or process shutdown.
- Map supported ACP prompt content into normal Shrimpy session input and map Pi/Shrimpy session events into honest `session/update` notifications. Preserve tool-call, text, error, and completion ordering without copying ACP wire objects into Shrimpy's durable transcript schema.
- Map ACP cancellation to the existing in-process abort path and return an accurate terminal `stopReason`. Reject overlapping prompts or unsupported queue/steer extensions unless their negotiated semantics are implemented and tested.
- Keep Shrimpy's agent profile, system instructions, workspace, model policy, tool set, and session admission authoritative. Treat client-provided system/workspace text as lower-priority external session context, not as a replacement for durable agent configuration.
- Do not honor a client-provided working directory outside the selected agent's allowed workspace. Prefer the agent's configured workspace; if an operator needs a different root, require an explicit startup option validated before protocol initialization.
- Parse `mcpServers`, filesystem, terminal, permission, and other authority-bearing fields, but reject unsupported non-empty requests rather than silently granting or pretending to use them. Advertise each capability only after Shrimpy can enforce its policy and lifecycle end to end.
- Keep secrets, complete prompts, tool arguments, environment variables, and private paths out of default diagnostics. Provide correlation ids, method names, session ids safe for display, lifecycle state, and bounded errors on standard error.
- Add protocol fixture tests plus an in-process fake client that covers initialization, multiple sessions, prompt streaming, cancellation, malformed requests, unsupported capabilities, client disconnect, and clean disposal. Add a real `buzz-acp` interoperability smoke test before declaring the initial contract supported.
- Document the supported ACP version, methods, capability flags, authority model, process contract, and known omissions when implemented.

## Boundaries

- ACP agent/server only. Do not add an ACP client for launching Codex, Claude, Pi, or other external agents in this item.
- Do not expose ACP over TCP, WebSocket, streamable HTTP, the public gateway, or an unauthenticated network listener. The first transport is local stdio under the spawning process's authority.
- Do not treat ACP as Shrimpy's durable application model or replace Shrimpy session ids, transcripts, agents, channels, or worker records with protocol objects.
- Do not route through Pi's private RPC protocol merely because its command vocabulary resembles ACP.
- Do not let client capabilities, prompts, environment, MCP definitions, or working-directory fields expand Shrimpy's maximum authority.
- Do not claim complete ACP v1 compatibility when only the negotiated subset is implemented, and do not target draft ACP v2 as the initial stable contract.
- Do not add legacy protocol aliases, compatibility wrappers, migration paths, or error-only placeholder modes.

## Touches

- `src/cli.ts` and `src/commands/` for the CLI entrypoint
- `src/acp/` for transport, methods, session registry, and event mapping
- `src/sessions/open.ts` and adjacent session lifecycle seams
- `docs/reference/` for the implemented protocol and authority contract
- Protocol fixtures and interoperability tests under `test/`

## Done

- `shrimpy acp --agent <id>` completes stable ACP initialization over stdio with no non-protocol output on standard output.
- A client can create multiple independent sessions, submit text prompts, observe ordered streamed updates, and receive accurate stop reasons from the selected Shrimpy agent.
- Cancellation aborts the correct active turn without terminating or corrupting unrelated sessions.
- Unknown agents, malformed frames, overlapping prompts, unsupported authority-bearing capabilities, and client disconnects fail predictably and release all session resources.
- Client input cannot replace Shrimpy profile instructions, switch agents, escape the allowed workspace, change model/tool policy, or attach unapproved MCP servers.
- Shrimpy session files remain the authoritative transcript and contain no ACP-specific durable schema dependency.
- Diagnostics are useful and redact prompt content, tool arguments, environment values, credentials, and private paths by default.
- The supported subset interoperates with the pinned `buzz-acp` release in a real mention, prompt, reply, cancel, and rotate smoke test.
