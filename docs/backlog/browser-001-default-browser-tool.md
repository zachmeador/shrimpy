# 🦐 BROWSER-001: Default Browser Automation Tool

Status: todo
Priority: P2
Area: Browser
Depends On: [TOOLS-001](tools-001.md)

## Why
Shrimpy has research on the browser-control stack it should use, but no active
backlog item that turns the decision into implementation work.

Agents need a local, inspectable browser capability that fits Shrimpy's
CLI-first architecture. The default should let an agent open pages, inspect
accessibility snapshots, click/type by stable refs, capture screenshots, and
debug console state without depending on an MCP server, cloud browser, or a
hidden autonomous browser loop.

The settled direction from
[../research/local-browser-control.md](../research/local-browser-control.md) is:
use `agent-browser` with Chrome as the default direct browser tool, expose
Lightpanda as an opt-in engine after Chrome works, and treat Webwright/browser
agent frameworks as higher-level skills rather than the default backend.

## Build
- Add a `shrimpy browser` CLI namespace before adding any daemon tools or prompt
  affordances.
- Start with a compact command surface:
  - `shrimpy browser open <url>`
  - `shrimpy browser snapshot [--full]`
  - `shrimpy browser click <ref>`
  - `shrimpy browser type <ref> <text>`
  - `shrimpy browser press <key>`
  - `shrimpy browser scroll <up|down>`
  - `shrimpy browser screenshot [path]`
  - `shrimpy browser console [--clear] [--eval <js>]`
  - `shrimpy browser close`
- Wrap `agent-browser` as an external CLI first instead of importing a browser
  automation library into Shrimpy.
- Do not add `agent-browser` as a hard package dependency in the first slice.
  Detect it on `PATH`, report availability through diagnostics, and keep browser
  commands disabled with clear setup guidance when it is missing.
- Keep the Shrimpy command output stable, compact, and agent-friendly even if
  the underlying `agent-browser` output changes.
- Add `shrimpy browser raw -- ...` as an escape hatch for unsupported
  `agent-browser` commands.
- Add browser config in the normal workspace config path:
  `browser.engine = "chrome" | "lightpanda"` with Chrome as the default.
- Support `SHRIMPY_BROWSER_ENGINE` as an environment override for local
  experiments.
- Support `browser.cdpUrl` and `SHRIMPY_BROWSER_CDP_URL` for attach mode, but
  keep attach-to-user-browser flows conservative until confirmation and domain
  policy exist.
- Use per-agent browser session names when a command runs in an agent context.
- Store browser profiles, screenshots, downloads, and transient artifacts under
  the Shrimpy workspace rather than in a user's normal browser profile.
- Add workspace-safe defaults for downloads and screenshots so commands do not
  write into arbitrary user locations unless a path is explicitly provided.
- Define Shrimpy's auth storage policy before exposing credential helpers:
  workspace- or per-agent-scoped browser profiles and state files by default,
  explicit opt-in for saved credentials, and no raw secrets in prompts, logs, or
  channel messages.
- Wrap `agent-browser` auth/session features where useful, including named auth
  profiles, `--session-name` state persistence, `--state` save/load, and
  persistent `--profile <path>` directories.
- Do not rely on `agent-browser` default global auth/session paths unless the
  user explicitly opts into them. Prefer Shrimpy-owned paths and pass them to the
  browser command where the upstream CLI supports it.
- Require encryption configuration or a clearly diagnosed local-only risk before
  Shrimpy persists browser state that contains cookies, localStorage, session
  tokens, or saved credentials.
- Add daemon tools only after the CLI behavior is inspectable and tested. The
  tool names should mirror the compact CLI vocabulary and return bounded
  structured output suitable for prompts.
- Include browser tool availability in the effective tool capability view from
  [TOOLS-001](tools-001.md).
- Add a doctor/diagnostic check that reports whether `agent-browser`, Chrome,
  and any configured engine are available.
- If Shrimpy later offers an installer/helper for `agent-browser`, make it an
  explicit opt-in setup action rather than part of the base install.
