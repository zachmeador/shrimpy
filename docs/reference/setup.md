# Setup

Shrimpy supports Linux and macOS as local hosts. The same CLI commands work on both platforms; gateway service management uses `systemd --user` on Linux and a per-user LaunchAgent on macOS.

## Install

Shrimpy requires Git, Node `>=22.19.0`, and `npm`. On macOS, install Node through a normal user-owned toolchain such as the official installer, Homebrew, fnm, mise, or nvm, then confirm `git --version`, `node --version`, and `npm --version` in the shell that will run Shrimpy.

Install the current `main` build:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
```

Install a specific tag, branch, or commit:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | env SHRIMPY_REF=v0.5.0 bash
```

The installer creates an install-managed git checkout at `~/.local/share/shrimpy/app`, checks out the selected ref, installs dependencies, builds Shrimpy, prunes development dependencies, and links `shrimpy`, `shrimpy-gateway`, and `shrimpy-web` into `~/.local/bin`. Branch refs such as `main` are installed as local tracking branches; tag and commit refs are checked out detached. If an existing git-backed app checkout has local changes, the installer refuses to replace it unless `SHRIMPY_FORCE=1` is set.

For source checkout development:

```bash
npm install
npm run build
npm link
```

## Setup

Run first-run setup onboarding:

```bash
shrimpy setup
```

Setup creates missing workspace files, writes Shrimpy/Pi baseline guidance into `context/SYSTEM.md`, writes durable user preference scaffolding into `context/USER.md`, writes local path breadcrumbs into `context/WORKSPACE.md`, checks model access, writes or repairs `modelPolicies.coding`, and opens the mechanic setup TUI. The breadcrumbs include the active workspace, app checkout, source tree, reference docs, and skill roots so agents can inspect the right files without path hunting. The setup session asks before installing or starting the gateway service and can run `shrimpy gateway install`, `shrimpy gateway start`, and `shrimpy gateway status` when the user approves. After the mechanic setup session exits, setup prints `shrimpy status` and key workspace paths. A bare `shrimpy` follows the same onboarding entrypoint when the workspace is not ready, including non-interactive setup output.

Shrimpy setup is complete only when `modelPolicies.coding` resolves to at least one Pi-visible model with configured auth and the setup agent workspace exists. If no usable model is available in an interactive terminal, setup runs a plain model access wizard first: choose a local OpenAI-compatible endpoint, API key, or subscription login. The local endpoint path writes a Pi custom provider into `state/pi/models.json` with a dummy local API key, and setup then selects the `coding` policy model from the Pi-visible registry. If no usable model is available in a non-interactive shell, setup prints the auth/model state paths and exits without opening a TUI.

Normal TUI launchers are blocked until setup is complete: `shrimpy`, `shrimpy "prompt"`, `shrimpy chat`, `shrimpy mechanic`, and `shrimpy agent tui <id>`. `shrimpy status` includes the derived setup state and names `shrimpy setup` when setup is blocked. The durable workspace layout is owned by [workspace.md](workspace.md).

## Gateway

The gateway runs chat surfaces, channel dispatch, and watches. Install and start it through the CLI:

```bash
shrimpy gateway install
shrimpy gateway start
shrimpy gateway status
```

Use the same lifecycle commands on Linux and macOS:

```bash
shrimpy gateway stop
shrimpy gateway restart
shrimpy gateway uninstall
```

Read logs:

```bash
shrimpy gateway logs
shrimpy gateway logs --path
shrimpy gateway logs --follow
```

On unsupported platforms, run the gateway manually with `shrimpy-gateway` and inspect the workspace log with `shrimpy gateway logs`.

Platform service files are host-owned, not workspace-owned: Linux writes `~/.config/systemd/user/shrimpy-gateway.service`; macOS writes `~/Library/LaunchAgents/io.github.zachmeador.shrimpy.gateway.plist` and launchd stdout/stderr to `~/Library/Logs/Shrimpy/gateway.launchd.log`. Installed services capture the install-time `PATH`, and the gateway also adds `~/.local/bin` to its process `PATH` at boot so watch actions and gateway sessions can run bare `shrimpy`.

## macOS Smoke Checklist

```bash
node --version
npm --version
command -v shrimpy
shrimpy setup
shrimpy gateway install
shrimpy gateway start
shrimpy gateway status
shrimpy gateway logs --path
shrimpy status
shrimpy gateway stop
shrimpy gateway uninstall
```

The checklist does not require Telegram or another chat surface. It verifies the install, setup flow, status output, log command, and LaunchAgent lifecycle.
