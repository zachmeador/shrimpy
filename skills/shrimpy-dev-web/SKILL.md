---
name: shrimpy-dev-web
description: Use when developing, debugging, testing, or reviewing Shrimpy's separate web workspace inspector, including its server, workspace readers, tree navigation, live updates, dense UI, build tooling, or the gateway's narrow management of the web sidecar.
---

# Shrimpy Dev Web

Keep shrimpy-web a separate, read-only service that consumes a user's Shrimpy workspace.

## Ownership Boundary

- Shrimpy writes the workspace; shrimpy-web learns how to read it.
- Keep web-owned backend, frontend, compatibility readers, and tests under `web/`. Treat existing web code under `src/` as code to migrate, not a reason to add more web behavior to Shrimpy core.
- Respond to workspace format changes in shrimpy-web. Do not change Shrimpy to emit web-specific view models, APIs, files, or metadata.
- Touch Shrimpy core only for light sidecar management: enablement config, process start/stop/monitoring, and concise health reporting. Core must not import web types or interpret web data.
- Keep shrimpy-web independently runnable for development and diagnostics.
- Treat browser/server transport as a small private implementation detail, not a new public Shrimpy API.

If the UI cannot derive information from the workspace, omit it unless that information is independently worth persisting for Shrimpy itself.

## UX Expectations

- Keep the tree as the primary application menu. Mix real workspace paths with useful synthetic nodes for channels, agents, sessions, watches, and runtime inspection while retaining access to the physical tree.
- Make workspace changes appear without manual refresh. This includes file contents, added or removed tree nodes, appended channel and session records, and runtime status. Update incrementally when practical and preserve selection, expanded tree state, scroll position, and follow-latest behavior.
- Preserve the information-dense visual character: compact rows, low chrome, strong hierarchy, restrained color, and details available on demand. Avoid spacious card grids and ornamental dashboard styling.
- Stay read-only. Provide specialized viewers for structured records and a clear raw or unknown fallback, but no editors or generic mutation controls. Users can ask an agent to make changes.
- Prefer current workspace shapes only. Do not add legacy readers or compatibility paths unless the user explicitly requests them.

## Safety

- Bind normal service operation to loopback.
- Keep reads bounded and path-contained, including realpath checks for symlinks.
- Never expose credentials or secret-bearing state.
- Preserve unknown records visibly without treating malformed or untrusted workspace content as HTML.

## Workflow

1. Inspect `git status --short` and preserve unrelated changes.
2. Read the relevant web code and the smallest current Shrimpy file-format sources needed to understand the workspace shape.
3. Keep the implementation in `web/` unless the task specifically concerns sidecar lifecycle.
4. Add or update representative workspace fixtures when readers or renderers change. Tolerate unknown current fields while validating the fields the view actually uses.
5. Verify instant updates for every affected node type, not only initial loading.
6. Run `npm run build:web` and the narrowest relevant tests. If backend or gateway TypeScript changes, also run the appropriate TypeScript build or focused test, remembering that the repository's generated `dist/` backs the live local CLI.

Report the workspace shapes handled, live-update behavior checked, core files touched if any, and validation performed.
