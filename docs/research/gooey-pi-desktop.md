# 🦐 GooeyPi Desktop Architecture Survey

Date: 2026-08-13
Status: Research
GooeyPi source: `main` at `cd5e0608f02d5d90058bc884a897e76e8caaa2c3`

[GooeyPi](https://github.com/am-will/gooey-pi) is a polished Electron workspace for Pi, OMP, and Prime Agent. It is worthy prior art for a Shrimpy desktop app, especially for its secure Electron shell, transcript workspace, native browser and terminal, release engineering, and unusually broad regression suite.

It is not a good runtime base for Shrimpy without major deletion. GooeyPi owns harness discovery, agent subprocesses, project grants, session discovery, provider catalogs, schedules, collaboration, capability installation, browser control, and voice. Shrimpy already owns the durable versions of most of those concerns. A direct port would give one home two kernels.

The useful rule is:

> Borrow the shell, not the kernel.

A short-lived fork is justified as a product spike. A durable Shrimpy desktop should keep Shrimpy authoritative and reuse or adapt only the Electron, presentation, and native-surface work that survives that boundary.

## What GooeyPi Is

GooeyPi is a three-process Electron application:

```text
React renderer
    |
    | frozen, allowlisted preload API
    v
Electron main process
    |-- project, Git, terminal, browser, voice, package, and schedule services
    |-- per-harness session and provider adapters
    `-- one RPC child for each active agent session
             |
             `-- Pi, OMP, or Prime Agent owns its transcript and model loop
```

The renderer is a React 19/Vite workbench with a project and session sidebar, streamed transcript, composer, Git/file/browser inspector, terminal drawer, settings, capabilities, schedules, activity, voice, and animated pets. The main process is a broker and product backend. It reads each harness's session files, supervises JSONL RPC children, stores GooeyPi UI state, and exposes native services through a narrow preload bridge.

The code is significant rather than a mock:

- 158 production TypeScript/TSX files and about 28,460 lines under `electron/` and `src/`.
- 115 test files and about 23,769 lines under `tests/`.
- 112 Vitest files collected in the local audit, with 887 tests.
- macOS, Linux, and Windows packaging, Electron fuse checks, native-module allowlists, size budgets, signing gates, release checksums, and GitHub provenance attestations.
- MIT license and public release artifacts. The `v0.1.3` installers range from roughly 123 MB to 187 MB.

This breadth arrived extremely quickly. The repository was created on 2026-08-06, and the inspected `main` has 562 commits dated from August 5 through August 13 under one contributor identity. The first source history was reconstructed after the app had been built, so those early milestone commits are logical slices rather than contemporary review checkpoints. The repository's [development history](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/docs/development-history.md) says Prime Agent and Codex sessions produced the initial application.

## Did It Copy Codex?

The honest answer is: it copied the product grammar deliberately, but the repository does not look like copied proprietary source.

The initial research commit contains a detailed [Codex and ChatGPT Work UI audit](https://github.com/am-will/gooey-pi/blob/ad6e186f544193979a3f70ed7461d8a2611cef55/research/codex-ui-audit.md) based on public OpenAI documentation and screenshots. Its [design system](https://github.com/am-will/gooey-pi/blob/ad6e186f544193979a3f70ed7461d8a2611cef55/.superdesign/design-system.md) explicitly says to "faithfully follow" the Codex/Work visual language and match its proportions, hierarchy, density, and component geometry. The resulting screenshot has the same recognizable product shape: compact project/session sidebar, central transcript, floating composer, right-side browser/review pane, bottom terminal, quiet title bar, and restrained dark palette.

That is more than generic inspiration. It is a clean-room product clone with different branding and a different runtime.

Evidence against source or asset copying:

- The implementation is an ordinary React/Electron codebase with its own components, CSS, types, RPC adapters, and service layer. There are no Codex application packages or extracted proprietary bundles in the dependency tree.
- The current assets use GooeyPi, OMP, and Prime branding. The repository's [reference record](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/docs/reference-sources.md) states that no proprietary source or bundled assets were copied and identifies the public references and MIT-licensed marks it used.
- The initial design audit itself warns against source-derived or pixel-identical copying and calls for original identity, palette, icons, spacing, radii, and motion.
- The substantial backend does work Codex screenshots could not provide: Pi-family JSONL transports, session parsers, provider adapters, project authorization, package management, local brokers, and cross-platform release machinery.

One provenance wrinkle is worth preserving in this note. Commit [`c53dec9`](https://github.com/am-will/gooey-pi/commit/c53dec9bd434e443f2bbe873eef41027d5ad40cd) removed the README's short design-provenance section on August 13, although the fuller source record remains under `docs/`. That is not evidence of code theft, but it makes the current landing page less candid about how closely the interface follows Codex.

For Shrimpy, the visual lesson is useful but should not become a second imitation. The information architecture is proven. The product identity, spacing signature, interaction details, empty states, and voice should become recognizably Shrimpy.

## Architecture Quality

### Strong seams

The Electron boundary is the best part of the repository.

- The renderer has Node integration disabled, context isolation and Chromium sandboxing enabled, a strict content security policy, and one exact trusted renderer URL.
- The preload exposes a frozen domain API instead of raw IPC. The main process rechecks the authorized main frame and exact renderer URL on every call.
- Remote pages use a separate persistent partition with no preload or Node access. Navigation, redirects, nested frames, permissions, popups, downloads, and agent browser bindings are gated in the main process.
- File, project, Git, session, URL, process, terminal, JSONL, and provider inputs are bounded and validated. Child processes use fixed executables and argument arrays rather than shell interpolation.
- RPC reads use a strict LF decoder that preserves valid `U+2028` and `U+2029` inside JSON strings. Writes are serialized, byte-budgeted, cancellable before flush, and protected by deadlines.
- Project grants are canonicalized and tied to directory identity. Removing a grant revokes process and filesystem access immediately.
- State writes are serialized and atomic. Shutdown closes admission before taking process snapshots, then uses bounded TERM/KILL escalation.
- The package pipeline checks Electron fuses, ASAR contents, unpacked native files, architecture, signatures, notarization, Gatekeeper, checksums, and bundle sizes.

These are unusually careful choices for a week-old desktop client. The matching tests exercise races, hostile children, framing, path containment, browser boundaries, settings conflicts, transcript reconciliation, and renderer concurrency instead of testing only happy-path components.

The harness adapter is also a reasonable local abstraction. Pi, OMP, and Prime share one framed transport, runtime manager, event forwarder, main UI, and broad service shape, while adapters translate command vocabulary, launch arguments, model catalogs, session layout, and unsupported features. For a Pi-family desktop, that boundary is coherent.

### Structural pressure

The application is already paying for its breadth.

- `electron/main/index.ts` is an 879-line service-construction and lifecycle root. It creates three project services, three session services, three agent managers, provider catalogs, browser and schedule bridges, collaboration, voice, plugins, terminals, IPC, window policy, and shutdown wiring.
- `src/components/Composer.tsx` is 870 lines. `electron/main/browser/agent-service.ts` is 803 lines, `src/types/api.ts` is 737 lines, and `electron/main/voice.ts` is 677 lines. The code is factored better than those numbers alone imply, but several central modules have become policy crossroads.
- The shared contract is compile-time TypeScript plus hand-written runtime validators. It is careful, but broad IPC changes require synchronized edits across the 737-line contract, preload, main registration, services, and renderer consumers.
- Harness neutrality stops at the product edge. Provider authentication, MCP setup, package mutation, session parsing, model capabilities, service tiers, schedules, and collaboration all contain harness-specific policy. Every upstream format change becomes GooeyPi maintenance work.
- The main process is both a native broker and a second agent-platform backend. Native UI concerns and durable runtime policy are separated into modules, but they still share one lifecycle and release.
- The renderer retains a no-bridge demo mode and a substantial `SAMPLE_*` dataset in production source. That helped bootstrap the interface and tests, but it is stale product scaffolding rather than a first-class boundary.

This is a good architecture for the product GooeyPi chose: one desktop owns a unified view over several similar coding harnesses. It is less attractive as a general foundation because the app must continuously reverse-engineer and normalize systems it does not own.

## Slop Audit

The repository is agent-built at slop-like speed, but the core is not careless sludge.

| Signal | Evidence | Judgment |
| --- | --- | --- |
| Development velocity | 562 commits and roughly 52,000 production/test TypeScript lines in nine dated days | High review risk; impossible to infer maturity from volume |
| Commit history | Initial milestones were reconstructed from session logs after the build | Good provenance note, weak incremental review evidence |
| Test posture | About 0.84 test lines per production line, 887 collected tests, full CI and macOS E2E at the inspected commit | Strong evidence against throwaway code |
| Security posture | Sandboxed renderer, exact IPC authorization, bounded transports, path identity grants, hostile-process tests, packaging fuses | Strong and unusually deliberate |
| Module shape | Focused service extractions coexist with several 600–879-line policy crossroads | Medium maintainability debt |
| Product scope | Three harnesses, browser automation, Git, terminal, schedules, packages, MCP OAuth, collaboration, voice, pets, and cross-platform release | Overextended for the project's age |
| Rebrand residue | 199 `prime-work` occurrences outside docs and the lockfile; old protocol, state, local-storage, capability, and demo names remain | Material cleanup debt; some keys may now be de facto persistence contracts |
| Metadata | `package.json` still points `homepage` at `am-will/prime-work` and describes only OMP and Prime Agent | Straightforward slop |
| Documentation | Current docs still say Prime Work, claim 33 tests and zero vulnerabilities, and refer to removed research screenshots and files | Material documentation drift |
| Supply chain | Patched Prime Agent/Pi tarballs are committed and overridden from `vendor/` | Reproducible, but costly and project-specific to inherit |
| Advisories | On 2026-08-13, `npm audit --omit dev` reports the high-severity `extract-zip` traversal advisory through vendored `prime-agent`; full audit also reports a high-severity `nanoid` advisory through Vite/PostCSS | Current security doc is stale; CI's weekly audit last passed before these results |
| Project maturity | One contributor, no forks, 20 stars, first public release week, and only a handful of release downloads | Promising prototype, not established infrastructure |

The practical verdict is medium slop around naming, docs, scope, and product boundaries; low slop in the parts that guard data, processes, and release artifacts. That combination is believable for intense agent-assisted development with a careful operator: the system has been hardened faster than it has been simplified.

## Fit With Shrimpy

GooeyPi and Shrimpy place authority in different nouns.

| Concern | GooeyPi | Shrimpy |
| --- | --- | --- |
| Persistent actor | Harness session inside a selected project | Named resident agent with home context, skills, memory, channels, watches, and many sessions |
| Shared communication | GooeyPi-owned peer-session broker | Typed, append-only channels with membership, wake policy, and surface delivery |
| Agent runtime | One Pi-family RPC child per active desktop session | Shrimpy-owned Pi session bootstrap shared by CLI, gateway, surfaces, and workers |
| Background work | GooeyPi schedule service plus Prime heartbeats | Agent-owned watches routed through channels and the gateway |
| Project authority | GooeyPi folder grants and worktree UI | Agent configuration, session policy, tools, worker authority, and normal filesystem boundaries |
| Persistent UI data | GooeyPi JSON state plus harness files | Shrimpy workspace files and runtime state |
| Existing graphical surface | Full mutable coding workspace | Separate read-only, file-backed Svelte inspector under `web/` |

A direct GooeyPi fork with a `Shrimpy` harness entry would bypass or duplicate the behavior described in Shrimpy's [architecture](../reference/architecture.md), [runtime](../reference/runtime.md), [sessions](../reference/sessions.md), [channels](../reference/channels.md), and [web inspector](../reference/development.md). The most dangerous duplicates would be session ownership, background scheduling, peer messaging, project authority, package and provider policy, and transcript state.

It would also invert the useful web boundary. Shrimpy currently writes the workspace while `shrimpy-web` reads it. GooeyPi would become another writer that understands Shrimpy internals unless it received a deliberate command or protocol surface.

### Reuse

The following work is worth adapting under the MIT license with attribution:

- BrowserWindow hardening, exact IPC sender authorization, custom application protocol, and remote webview policy.
- Preload API organization and separation of renderer/native concerns.
- Strict JSONL transport, process admission, shutdown escalation, and bounded event forwarding where Shrimpy needs an external process boundary.
- Release scripts, fuse policy, native unpack allowlists, architecture checks, signing/notarization gates, checksums, and size budgets.
- The workbench information architecture: agent/session navigation, transcript, contextual inspector, terminal drawer, activity view, settings, responsive overlays, and command palette.
- Transcript reducers, streaming reconciliation, scroll behavior, Markdown boundaries, terminal context attachment, and browser annotation UX after checking them against Shrimpy session semantics.
- Cross-platform window chrome and accessibility tests.

### Leave behind

Do not carry these GooeyPi systems into Shrimpy's durable architecture:

- Pi, OMP, and Prime harness discovery or their session-file parsers.
- `AgentRpcManager` as the owner of Shrimpy sessions.
- GooeyPi project grants as a second Shrimpy authority model.
- GooeyPi schedules, collaboration broker, provider catalog, package mutation, MCP policy, or state store.
- Vendored Prime Agent tarballs and package overrides.
- Prime Work compatibility names, demo data, or Codex-like product identity.
- The assumption that every resident conversation belongs to one code project.

## Recommended Desktop Boundary

The durable shape should make the desktop a Shrimpy client and local native surface:

```text
Shrimpy desktop renderer
    |
    v
Electron main
    |-- windows, menus, notifications, browser, terminal, file dialogs, updates
    `-- starts one local Shrimpy protocol process
             |
             v
    Shrimpy-owned stdio bridge
    |-- agents, channels, sessions, streamed turns, cancellation
    |-- explicit CLI-equivalent commands for every mutation
    `-- no second transcript, scheduler, provider store, or project authority
             |
             v
    AppRuntime / gateway / workspace / Pi
```

The proposed [`shrimpy acp --agent <id>`](../backlog/proposals/surface-010-acp-agent-server.md) is useful prior work but is not the complete desktop contract. ACP can prove that an external client can launch and stream one named resident without taking session ownership. A full Shrimpy desktop also needs agent discovery, channels, addressing, existing-session navigation, gateway state, and home-workspace views. Those may justify a separate Shrimpy-specific stdio protocol or a later authenticated desktop surface. They should not be smuggled into ACP extensions or the read-only inspector API.

Every mutating operation should first have a `shrimpy <command>` path. The desktop protocol may call the same application services directly, but it should expose no capability available only through hidden GUI code.

The existing Svelte inspector creates a stack choice:

- Wrapping `shrimpy-web` in Electron is the cheapest packaging and native-window experiment, but it remains read-only and reuses little GooeyPi renderer code.
- Forking GooeyPi is the fastest interactive product experiment, but creates a second React UI stack and demands aggressive backend deletion.
- A new desktop package can deliberately choose React for GooeyPi reuse or Svelte for Shrimpy web reuse. That choice should follow the spike, not precede it.

## Extend, Fork, Or Start Fresh

| Path | Benefit | Cost | Recommendation |
| --- | --- | --- | --- |
| Add Shrimpy directly to upstream GooeyPi | Smallest visible product delta; upstream retains packaging work | GooeyPi remains authoritative for the wrong state and its Pi-family abstractions keep shaping Shrimpy | Do not use for the canonical app |
| Maintain a permanent GooeyPi fork | Immediate polished shell and features | Continuous merge burden against a rapidly moving project, inherited scope, React stack, rebrand residue, and vendor dependencies | Avoid as the final architecture |
| Short-lived fork spike | Fastest way to test whether the UX feels right with real Shrimpy agents | Throwaway integration work and deliberate deletion | Recommended experiment |
| New `shrimpy-desktop` app borrowing selected MIT code | Clean ownership and product identity | More initial work; must rebuild integration and choose a UI stack | Recommended durable destination if the spike succeeds |
| Electron wrapper around `shrimpy-web` | Very small, low-risk native shell | Does not create a real chat or work surface | Useful phase-zero probe only |

## Spike Plan

Use a disposable fork or sibling repository rather than adding GooeyPi to Shrimpy core.

1. Preserve GooeyPi's Electron window, preload boundary, base layout, transcript, composer, sidebar, and release setup. Remove Prime, OMP, Pi, provider, package, schedule, collaboration, voice, pet, and vendored-agent code unless the spike explicitly tests that surface.
2. Start one Shrimpy-owned stdio process. The first slice may build on the stable ACP subset from SURFACE-010 for one selected resident: initialize, create a session, prompt, stream updates, cancel, and close.
3. Add read-only Shrimpy agent and session discovery through existing CLI/application services. Keep the selected Shrimpy agent fixed by trusted UI state, not prompt metadata.
4. Show one real resident conversation with Shrimpy's transcript authoritative. Relaunch the app, restore the session, switch agents, cancel a turn, and verify that no second session database or project grant appears.
5. Embed or link the current workspace inspector rather than recreating all workspace readers in the desktop spike.
6. Re-skin before evaluating visual appeal: Shrimpy typography, colors, navigation language, empty states, crustacean identity, and home-agent nouns rather than a renamed Codex workbench.
7. Run the spike daily for one week. Measure startup, memory, streaming smoothness, transcript correctness, restart behavior, and whether the desktop improves real use beyond the TUI plus web inspector.
8. If it earns daily use, freeze the useful GooeyPi commit, inventory copied MIT files and notices, and move the surviving pieces into a clean `shrimpy-desktop` history. Do not keep merging upstream wholesale.

Promotion criteria:

- Shrimpy remains the only owner of agents, sessions, channels, schedules/watches, provider state, and workspace authority.
- Closing or crashing the desktop cannot corrupt or orphan a Shrimpy session.
- Existing CLI, TUI, gateway, and surface sessions remain coherent while the desktop is open.
- Every desktop mutation has an equivalent CLI path and shares the same application service.
- Renderer and remote-page isolation survive a focused security review.
- The interface feels like a home for resident agents, not a coding-harness selector with Shrimpy added.
- The app earns its Electron distribution weight and maintenance cost in daily use.

## Validation Notes

The repository was cloned and inspected at the commit named above, including current source, full Git history, documentation, workflows, and release metadata.

- `npm run typecheck`: passed.
- `npm run check`: passed. Biome reported two informational, auto-fixable unnecessary regex escapes and no failures.
- `npm test` after `npm ci --ignore-scripts`: 98 of 112 files passed and 850 of 887 tests passed. The remaining failures required the skipped Electron/native postinstall, a PTY binary, or loopback listeners blocked by the audit sandbox. They are not counted as product failures.
- The full untrusted lifecycle-script install was not executed during this audit. GooeyPi's [CI run for the exact inspected commit](https://github.com/am-will/gooey-pi/actions/runs/31736189982) passed its normal install, typecheck, lint, coverage, build, bundle-size, and macOS E2E jobs.
- `npm audit --omit dev --audit-level=high` would currently fail on the `extract-zip` advisory described above. The scheduled [dependency-audit workflow](https://github.com/am-will/gooey-pi/actions/workflows/audit.yml) last passed on August 10, before the inspected dependency result.

## Sources

- [GooeyPi repository at the inspected commit](https://github.com/am-will/gooey-pi/tree/cd5e0608f02d5d90058bc884a897e76e8caaa2c3)
- [README and feature inventory](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/README.md)
- [Initial Codex UI audit](https://github.com/am-will/gooey-pi/blob/ad6e186f544193979a3f70ed7461d8a2611cef55/research/codex-ui-audit.md)
- [Initial design system](https://github.com/am-will/gooey-pi/blob/ad6e186f544193979a3f70ed7461d8a2611cef55/.superdesign/design-system.md)
- [Development history](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/docs/development-history.md)
- [Reference and clean-room record](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/docs/reference-sources.md)
- [Security model](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/docs/security.md)
- [Electron main process](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/electron/main/index.ts), [IPC authorization](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/electron/main/ipc.ts), and [preload bridge](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/electron/preload/index.ts)
- [RPC transport](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/electron/main/agent-rpc/transport.ts) and [runtime manager](https://github.com/am-will/gooey-pi/blob/cd5e0608f02d5d90058bc884a897e76e8caaa2c3/electron/main/agent-rpc/manager.ts)
- [`v0.1.3` release](https://github.com/am-will/gooey-pi/releases/tag/v0.1.3)
- [`extract-zip` path-traversal advisory](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)
- Shrimpy [architecture](../reference/architecture.md), [design](../reference/design.md), [runtime](../reference/runtime.md), [development](../reference/development.md), and [ACP proposal](../backlog/proposals/surface-010-acp-agent-server.md)