- Add Lightpanda only as an opt-in engine once the Chrome path is working.
- When Lightpanda returns empty, suspiciously small, or unsupported snapshots,
  surface the limitation clearly and recommend Chrome fallback.
- Record enough session/profile metadata to diagnose stale refs, wrong sessions,
  missing browser processes, and engine mismatch.
- Keep room for a future supervisor layer if dialogs, iframes, downloads, or
  console/network state cannot be observed reliably through short CLI calls.

## Boundaries
- Do not make Browser Use, Stagehand, Webwright, or another autonomous browser
  agent loop the default browser tool.
- Do not require cloud browser providers for the default path.
- Do not make `agent-browser`, Chrome, Playwright, MCP servers, or cloud browser
  clients part of Shrimpy's base dependency set.
- Do not use the user's normal browser profile by default.
- Do not attach to a user's real browser by default.
- Do not import or reuse a user's real Chrome profile by default, even as a
  read-only snapshot. This should be an explicit, visible action.
- Do not save or replay credentials from agent prompts. Credential enrollment
  should happen through a deliberate CLI or operator-approved flow.
- Do not expose raw pixel-coordinate automation as the primary agent surface;
  prefer accessibility refs and stable command outputs.
- Do not add MCP as the required implementation layer for browser automation.
- Do not build a custom browser driver while `agent-browser` can provide the
  required primitive.
- Do not add legacy browser command aliases or compatibility shims once the
  command vocabulary is chosen.
- Do not let browser artifacts bypass Shrimpy workspace safety rules.

## Notes
- Primary research: [../research/local-browser-control.md](../research/local-browser-control.md).
- Related sandbox policy questions:
  [../research/macos-seatbelt-helper.md](../research/macos-seatbelt-helper.md).
- Product musing: [../musings/framework-design.md](../musings/framework-design.md)
  under "Browser Automation".
- The first implementation should favor debuggability over breadth. A small,
  reliable command set with clear output is more useful than wrapping every
  upstream browser command immediately.
- Lightweight install principle: the base Shrimpy package should keep working
  without browser automation dependencies installed. Browser support should be a
  capability Shrimpy detects and wraps when present.
- The implementation should keep the layer model clear:
  - browser engine: Chrome first, Lightpanda later;
  - driver/protocol: whatever `agent-browser` uses internally;
  - agent-facing surface: `shrimpy browser ...`;
  - higher-level workflows: skills or later subcommands.
- `agent-browser` currently has useful primitives for this, but Shrimpy should
  treat them as a backend capability rather than outsourcing credential policy:
  its auth vault, session persistence, state files, and profile reuse need to be
  mapped onto Shrimpy's workspace and agent boundaries.
- Future follow-up items may cover reusable Webwright-style browser workflow
  skills, cloud browser provider routing, domain allowlists, confirmation policy,
  and a persistent CDP supervisor.

## Done
- `shrimpy browser` exposes the initial open/snapshot/click/type/press/scroll/
  screenshot/console/close command set.
- The default implementation uses `agent-browser` with Chrome.
- The base Shrimpy install does not require browser automation dependencies;
  missing browser support is reported by diagnostics instead of failing unrelated
  commands.
- Browser commands use workspace-contained sessions and artifacts by default.
- Browser auth/session state has an explicit storage policy, including where
  profiles, state files, saved credentials, and encryption keys live.
- Saved credentials and session tokens are never emitted in command output,
  prompts, logs, channel messages, or daemon tool responses.
- `browser.engine` and `SHRIMPY_BROWSER_ENGINE` support Chrome, with Lightpanda
  represented as opt-in when implemented.
- `browser.cdpUrl` and `SHRIMPY_BROWSER_CDP_URL` are supported or explicitly
  diagnosed as unavailable.
- `shrimpy doctor` or equivalent diagnostics report browser capability status.
- Agent-facing browser tools mirror the CLI after the CLI is stable.
- Effective agent tool inspection shows browser capability availability.
- Tests cover CLI argument parsing, config/env resolution, command wrapping,
  workspace artifact paths, missing dependency diagnostics, and stable output
  shapes.
