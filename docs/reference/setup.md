# Setup

Shrimpy supports Linux and macOS as local hosts. The same CLI commands work on both platforms; gateway service management uses `systemd --user` on Linux and a per-user LaunchAgent on macOS.

## Install

Shrimpy requires Node `>=22.19.0` and `npm`. On macOS, install Node through a normal user-owned toolchain such as the official installer, Homebrew, fnm, mise, or nvm, then confirm `node --version` and `npm --version` in the shell that will run Shrimpy.

Install the current `main` build:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
```

Install a specific tag, branch, or commit:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | env SHRIMPY_REF=v0.2.0 bash
```

The installer writes the app to `~/.local/share/shrimpy/app` and links `shrimpy`, `shrimpy-gateway`, and `shrimpy-web` into `~/.local/bin`. Add `~/.local/bin` to `PATH` if your shell does not already include it.

For source checkout development:

```bash
npm install
npm run build
npm link
```

## Initialize

Create baseline workspace files:

```bash
shrimpy setup init
```

Finish model/provider setup:

```bash
shrimpy setup
```

If no model is available, `shrimpy setup` opens Pi's provider bootstrap path so you can use `/login` and `/model`. The durable workspace layout is owned by [workspace.md](workspace.md).

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

Platform service files are host-owned, not workspace-owned: Linux writes `~/.config/systemd/user/shrimpy-gateway.service`; macOS writes `~/Library/LaunchAgents/io.github.zachmeador.shrimpy.gateway.plist` and launchd stdout/stderr to `~/Library/Logs/Shrimpy/gateway.launchd.log`.

## macOS Smoke Checklist

```bash
node --version
npm --version
command -v shrimpy
shrimpy setup init
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
