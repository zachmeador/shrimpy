# SESSION-001: Pi-Native Session Context

Status: review
Priority: P1
Area: Sessions
Depends On: none

## Why

TUI, CLI, and gateway turns should behave like different surfaces over the same
session model. This item replaces the old divergence where some Shrimpy paths
prepared a prompt by prefixing turn context into the durable user message while
gateway channel turns could inject context separately.

That makes session transcripts heavier than they need to be and blurs the
boundary between durable conversation history and ephemeral delivery/runtime
facts.

## Rule

Pi owns session mechanics:

- session files and tree entries
- persisted user, assistant, tool, custom-message, model, and compaction entries
- model restoration
- TUI lifecycle and extension hooks
- provider-request and context transformation timing

Shrimpy owns surface semantics:

- channel and surface event normalization
- channel visibility and the plumbing that asks visible agents whether they wake
- active delivery channel and publication tools
- turn-context assembly
- the decision about which facts are durable transcript versus ephemeral model
  context

Agents own wake and response policy. Session context can expose facts an agent
may use to make that decision, but Shrimpy should not turn context, skills,
memory, or session wrappers into a second wake-policy control plane.

Ephemeral turn context must enter through Pi's provider-bound context path, not
by rewriting the prompt text passed to `session.prompt()`.

## Build

- Add a Shrimpy-owned Pi extension or adapter that registers Pi's `context`
  hook and injects Shrimpy turn context into the model-facing message list.
- Keep `session.prompt(text)` as the durable user-message boundary. The text
  passed to Pi is the thing that should be persisted.
- Use the same injection path for TUI, CLI/direct, gateway/channel, and child
  session turns.
- Remove Shrimpy prompt wrappers that prepend `<context>` to the prompt body.
- Remove post-construction monkeypatching of `session.agent.transformContext`;
  Shrimpy should participate through Pi's extension/resource layer or an
  explicit Pi API.
- Keep the injected context visually and semantically distinct from the user's
  message, with instructions that it is only for the immediately following
  message.
- Preserve slash-command behavior: slash commands should still reach Pi as raw
  commands and should not be hidden behind Shrimpy context prep.
- Add tests that prove:
  - persisted prompts do not contain turn context
  - model-facing context does contain turn context
  - direct/TUI and gateway paths use the same behavior
  - context does not leak from one turn to the next

## Boundaries

- Do not introduce a second session format.
- Do not fork Pi's TUI/session runtime to get this behavior.
- Do not make channels carry instructions; channels carry messages and logs.
- Do not make skills or memory a second control plane for session dispatch.
- Do not use session context injection to smuggle Shrimpy-owned wake policy into
  agent turns. It should carry inspectable facts, not central decisions.
- Do not add bespoke tool-output caps or transcript pruning unless Pi lacks the
  needed primitive at a clear pressure point.
- Do not add legacy compatibility paths for the old prompt-prefix behavior.

## Pi Pressure Points

Pi already exposes the important primitives:

- `Agent.transformContext` runs immediately before provider conversion.
- `pi-coding-agent` wires that into the extension `context` event.
- `before_agent_start` can prepare pending ephemeral context for the current
  prompt, but injection belongs in the `context` event so the extra message is
  provider-facing only.

If Shrimpy needs more metadata than the current `context` event provides, the
preferred extension is a small Pi API such as `session.prompt(text,
{ transientMessages })`, not another Shrimpy wrapper around `prompt()`.

## Progress

- Added a Shrimpy session turn-context controller and Pi `context` extension
  factory.
- Direct/TUI sessions now prepare ephemeral turn context through the controller
  instead of prefixing the prompt.
- Gateway sessions expose message-specific turn context through the same
  `prepareTurnContext` callback that direct/TUI sessions use.
- Removed the post-construction `session.agent.transformContext` monkeypatch.
- Removed the old `shrimpy context` prompt-prefix preview path; the command now
  reports turn context and user message previews separately.
- Left `read_channel` tool output behavior under Pi/tool defaults; no bespoke
  max-result or max-message arguments were added.

## Done

- TUI, direct, gateway, and child turns all call Pi with the durable prompt body
  only.
- Shrimpy turn context is injected through Pi's context hook and is not written
  into the session transcript.
- There is one Shrimpy integration point for ephemeral context injection.
- Session persistence remains Pi-native; no Shrimpy prompt-prefix compatibility
  or migration path is carried forward.
- Tests cover prompt persistence, model-facing context, no cross-turn context
  leakage, and a real Pi session using the extension `context` hook.
