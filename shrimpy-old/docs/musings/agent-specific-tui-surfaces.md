# 🦐 Agent-Specific TUI Surfaces

Date: 2026-07-14
Status: Draft

## Purpose

Explore a TUI where entering an agent changes more than the prompt and transcript. An agent could optionally bring its own lightweight visual surface: a dashboard, theme, commands, labels, or other small pieces that make the agent feel like an actual app rather than one more personality inside the same chat shell.

The motivating examples are straightforward:

- a career agent could show recent applications, current stages, follow-ups, and the next useful action
- a finance agent could show balances, cash flow, upcoming bills, budget drift, and stale data warnings
- a less application-shaped agent might only change the color theme, title, or header treatment

This is both a plausible next UX and a useful pressure test for how much product identity Shrimpy can get from Pi's current TUI extension seams before replacing the TUI.

## Core Claim

Once agents do durable, domain-specific work, switching agents starts to resemble switching apps.

The transcript and editor can remain shared furniture, while the active agent contributes the part of the interface that answers:

> What does this agent know, what is it doing, and what should I care about right now?

That surface does not need to be elaborate. A few high-signal rows at the top of the TUI may do more to establish the agent's purpose than a page of identity text.

```text
career
Applications  24 total   3 interviewing   7 waiting   2 need follow-up

Latest
  Juniper Labs     technical screen Friday
  Tidepool Health  follow up tomorrow
  Northstar        applied 2d ago

--------------------------------------------------------------------------------
chat transcript
--------------------------------------------------------------------------------
> ask the agent...
```

A finance agent could use the same shell with a completely different summary and color language. The shared shell keeps navigation and conversation learnable; the agent surface provides domain-specific orientation.

## This Is A Surface, Not A New Runtime

The dashboard should be a projection of ordinary agent or app state, not a place where hidden work happens.

- agents, watches, scripts, and sessions produce or maintain state
- files, channels, app data, and CLI commands remain the inspectable sources of truth
- the TUI module reads that state and renders a useful summary
- actions exposed by the surface should call ordinary Shrimpy commands or send ordinary messages

This keeps the design aligned with the app-habitat direction in [`app-habitats.md`](app-habitats.md). An app-agent can own a habitat; its TUI module is just one view into it.

It also preserves CLI coverage. If the career dashboard can show application status, an agent should be able to retrieve the same status through a command such as `shrimpy apps show career --json` or an app-owned CLI. The TUI should not become the only way to inspect useful state.

## Shared Shell, Agent-Owned Slots

A useful initial model is one stable Shrimpy TUI with a few optional agent-owned slots:

- **identity:** title, badge, compact header, and theme
- **summary:** a widget above the editor or near the top of the session
- **status:** small live indicators or freshness warnings
- **commands:** domain-specific slash commands or focused selectors
- **details:** an optional custom view for drilling into one item

The transcript, editor behavior, model controls, session controls, interruption, and global Shrimpy status should remain consistent across agents.

This gives each agent meaningful visual identity without requiring every agent author to design a full terminal application.

## The `/agent` Moment

Agent-specific surfaces become much more valuable with a direct TUI `/agent` switcher.

The desired feeling is:

1. invoke `/agent`
2. choose `career`
3. switch to the career agent's local session
4. replace the current agent surface, theme, title, and domain commands
5. keep the surrounding interaction model familiar

The UI change is also a safety affordance. A distinct header or theme makes it harder to forget which agent is active before sharing sensitive financial data or asking an agent to take an app-specific action.

Direct TUI agent switching is not implemented today. The first experiment does not need it: `shrimpy chat career` or `shrimpy agent tui career` can prove whether an agent-specific startup surface feels good. A later `/agent` switch would test the harder lifecycle question: whether Pi can replace and dispose agent UI modules cleanly while Shrimpy changes the underlying agent session.

## What Pi Already Appears To Allow

The current seam is more flexible than a stock chat layout might suggest.

Pi's extension UI exposes:

- custom headers
- keyed widgets above or below the editor
- custom footers and footer status
- terminal titles
- runtime theme changes
- focused custom components and overlays
- terminal input hooks and extension commands

Shrimpy already uses a custom header through `extensions/hello.ts`, primes a Shrimpy theme before Pi constructs interactive components, and installs several TUI customizations after creating `InteractiveMode`. The foreground open path also resolves the active `agentId` before that construction happens.

That is enough evidence to try a real agent-specific module before designing a replacement TUI.

There are still constraints worth testing:

