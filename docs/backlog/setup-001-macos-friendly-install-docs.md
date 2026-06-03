# 🦐 SETUP-001: macOS-Friendly Setup and Install Docs

Status: todo
Priority: P2
Area: Setup

## Why
Shrimpy should be comfortable to run from a Mac, not just from the current Pi/Linux-shaped development path. A Mac can be a primary host, a development workstation, or the place where a user first tries Shrimpy before moving it to a Pi.

The current setup story leans on Linux assumptions in docs and gateway service management. A macOS path needs explicit install steps, workspace paths, service/lifecycle behavior, and setup output that tells the user what to do next on their actual platform.

## Build
- Audit setup, gateway, status, and docs for Linux-only assumptions such as `systemd --user`, service paths, shell `PATH` expectations, executable symlinks, log locations, and filesystem permissions.
- Define supported macOS host modes: development checkout, local CLI install/symlink, and normal user workspace.
- Document the canonical macOS paths for the CLI, workspace pointer, workspace directory, config, runtime logs, and any launch/service files.
- Add a macOS gateway lifecycle path behind the existing `shrimpy gateway install/start/stop/restart/uninstall/status` commands, likely using a per-user LaunchAgent under `~/Library/LaunchAgents`.
- Keep Linux service behavior intact while making unsupported platform output actionable instead of failing with raw `systemctl` errors.
- Update `shrimpy setup init` and guided setup output so platform-specific next steps mention the correct Mac paths and commands.
- Add stable docs for macOS setup, linked from `README.md`, `docs/README.md`, and `docs/reference/README.md`.
- Cover Node `>=22.19.0` installation choices, `~/.local/bin` or equivalent shell path setup, provider credential setup, workspace creation, gateway launch, status checks, and logs.
- Add a small macOS smoke-test checklist or script that verifies install, setup init, status, and gateway lifecycle without requiring a chat surface.

## Boundaries
- Do not build the macOS Spotlight/Raycast-style surface as part of this item; that remains a separate product direction.
- Do not implement native macOS sandboxing or a helper app here; this item is about making the existing CLI/runtime friendly on Mac.
- Do not replace the Linux/systemd path.
- Do not add a Homebrew formula, signed app bundle, or packaged release asset unless release packaging is explicitly chosen later.
- Do not add legacy compatibility paths or migration code.

## Notes
- Related musing: `docs/musings/desktop-spotlight-surface.md`.
- Related research: `docs/research/macos-seatbelt-helper.md`.
- Related setup behavior: [SETUP-002](setup-002-provider-model-policy-bootstrap.md).
- Later-scope security follow-up: [SECURITY-001](security-001-agent-sandboxing-security-strategy.md).
- Likely files: `README.md`, `docs/README.md`, `docs/reference/README.md`, a new stable setup/install doc under `docs/reference/`, `src/gateway-ctl.ts`, `src/commands/gateway.ts`, `src/commands/status.ts`, `src/setup.ts`, and setup template resources.
- Preserve CLI coverage: every platform-specific setup and lifecycle action should remain reachable through `shrimpy <command>`.

## Done
- A fresh macOS user can follow stable docs from Node install through `shrimpy setup` and a working CLI session.
- `shrimpy gateway` commands either work on macOS through launchd or clearly explain the supported manual alternative.
- Status/log output points to real macOS paths.
- Setup-generated instructions and docs no longer assume Linux when running on macOS.
- Tests or a documented smoke run cover macOS setup and gateway lifecycle behavior.
