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
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | env SHRIMPY_REF=v0.6.2 bash
```

The installer creates an install-managed git checkout at `~/.local/share/shrimpy/app`, checks out the selected ref, installs dependencies, builds Shrimpy, prunes development dependencies, records the managed origin, ref, and commit in `~/.local/share/shrimpy/.shrimpy-install.json`, and links `shrimpy`, `shrimpy-gateway`, and `shrimpy-web` into `~/.local/bin`. Branch refs such as `main` are installed as local tracking branches; tag and commit refs are checked out detached. If an existing git-backed app checkout has local changes, the installer refuses to replace it unless `SHRIMPY_FORCE=1` is set.

For source checkout development:

```bash
npm install
npm run build
npm link
```

## Update

Run the user-facing update flow:

```bash
shrimpy update
```

For an installer-managed checkout, Shrimpy resolves the newest semantic-version release tag, verifies the local update prerequisites, and opens a normal mechanic chat with the app-bundled `shrimpy-update` skill and the exact current and target release context already loaded. The bundled copy makes the update procedure independent of an older or locally edited workspace skill while leaving that user-owned copy untouched. The mechanic runs the skill's read-only inventory script, presents one concrete update plan, and asks for approval on consequential decisions. A clear approval of that plan authorizes its listed routine steps: stopping the gateway, applying the exact tagged release, making the described workspace or skill changes, restarting the service when appropriate, and running the bounded post-update verifier. It asks again only if inspection uncovers a new materially consequential choice.

The app replacement itself is a guarded primitive. It stages and builds the exact approved tag, verifies its commit and CLI, requires a clean managed checkout and a stopped gateway, swaps the app, then checks that the new mechanic TUI can bootstrap. If that immediate mechanic check fails, Shrimpy restores the previous app and verifies the restored mechanic. Workspace migration remains in the mechanic session; the apply primitive does not rewrite user-owned workspace data.

Inspect the same release and readiness information without opening chat:

```bash
shrimpy update --dry-run
shrimpy update --dry-run --json
```

`shrimpy update` installs release tags only. It does not update from `main`, another branch, or an untagged commit. Source-development checkouts should continue to use Git and the repository build workflow instead.

## Setup

Run first-run setup onboarding:

```bash
shrimpy setup
```

Setup creates missing workspace files, writes Shrimpy/Pi baseline guidance into `context/SYSTEM.md`, writes durable user preference scaffolding into `context/USER.md`, writes local path breadcrumbs into `context/WORKSPACE.md`, writes workspace-local command shims under `runtime/bin/`, checks model access, writes or repairs `modelPolicies.coding`, and opens the mechanic setup TUI. The breadcrumbs include the active workspace, app checkout, local command path, source tree, reference docs, and skill roots so agents can inspect the right files without path hunting. The setup session asks about meaningful environment choices such as gateway installation, then treats approval of its described routine setup work as authority to carry those steps through without repeated confirmation. It can run `shrimpy gateway install`, `shrimpy gateway start`, and `shrimpy gateway status` when the user approves. Before finishing, the mechanic verifies workspace status, skill visibility, assembled context, and any selected gateway service. After the mechanic setup session exits, setup prints `shrimpy status` and key workspace paths. A bare `shrimpy` follows the same onboarding entrypoint when the workspace is not ready, including non-interactive setup output.

Shrimpy setup is complete only when `modelPolicies.coding` resolves to at least one Pi-visible model with configured auth and the setup agent workspace exists. If no usable model is available in an interactive terminal, setup runs a plain model access wizard first: choose a local OpenAI-compatible endpoint, API key, or subscription login. The local endpoint path writes a Pi custom provider into `state/pi/models.json` with a dummy local API key, and setup then selects the `coding` policy model from the Pi-visible registry. If no usable model is available in a non-interactive shell, setup prints the auth/model state paths and exits without opening a TUI.

Normal TUI launchers are blocked until setup is complete: `shrimpy`, `shrimpy "prompt"`, `shrimpy chat`, `shrimpy chat mechanic`, and `shrimpy agent tui <id>`. `shrimpy status` includes the derived setup state and names `shrimpy setup` when setup is blocked. The durable workspace layout is owned by [workspace.md](workspace.md).

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

On unsupported platforms, run the gateway manually with `shrimpy-gateway` and inspect the workspace log with `shrimpy gateway logs`. Gateway running state comes from the workspace PID claim and fresh `runtime/gateway-health.json` heartbeat. Service-manager state is reported separately as management metadata. A running gateway also manages the loopback web inspector at `http://127.0.0.1:5174` by default; set `web.enabled` to `false` in `config/shrimpy.json` to disable it.

Gateway services are bound to the active workspace and app checkout. Linux writes `~/.config/systemd/user/shrimpy-gateway-<id>.service`; macOS writes `~/Library/LaunchAgents/io.github.zachmeador.shrimpy.gateway.<id>.plist` and launchd stdout/stderr to `~/Library/Logs/Shrimpy/shrimpy-gateway-<id>.launchd.log`. The `<id>` is derived from the workspace/app pair, so separate dev and normal workspaces can install separate services on the same host.

Installed services record `SHRIMPY_WORKSPACE` and capture a `PATH` with `workspace/runtime/bin` first. Gateway sessions, watches, context turn producers, worker supervisors, and the managed web sidecar inherit the same workspace selection. Bare `shrimpy` inside a Shrimpy-owned child process resolves to that workspace's command shim. Use `shrimpy status` or `shrimpy gateway status` to inspect the workspace source, app checkout, runtime bin, effective `shrimpy` command, process PID/heartbeat, service id, service file, surface health, web sidecar health, and mismatch warnings. A live manually started gateway remains running in status when the installed service is inactive; the service discrepancy is shown as a warning.

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
