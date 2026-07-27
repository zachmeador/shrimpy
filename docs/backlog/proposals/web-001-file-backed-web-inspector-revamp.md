---
status: todo
priority: P2
area: Web
depends_on: []
---

# 🦐 WEB-001: File-Backed Web Inspector Revamp

## Why

Shrimpy-web should become a dependable default companion to the gateway without becoming part of Shrimpy's runtime architecture. It is a separate, read-only service whose backend consumes the files in a user's Shrimpy workspace. Shrimpy owns those files; shrimpy-web adapts its readers and renderers whenever their current shapes change.

The existing inspector has the right basic character: a dense, dark tree and specialized file, channel, and session views. It needs lifecycle integration, current workspace compatibility, automatic updates, safer file access, and a more useful tree rather than a new Shrimpy HTTP API or a second source of runtime truth.

## Current State

- `shrimpy-web` is a separately packaged executable, but the gateway does not start or monitor it.
- The Node server lives under `src/web/` even though its behavior belongs to the separate web application; the Svelte application lives under `web/`.
- The frontend loads a recursive workspace tree and selected file through two same-origin HTTP routes.
- Refresh is manual. Appended channel/session records, ordinary file changes, runtime state, and added or removed tree nodes do not appear automatically.
- Channel and session rendering understands only part of the current persisted shapes. Session manifests, decoded identities, lifecycle state, current custom records, and several channel content variants receive little or generic treatment.
- The generic reader is lexical-path-contained but not realpath-contained, and most readable-looking workspace files are exposed without a sufficiently deliberate secret boundary.

## UX Implications

The gateway starts shrimpy-web by default at the local inspector URL. Setting `web.enabled` to `false` disables that managed process. A web failure is visible in gateway status and logs but does not stop channel delivery, watches, or other gateway work.

The tree remains the primary application menu. It may mix physical workspace paths with synthetic nodes for useful concepts such as overview, channels, configured agents, decoded sessions, watches, and runtime state. The physical workspace remains browsable through the tree rather than being replaced by a separate dashboard navigation system.

Every visible value is live. File edits, atomic replacements, created or removed paths, appended channel and session records, watch state, and gateway runtime state appear without a manual refresh action. Incremental updates preserve the selected node, expanded tree branches, scroll position, and follow-latest preference.

The visual style remains information-dense: compact rows, low chrome, restrained color, clear hierarchy, and expandable detail. Avoid spacious card grids and ornamental dashboard patterns.

The inspector remains read-only. It offers specialized renderers and a raw fallback, but no file editor, config editor, runtime controls, or generic mutation route. Users can ask an agent to change the workspace.

## Build

### Separate web ownership

- Move the web-owned Node backend from `src/web/` into `web/` with the frontend, its own TypeScript boundary, compatibility readers, fixtures, and tests.
- Keep `shrimpy-web` independently runnable for development and diagnostics.
- Do not import web types into Shrimpy core. Do not make Shrimpy emit web-specific files, view models, endpoints, or metadata.
- Read workspace config, channel logs and membership, session manifests and transcripts, watches, and runtime state directly from disk with tolerant web-owned decoders.
- When a persisted Shrimpy shape changes, update shrimpy-web readers and fixtures rather than changing Shrimpy for the inspector.

### Gateway sidecar management

- Add a small resolved `web` config with `enabled` defaulting to `true` and a configurable local port. Managed operation binds to loopback.
- Add a focused gateway sidecar manager that starts `shrimpy-web` with the resolved workspace and port, monitors exit, restarts with bounded backoff, and terminates the child during gateway shutdown.
- Keep web startup and bind failures non-fatal to the gateway. Record concise sidecar state such as disabled, starting, running, restarting, or failed, plus PID and a sanitized last error for gateway status.
- Keep the gateway ignorant of web navigation, workspace readers, browser transport, and rendered data.
- Preserve the standalone `shrimpy-web` executable and development flow.

### File-backed navigation and rendering

