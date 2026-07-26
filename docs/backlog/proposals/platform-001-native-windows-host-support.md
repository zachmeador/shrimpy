---
status: draft
priority: P3
area: Platform
depends_on: []
---

# 🦐 PLATFORM-001: Native Windows Host Support

## Why

Pi supports Windows natively, and most of Shrimpy's core runtime already uses portable Node APIs. Shrimpy should run as a first-class Windows host without requiring WSL. The remaining incompatibilities are concentrated at the operating-system boundary: build and installation scripts, workspace command shims, gateway service management, executable discovery, process inspection and termination, tests, and host-shell documentation.

Native support should cover the actual Shrimpy product, not only a TUI launched from a source checkout. A Windows user should be able to install and update Shrimpy, initialize a workspace, run direct sessions, keep the gateway resident for surfaces and watches, use workers, inspect status and logs, and remove the installed service through the same CLI concepts used on macOS and Linux.

## Current State

- `package.json` runs Unix `rm` and `chmod` during builds, so the normal build fails under Windows npm.
- `scripts/install.sh` explicitly supports only Linux and macOS and depends on Bash, Unix symlinks, `~/.local/bin`, and shell-profile edits.
- Workspace-local command shims are `/bin/sh` scripts with executable modes. Command diagnostics and worker-backend discovery invoke `sh -lc` and `command -v`.
- Gateway service management supports `systemd --user` and launchd; Windows falls back to manual gateway management.
- Gateway PID validation reads `/proc` or invokes `ps`, and gateway/worker cancellation assumes Unix signals and process groups.
- Command watches and context producers use the host's default shell, but the supported Windows shell behavior and portability boundary are not documented or tested.
- The repository has no Windows CI or native Windows smoke checklist.
- The workspace model, config, channels, sessions, Telegram surface, watches, web server, model setup, and most CLI commands already use cross-platform Node and Pi boundaries.

## UX Implications

A Windows user installs Shrimpy from PowerShell into a user-owned application directory, runs `shrimpy setup`, and uses the same primary commands and workspace layout described on other platforms. The installation should not require WSL, Cygwin, developer mode, symlink privileges, or administrator access.

`shrimpy`, `shrimpy-gateway`, and `shrimpy-web` must resolve from PowerShell, Windows Terminal, and Shrimpy-owned child processes. `shrimpy gateway install|start|stop|restart|uninstall|status` should manage a per-user resident gateway with useful service and log diagnostics. Direct chat, one-shot runs, Telegram delivery, watches, web browsing, updates, and coding workers should not silently lose functionality on Windows.

Commands stored in command watches and context producers remain host-shell-specific. On Windows they may use the selected Windows command shell; Shrimpy should document that contract and report which shell is active rather than pretending Bash syntax is portable.

Existing Linux and macOS install, update, service, shell, and process behavior must remain unchanged.

## Build

### Portable build and development

- Replace shell-dependent `rm` and `chmod` build steps with a small Node build helper. Remove `dist/` with `node:fs`; apply executable modes only where the host uses them.
- Make repository development commands and test setup work under Windows npm without requiring a Unix compatibility shell.
- Keep generated entry points and package `bin` declarations compatible with npm's Windows launcher behavior.

### Installation and updates

- Add a PowerShell installer that preserves the managed-checkout design: resolve a requested ref, clone to a staging directory, install dependencies, build, prune development dependencies, record install metadata, and atomically place the application in a user-owned Windows location.
- Create Windows command launchers without relying on symlink privileges. Add their directory to the user's `PATH` through an explicit, inspectable step and make repeated installation idempotent.
- Preserve dirty-checkout protection, exact-ref installation, guarded tagged-release updates, rollback behavior, and the mechanic verification step.
- Keep the shell installer as the Linux/macOS path. Do not make either installer emulate the other platform.

### Runtime command environment

- Generate `.cmd` or equivalent native workspace shims for `shrimpy`, `shrimpy-gateway`, and `shrimpy-web`, with the active workspace bound exactly as on Unix.
- Replace `sh -lc "command -v ..."` probes with a platform abstraction that understands Windows `PATH` and `PATHEXT`, including npm-created `.cmd` launchers.
- Verify that Shrimpy-owned subprocesses inherit the workspace runtime bin first and can launch Shrimpy and configured worker backends reliably.

### Gateway lifecycle

