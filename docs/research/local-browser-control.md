# Agent Web-Browsing Frameworks

Date: 2026-05-28
Status: Research

Survey of browser-control mechanisms and higher-level web-agent frameworks that could become Shrimpy's default browser capability. This updates the older local browser-control note rather than creating a duplicate, because the same decision has two layers:

- the low-level browser primitive Shrimpy exposes to agents;
- the higher-level agent pattern, if any, that sits on top of that primitive.

The bias here is local-first, CLI-first, and agent-friendly. Cloud browser providers are included only where they clarify the local/default decision.

Primary sources checked:

- [agent-browser docs](https://agent-browser.dev/) and [command reference](https://agent-browser.dev/commands)
- [Playwright CLI docs](https://playwright.dev/agent-cli/introduction), [snapshots](https://playwright.dev/agent-cli/snapshots), and [MCP docs](https://playwright.dev/docs/getting-started-mcp)
- [Microsoft Webwright](https://github.com/microsoft/Webwright) and [Microsoft Research article](https://www.microsoft.com/en-us/research/articles/webwright-a-terminal-is-all-you-need-for-web-agents/)
- [Lightpanda Browser](https://github.com/lightpanda-io/browser) and [Lightpanda docs](https://lightpanda.io/docs/quickstart/your-first-test)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Browserbase Stagehand](https://github.com/browserbase/stagehand)
- [Browser Use](https://github.com/browser-use/browser-use)
- [Steel Browser](https://github.com/steel-dev/steel-browser)
- local checkout of `sdfgeoff/hermes-agent`

## Short answer

Use **agent-browser with Chrome as the default direct browser tool** for Shrimpy. It is the best fit for Shrimpy's CLI-first architecture: one binary, shellable commands, persistent local sessions, AX-ref snapshots, broad interaction coverage, CDP attach mode, provider hooks, and no MCP server required.

Add **Lightpanda as an opt-in engine**, not the default. It is interesting on a Pi because it is low-memory and fast, but it is still beta, has partial web API coverage, has no graphical renderer, and cannot replace Chrome for screenshot, visual verification, profiles, or full browser fidelity.

Treat **Webwright as a higher-level skill pattern**, not the browser backend. It is useful when the desired artifact is a repeatable Playwright script for a long-horizon workflow. Shrimpy can support that later as a skill that calls the default browser tool or writes Playwright code in a workspace.

## Decision axes

Most browser-agent framework choices collapse onto these questions:

- **Invocation shape.** CLI, MCP server, library import, extension bridge, or cloud API. Shrimpy should prefer CLI because every feature should be reachable by `shrimpy <command>`, and child processes compose cleanly with agents.
- **Process model.** Launch fresh browser, attach to a running user browser, run a persistent local daemon, or call a remote browser service.
- **Action vocabulary.** Pixel coordinates, DOM selectors, AX refs from an accessibility snapshot, natural-language actions, or generated code.
- **State model.** Is state the browser session, a saved browser profile, a workspace artifact such as a script/log/screenshot, or a remote provider session?
- **Observability.** Can the agent inspect snapshots, screenshots, console logs, network requests, traces, videos, and saved artifacts?
- **Failure handling.** Does the framework make stale refs, dialogs, download waits, iframe boundaries, redirects, and anti-bot failures visible?
- **Security.** Does it isolate browser identity from the user's real browser? Does it support allowlists, confirmation gates, profile separation, and SSRF protections for cloud browsers?

## Layer model

Keep these layers separate when deciding a Shrimpy default:

| Layer | Examples | What it decides |
|---|---|---|
| Browser engine | Chrome, Lightpanda, Camoufox | Page fidelity, memory, rendering, stealth |
| Driver protocol | CDP, WebDriver/BiDi, OS input | How commands reach the browser |
| Agent-facing surface | agent-browser CLI, Playwright CLI, MCP tools | What Shrimpy exposes to agents |
| Agent loop/framework | Webwright, browser-use, Stagehand | Whether another model/loop plans actions |
| Infrastructure | Steel, Browserbase, Browser Use Cloud | Where sessions run and persist |

Shrimpy's default should live at the agent-facing surface layer. Higher-level agent loops should be optional skills or task-specific tools.

## Candidate notes

### agent-browser

`agent-browser` is a browser automation CLI designed for AI agents. Current upstream docs describe a native Rust client-daemon architecture using direct CDP to manage Chrome, with compact text output, accessibility-tree refs, persistent sessions, and 50+ browser commands.

Relevant strengths:

- CLI-first and easy to wrap behind `shrimpy browser ...`.
- Snapshot refs (`@e1`, `@e2`) are the primary agent vocabulary, while CSS, text, XPath, and semantic locators remain available for fallback.
- Broad command surface: open/navigate, click, fill, type, press, scroll, screenshot, PDF, snapshot, eval, get text/html/value/attrs, cookies/storage, network routing/HAR, tabs, frames, dialogs, console/errors, traces, profiling, video, auth vault, confirmations, dashboard, CDP attach, and streaming.
- Persistent daemon avoids paying browser startup cost on every command.
- Supports multiple isolated sessions and saved auth/profile state.
- Supports `--engine lightpanda` in addition to Chrome.
- Supports `--cdp` and auto-connect modes, so Shrimpy can later attach to a user-approved browser or a browser service without changing the tool grammar.

Tradeoffs:

- Chrome is still heavy for a Pi when several agents run in parallel.
- The ref snapshot contract must be taught clearly: refs are scoped to the current snapshot and should be refreshed after navigation or DOM-changing actions.
- The direct tool gives low-level control. Long, repeatable workflows still need higher-level script generation or saved skills to avoid re-solving everything.

Default judgment: **best Shrimpy default**.

### Playwright CLI

Playwright now has an official CLI for coding agents. It is explicitly positioned as lower-token than MCP for coding agents: the agent runs shell commands, while snapshots are saved as files under `.playwright-cli/` and linked from command output. It supports accessibility refs, sessions, network/storage tools, console, tracing, video, screenshots, PDF, cross-browser operation, and attach modes.

Strengths:

- Official Microsoft/Playwright surface.
- Same AX-ref idea as agent-browser.
- Multi-browser support across Chrome, Firefox, WebKit, and Edge.
- Snapshot files fit coding agents that can read workspace artifacts.
- Good fallback if Shrimpy wants to avoid depending on `agent-browser`.

Tradeoffs:

- The command surface is less agent-specialized than `agent-browser` in places Shrimpy likely cares about: auth vault, confirmation workflow, dashboard,
provider integration, streaming, and Lightpanda support.
- Still Playwright/Node centered.

Default judgment: **credible second choice**. Prefer this if upstream stability, vendor trust, or cross-browser support matters more than `agent-browser`'s agent-specific command surface.

### Webwright

Webwright is a code-as-action web-agent framework from Microsoft Research. It does not try to be a better browser driver. Instead, it gives a coding model a terminal and a browser environment, then has the model write Playwright scripts, run them, inspect logs/screenshots, and end with a repeatable `final_script.py`.

Important properties:

- The persistent state is the local workspace: code, logs, screenshots, and output artifacts. The browser session is disposable.
- It is built around long-horizon tasks and reusable automation scripts.
- The public repo ships plugin/skill integration for Claude Code, Codex, OpenClaw, and Hermes-compatible skill loading.
- It depends on Python, Playwright, and a capable coding model.

Where it fits Shrimpy:

- Excellent as a future **skill** for "craft a reusable browser workflow" or "perform this long web task and leave a rerunnable script."
- Not a default low-level browser tool, because it adds another agent loop and assumes script generation is the right output.
- Complements `agent-browser`: direct CLI refs for ad hoc browsing; Webwright style for durable workflows.

Default judgment: **optional higher-level skill**, not the default backend.

### Lightpanda

Lightpanda is a headless browser engine built from scratch in Zig for AI agents and automation. It is not a Chromium or WebKit fork. It has no graphical renderer, exposes a CDP server, can dump HTML or Markdown, has native MCP support, and publishes Docker/nightly binaries for Linux and macOS.

Relevant strengths:

- Much lower memory and faster startup than Chrome in its published crawler benchmark.
- CDP compatibility means Puppeteer, Playwright, and `agent-browser` can talk to it.
- Good fit for high-volume read/extract/crawl work on constrained hardware.
- `agent-browser --engine lightpanda` already gives Shrimpy a low-friction path.

Tradeoffs:

- The project is beta and explicitly says stability and coverage are still improving.
- It has partial Web API coverage, no native Windows binary, no graphical UI, and no real screenshot/rendering surface like Chrome.
- Browser fidelity matters for login flows, complex SPAs, canvas/WebGL, file-pickers, visual checks, and sites with subtle Chrome assumptions.
- It collects usage telemetry by default unless disabled with `LIGHTPANDA_DISABLE_TELEMETRY=true`.

Default judgment: **opt-in engine**. On Shrimpy, expose `browser.engine: lightpanda` or `SHRIMPY_BROWSER_ENGINE=lightpanda` only after Chrome works. Fallback to Chrome for screenshots, empty snapshots, and fidelity-sensitive flows.

### Playwright MCP

Playwright MCP exposes Playwright to LLMs through MCP tools and structured accessibility snapshots. It is local, official, and works with common MCP clients.

Strengths:

- Good drop-in for tools that already use MCP.
- AX snapshots avoid raw screenshots for most interactions.
- Full Playwright automation primitives with dialogs, tabs, screenshots, network, and code execution.

Tradeoffs:

- MCP adds a long-lived tool server and schema/context overhead.
- Shrimpy already wants CLI subcommands; MCP does not buy much for a tool that ships with the agent runtime.
- The unsafe run-code tool is effectively arbitrary code execution in the Playwright server process and needs trust boundaries.

Default judgment: **not Shrimpy default**. Useful only if Shrimpy later exposes external MCP servers for compatibility.

### Chrome DevTools MCP

Chrome DevTools MCP is Google's MCP server for coding agents. It controls and inspects a live Chrome browser through DevTools/Puppeteer and includes a CLI. Its differentiator is debugging: network requests, console messages, source-mapped stacks, screenshots, and performance traces/insights.

Strengths:

- Best candidate for frontend debugging and performance work.
- Official Chrome DevTools team implementation.
- Can connect to an existing browser via `--browser-url`.
- Has a slim mode for basic browser tasks.

Tradeoffs:

- MCP-first, with Google usage statistics enabled by default unless disabled.
- Officially supports Google Chrome and Chrome for Testing, not arbitrary Chromium browsers.
- Smaller general automation surface than `agent-browser` or Playwright CLI.

Default judgment: **debugging companion**, not the default browser agent tool.

### Stagehand

Stagehand is Browserbase's AI browser automation SDK. It combines code with natural-language primitives: `act`, `extract`, `observe`, and `agent`. It can run locally with Chromium and optionally deploy to Browserbase cloud browsers.

Strengths:

- Strong production automation story when a developer wants controlled code but natural-language resilience for unstable pages.
- Structured extraction with schemas.
- Action caching/self-healing is a useful idea for repeatable workflows.

Tradeoffs:

- It is a library/SDK, not a simple CLI default.
- It adds an LLM-resolved action layer inside Shrimpy's agent loop.
- The Browserbase cloud path is useful but should not be Shrimpy's default.

Default judgment: **library to learn from**, not Shrimpy's default. Concepts like action caching and schema extraction may be worth borrowing later.

### browser-use

Browser Use is an autonomous browser agent library with Python APIs, an open-source agent, a persistent CLI, and a hosted cloud product. It can run locally with a browser and your chosen LLM, or use Browser Use Cloud for stealth, scaling, CAPTCHA help, and persistent memory/filesystem.

Strengths:

- Good "delegate this whole web task" shape.
- Has local open-source mode and a CLI.
- Supports custom tools and real browser profiles.

Tradeoffs:

- It is another autonomous agent loop with its own prompt, memory, model, and recovery behavior.
- Harder to debug than direct browser commands.
- The project itself recommends cloud for the most complex/stealthy production use cases.

Default judgment: **sub-agent option**, not default. Consider a future `browser_task` tool when Shrimpy has model budget for inner loops.

### Steel Browser

Steel is browser infrastructure: a self-hostable browser API/server that manages Chrome sessions, state, proxying, extensions, request logs, screenshots, PDFs, and debugging UI. Agents connect through Puppeteer, Playwright, Selenium, or the Steel SDK/API.

Strengths:

- Useful if one Pi or LAN server should host browser sessions for many agents.
- Separates browser process lifecycle from the agent process.
- Has session persistence and observability.

Tradeoffs:

- It is not an agent-facing action vocabulary by itself.
- Adds a server and operational surface.
- Shrimpy would still need `agent-browser`, Playwright CLI, or a custom wrapper on top.

Default judgment: **future infrastructure layer**, not default.

### Stealth drivers: Camoufox, nodriver, Patchright, undetected-chromedriver

These are useful when sites actively fingerprint or block automation.

- Camoufox is a Firefox fork with browser-level fingerprinting changes.
- nodriver talks CDP with fewer automation tells than Selenium-style stacks.
- Patchright patches Playwright to reduce common automation signatures.
- undetected-chromedriver is older Selenium-oriented tooling.

Default judgment: **opt-in backend**, never default. Stealth stacks add maintenance cost and can create user-risky behavior if enabled implicitly.

### Extension bridge / existing user browser

A Chrome extension plus native-messaging or WebSocket bridge can let an agent operate inside the user's real browser with real cookies and open tabs. Browser MCP and similar projects live here; OpenClaw's existing-session mode is similar in threat model even when it uses CDP instead of a custom extension.

Strengths:

- Logged-in everywhere.
- User can see what is happening.
- Avoids repeated login/OAuth ceremony.

Risks:

- The agent sees the user's real browsing identity and sensitive pages.
- Prompt injection from any page can become credential or data exfiltration.
- Needs explicit consent, per-domain allowlists, and confirmation gates.

Default judgment: **separate attach mode**, not default.

### Selenium / WebDriver BiDi

The standards-track automation path. Mature, cross-browser, and important for test infrastructure, but still selector-first in the way most agents encounter it. CDP-backed AX-ref tooling is a better default for Shrimpy.

Default judgment: **not default** unless multi-browser standards compliance becomes the primary goal.

### OS-level computer use

`xdotool`, `ydotool`, `pyautogui`, screenshots, and OS accessibility APIs can drive native dialogs, file pickers, and apps outside the browser.

Default judgment: **fallback layer** for the long tail. It is too brittle and pixel-dependent to be the primary browser surface.

## Comparison

| Candidate | Layer | Invocation | Action grammar | Local? | Good default? |
|---|---|---|---|---|---|
| agent-browser + Chrome | direct browser tool | CLI | AX refs + commands | yes | yes |
| agent-browser + Lightpanda | direct browser tool / engine | CLI | AX refs + commands | yes | opt-in |
| Playwright CLI | direct browser tool | CLI | AX refs + commands | yes | second choice |
| Webwright | higher-level agent framework | CLI/skill | generated Python scripts | yes | skill, not backend |
| Playwright MCP | direct browser tool | MCP | AX refs + tools | yes | no |
| Chrome DevTools MCP | debug/browser tool | MCP/CLI | DevTools tools + actions | yes | companion |
| Stagehand | SDK/framework | library | NL primitives + code | yes, cloud optional | no |
| browser-use | autonomous sub-agent | library/CLI | natural-language task loop | yes, cloud optional | no |
| Steel Browser | infrastructure | REST/SDK/CDP | depends on client | self-hostable | no |
| Camofox/nodriver/Patchright | engine/driver | library/server | varies | yes | opt-in |
| Extension bridge | attach mode | extension/MCP/WS | AX refs + coords | yes | no |
| Selenium/WebDriver | driver | library | selectors | yes | no |
| OS computer use | fallback | CLI/library | coords/keys | yes | no |

## Hermes implementation notes

Local source inspected: `sdfgeoff/hermes-agent`.

Hermes currently uses a thin Python tool layer over `agent-browser`, with multiple backend choices hidden behind the same `browser_*` tool names.

Key facts from the clone:

- `package.json` declares `"agent-browser": "^0.26.0"`.
- `tools/browser_tool.py` registers a compact browser toolset: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_scroll`, `browser_back`, `browser_press`, `browser_get_images`, `browser_vision`, and `browser_console`.
- The agent-facing vocabulary is AX refs from snapshots: click/type operate on refs like `@e5`, not CSS selectors.
- Local mode creates a named `agent-browser --session` and shells out with `--json`.
- CDP override mode reads `BROWSER_CDP_URL` or `browser.cdp_url` and passes `--cdp` to `agent-browser`, so Hermes can attach to an external browser or provider session.
- Cloud browser provider selection is plugin-backed. Explicit `browser.cloud_provider` wins; `local` disables cloud. Without explicit config, Hermes auto-detects Browser Use first, then Browserbase. Firecrawl is registered but intentionally requires explicit config.
- If a cloud provider fails to create a session, Hermes attempts local Chromium fallback and annotates the session as degraded.
- For cloud-configured installs, public URLs can use the cloud browser while private/LAN/loopback URLs auto-route to a local Chromium sidecar by default.
- `tools/browser_supervisor.py` keeps a persistent CDP WebSocket per task when a CDP endpoint is available. It surfaces pending dialogs, recent dialogs, frame tree data, and console errors into snapshots, and can respond to dialogs.
- `tools/browser_camofox.py` is an optional Camofox REST backend selected by `CAMOFOX_URL`; it maps the same browser actions to a local anti-detection Firefox-family browser service and supports managed persistence.
- Hermes now has Lightpanda engine support in `browser_tool.py`: `browser.engine` or `AGENT_BROWSER_ENGINE` may be `auto`, `chrome`, or `lightpanda`. The engine flag is injected only for local non-CDP sessions. Hermes has Chrome fallback logic for Lightpanda failures, empty/short snapshots, and suspiciously small screenshots.
- Hermes does not use Webwright by default. Webwright's repo documents Hermes as a skill-compatible host: symlink `skills/webwright` into `~/.hermes/skills`.

The important pattern to borrow is not all the provider code. It is the shape: one small browser toolset, one stable ref-based contract, backend selection behind config, CDP attach as an escape hatch, and a supervisor layer for browser state that short-lived CLI calls cannot observe well.

## Shrimpy recommendation

Implement browser automation as a Shrimpy CLI feature first:

```text
shrimpy browser open <url>
shrimpy browser snapshot [--full]
shrimpy browser click <ref>
shrimpy browser type <ref> <text>
shrimpy browser press <key>
shrimpy browser scroll <up|down>
shrimpy browser screenshot [path]
shrimpy browser console [--clear] [--eval <js>]
shrimpy browser close
```

Under the hood, start by wrapping `agent-browser` rather than importing a browser library. Keep the Shrimpy command surface smaller than the underlying CLI at first, then add escape hatches:

- `shrimpy browser raw -- ...` for unsupported `agent-browser` commands;
- `browser.engine = chrome | lightpanda` with Chrome default;
- `browser.cdpUrl` or `SHRIMPY_BROWSER_CDP_URL` for attach mode;
- per-agent browser session names and profile/storage directories under the Shrimpy workspace;
- optional confirmation policy for downloads, file uploads, eval, and actions on sensitive domains;
- optional private-address policy before any future cloud backend exists.

Do not make Browser Use, Stagehand, or Webwright the default browser tool. They are higher-level loops and should live as skills or subcommands that call the direct browser tool when their workflow shape is useful.

## Open questions

- Should Shrimpy vendor a pinned `agent-browser` version or install it as an external dependency during setup or a mechanic-guided diagnostic flow?
- Should each Shrimpy agent get its own browser profile by default, or should profiles be task-scoped and ephemeral unless explicitly persisted?
- Should Shrimpy support attach-to-user-browser in v1, or defer it until domain allowlists and confirmation UX exist?
- Is a Hermes-style CDP supervisor necessary immediately, or can it wait until dialogs/iframes/console gaps appear in practice?
- Should Webwright-style reusable scripts be stored as Shrimpy skills, agent vault artifacts, or workspace-level automations?