- Extend the tree model so physical directories and synthetic menu nodes can coexist without fabricating unsafe filesystem paths.
- Derive channel nodes from `channels/*.jsonl` and channel configuration, agent nodes from current config, session nodes from manifests, and runtime nodes from existing state files.
- Decode session names and profiles from manifests instead of presenting base64url storage segments as identity.
- Render current channel text, media, control, status, system, provenance, addressing, and publication-intent shapes with an unknown-record fallback.
- Render current session messages, tool calls and results, system prompt and tool metadata, turn context, model and thinking changes, compaction policy, session metadata, and lifecycle records with an unknown-entry fallback.
- Read growing JSONL files incrementally from byte offsets and load a bounded recent tail initially so follow-latest never means the beginning of a large file.
- Keep the browser/server protocol same-origin, private to shrimpy-web, and small. It is an implementation detail rather than a public Shrimpy API.

### Instant updates

- Watch the workspace backend-side and send compact invalidation or append notifications through one private same-origin stream.
- Cover ordinary content edits, atomic file replacement, directory additions and removals, and JSONL appends. Maintain watchers as the directory tree changes.
- Include periodic reconciliation so missed or platform-specific filesystem notifications self-heal.
- Reload only the affected tree branch or selected view when practical. Append new channel/session rows without rebuilding the full page.
- Show a quiet stale or disconnected indication when the live-update stream is unavailable and recover automatically.

### Safety

- Enforce realpath containment for file reads so symlinks cannot escape the workspace or an explicitly configured agent root.
- Define explicit secret-bearing paths and shapes that are never returned, including Pi authentication and provider credentials.
- Serve normal managed operation on loopback without CORS.
- Treat workspace text as untrusted display content. Do not render arbitrary stored HTML.
- Keep file and JSONL reads bounded and return useful unavailable, malformed, truncated, and unknown states.

### Validation

- Add web-owned fixtures covering current config, channel, manifest, transcript, watch, and runtime shapes.
- Test sidecar default enablement, explicit disablement, startup, bounded restart, occupied ports, non-fatal failure, status, and shutdown.
- Test physical and synthetic tree construction, opaque node identity, configured agent roots, decoded sessions, current structured renderers, and unknown fallbacks.
- Test live updates for edits, atomic replacements, additions, removals, and appends while preserving UI state.
- Test realpath escape, secret denial, bounded tail reads, malformed records, and same-origin local serving.
- Exercise the built `shrimpy-web` against a temporary representative workspace and run the normal web build, lint, and focused tests.

## Boundaries

- Shrimpy writes the workspace; shrimpy-web learns how to read it.
- Do not add a Shrimpy web API, embed the web server in the gateway process, or make gateway runtime objects the inspector's data source.
- Do not move web compatibility work into `src/`. Core changes are limited to sidecar config, lifecycle, and concise health reporting.
- Do not add write endpoints or browser-side workspace mutation.
- Do not replace the tree as the primary navigation model.
- Do not trade instant updates for a refresh button or slow periodic full-page polling.
- Do not loosen the dense visual style.
- Do not add legacy workspace readers unless explicitly requested.

## Touches

- `web/`
- `src/gateway.ts`
- a focused gateway web-sidecar module
- config validation for the small `web` section
- gateway status and health reporting
- package build and development scripts
- installer/runtime packaging only where required to preserve the standalone executable
- setup, runtime, configuration, CLI, security, and development docs after implementation

## Done

- Starting the gateway starts a loopback shrimpy-web sidecar by default; `web.enabled: false` prevents it.
- The web process remains independently runnable and owns all workspace decoding and UI behavior.
- Gateway operation survives web startup, bind, crash, and restart failures with useful status and logs.
- The tree provides physical workspace browsing and synthetic inspection nodes without becoming a second navigation system.
- Current channels, agents, sessions, watches, runtime state, and ordinary readable workspace files have useful dense read-only views.
- All affected views reflect workspace changes automatically while preserving navigation and scroll state.
- Shrimpy core contains no web view models, data endpoints, or workspace-format accommodations beyond sidecar management.
- File access is realpath-contained, secret-bearing state is unavailable, reads are bounded, and unknown records degrade visibly.
- Focused backend, frontend, lifecycle, live-update, and safety tests pass.