- Add a Windows gateway service manager behind the existing gateway service boundary. Prefer a per-user Task Scheduler integration unless implementation testing proves it cannot provide reliable start-at-login, restart-on-failure, environment, status, and stop behavior without elevation.
- Bind each task to the same workspace/app-derived service identity used by the other service managers.
- Preserve workspace selection, runtime `PATH`, logs, health heartbeat, PID ownership, and clean install/start/stop/restart/uninstall semantics.
- Make status distinguish gateway process health from service-manager state, as it does on Linux and macOS.

### Process ownership and workers

- Replace `/proc`/`ps` gateway command inspection with a platform-neutral ownership record or a Windows process-inspection adapter that remains safe against stale PID reuse.
- Add Windows-aware graceful gateway shutdown and forced cleanup. A stale process must not permanently block gateway startup.
- Add a platform process-tree abstraction for worker supervisor cleanup and timeouts. Use Windows process-tree termination rather than negative Unix process-group PIDs.
- Verify detached worker supervisors and direct Codex/Pi worker launches under Windows, including npm `.cmd` executable resolution, timeout, cancellation, stale-worker reconciliation, artifacts, and exit reporting.

### Shell-backed features

- Define and expose the host shell used by command watches and context producers.
- Preserve ordinary host-native command strings. Do not translate Bash into PowerShell or PowerShell into Bash.
- Make shell failures name the relevant command and shell so configuration problems are diagnosable.

### Validation and documentation

- Add Windows CI for build, lint, and the portable test suite. Remove Unix-only assumptions from shared tests and add focused Windows cases for path delimiters, drive-letter paths, case-insensitive path identity where relevant, `.cmd` resolution, process behavior, and service generation.
- Add a native Windows smoke checklist covering install, setup, direct chat/run bootstrap, runtime shims, gateway lifecycle, status/logs, web startup, update preflight, and worker launch/cancellation.
- Exercise the service and terminal flow on a real Windows machine or VM before claiming support; CI alone is insufficient for Task Scheduler, user `PATH`, Windows Terminal input, and shutdown behavior.
- Update the README and stable setup, runtime, CLI, and development references only when the corresponding behavior is implemented.

## Boundaries

- Native Windows means Windows itself, not WSL. WSL may remain a supported alternative but is not the implementation target for this item.
- Do not introduce a compatibility layer throughout the core runtime. Keep OS-specific behavior behind focused install, command, service, and process boundaries.
- Do not require administrator privileges, developer mode, Windows symlink privileges, Cygwin, Git Bash, or a globally installed Unix shell for normal use.
- Do not adopt a third-party service wrapper unless Task Scheduler or another built-in Windows mechanism is demonstrated to be inadequate and the dependency's install, update, security, and removal behavior is acceptable.
- Do not make command-watch or context-producer strings magically cross-shell. Configuration authors own host-specific command syntax unless a future item adds an explicit portable action format.
- Do not add legacy launchers, deprecated service definitions, or migration shims. Implement the supported Windows shape directly.
- Do not weaken PID ownership or cancellation safety merely because Windows exposes different process primitives.

## Suggested Delivery

1. Foreground support: portable build, PowerShell install, native command shims and executable discovery, setup/direct-session/web validation, and Windows CI.
2. Resident support: Windows gateway service lifecycle, process ownership and shutdown, worker process trees, update parity, and a real-machine smoke pass.

The first slice may be merged as explicitly experimental Windows support. Shrimpy should claim unqualified Windows support only after the resident gateway and worker lifecycle pass the native smoke checklist.

## Done

- A new Windows user can install Shrimpy from PowerShell without WSL or elevation and can invoke all three packaged commands from a new terminal.
- `shrimpy setup`, the main TUI, `shrimpy chat`, `shrimpy run`, model authentication, workspace files, channels, Telegram, watches, and the web server work from native Windows paths.
- Workspace runtime shims select the correct workspace and resolve inside Shrimpy-owned child processes.
- The managed update flow stages, verifies, swaps, rolls back, and records Windows installations with the same safety properties as Linux and macOS.
- The gateway installs as a per-user resident task or service, starts at login, restarts on failure, and supports the full lifecycle and status commands without elevation.
- Gateway PID ownership, graceful shutdown, forced cleanup, and stale-owner recovery are safe on Windows.
- Pi and Codex workers can launch, time out, cancel their full process trees, reconcile stale state, and preserve useful artifacts and exit diagnostics.
- Command watches and context producers execute through a documented Windows host-shell contract with useful inspection and failure output.
- Windows CI passes, and a native Windows smoke run verifies install, terminal, service, update, web, surface, watch, and worker behavior.
- Linux and macOS builds, installers, gateway services, updates, workers, and tests continue to behave as before.