- Pi widgets are placed around the editor, not in arbitrary panes
- a large permanent summary may consume too much vertical space
- theme state is currently configured at the runtime/session level, not per agent in Shrimpy config
- some existing Shrimpy TUI customization reaches into `InteractiveMode` internals, which is more fragile than public extension APIs
- switching agents may require replacing more session and UI state than Pi expects one interactive mode to replace
- live dashboard refresh, resize behavior, cleanup, and keyboard focus may expose limits that a static render does not

## First Flexibility Spike

Build one deliberately small vertical slice for a `career` agent.

The slice should use Pi's public extension UI wherever possible and contain:

- a distinct but restrained career theme or accent
- a compact keyed widget above the editor
- mock or fixture-backed application counts and three recent application rows
- one freshness indicator
- one action that opens a focused detail view or places a normal request into the editor
- clean disposal when the session exits or resources reload

Keep the data fake at first. The question is whether the surface works, not whether the career app is complete.

The automated contract test should prove that selecting the career agent installs the career module while another agent receives only the default Shrimpy surface. It should also assert that the module requests the expected widget placement and theme without mutating session or application data.

The manual test matters just as much:

```bash
shrimpy agent tui career
```

Resize the terminal, send several turns, run a tool, open a selector, start a new session, and exit. The spike succeeds if the dashboard remains legible, does not interfere with normal transcript/editor behavior, and can be removed without leaving stale UI or input handlers.

## A Possible Module Boundary

Do not settle the config format before the spike, but aim for a boundary roughly like:

```text
AgentTuiSurface
  id
  theme?                   optional visual identity
  install(context)         attach widgets, commands, and status
  refresh(reason)          update from inspectable state
  dispose()                remove UI and listeners
```

The context should be narrow and agent-scoped. It may include the agent id, agent root, active session id, TUI extension API, and a way to invoke read-only status providers. A module should not receive the whole runtime merely because that is convenient.

Possible homes include an explicit agent UI directory or an app-owned UI module referenced by the agent. Pi's ambient project-extension discovery is useful for the spike, but a durable Shrimpy design should load these modules intentionally so changing an agent's `cwd` does not silently change its product surface.

## Refresh And Freshness

Dashboards create an expectation that values are current. Every stateful module needs a simple freshness story.

An initial surface could refresh:

- when the TUI starts
- after the active agent finishes a turn
- after a surface action completes
- on explicit user refresh

A timer can come later if a real agent needs it. Visible timestamps and stale-state warnings are more valuable than pretending every number is live.

The renderer should read a prepared summary rather than scan an agent's whole habitat on every terminal render. Rendering must remain cheap and side-effect free.

## Progressive Complexity

This direction has a useful ladder:

1. agent-specific title or accent
2. static identity header
3. read-only summary widget
4. refreshable dashboard from app or CLI state
5. agent-specific commands and focused detail views
6. hot-swappable modules through `/agent`
7. only then consider multi-pane layouts or a custom Shrimpy TUI

Each rung is independently useful. Pi's limits can determine where Shrimpy stops climbing without making the earlier work disposable.

## Things To Avoid

- Do not require every agent to have a custom surface.
- Do not let arbitrary agent prose generate executable TUI code.
- Do not make dashboards alternate sources of truth.
- Do not bury domain actions in UI-only callbacks with no CLI path.
- Do not let agent modules replace global escape, interrupt, session, or model controls.
- Do not refresh expensive state during `render()`.
- Do not jump to a full Pi TUI fork before the public widget and extension seams have been tested with a real app-agent.

## Open Questions

- Is the module owned by an agent, by an app habitat, or can an agent select one provided by an app?
- Should per-agent theming be a simple config field even when no custom module exists?
- Does switching agents replace the transcript, preserve one shared viewport, or make the session boundary visually explicit?
- Which refresh events can use Pi's public extension lifecycle, and which would require Shrimpy hooks?
- Can multiple small widgets compose safely, or should one agent module own a single summary region?
- How should narrow terminals collapse the dashboard?
- What is the smallest trusted module format that remains inspectable and easy for a mechanic agent to create?

## Current Bias

Try it.

An agent-specific career dashboard is small enough to be a contained experiment and rich enough to expose the important constraints. If Pi handles the widget, theme, lifecycle, refresh, and focus behavior cleanly, Shrimpy gets a strong app-agent UX without owning a new TUI. If it fights the design, the failure will provide concrete evidence for the next layer of TUI ownership described in [`pi-tui-fork-tradeoffs.md`](pi-tui-fork-tradeoffs.md).
