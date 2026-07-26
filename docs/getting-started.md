# 🦐 Getting Started

Shrimpy gives an AI agent a small home on a computer: its personality, memory, projects, conversations, and schedules live in files you can inspect. You do not need to understand models, tokens, or agent architecture to try it. If you can paste a command into a terminal and answer a few questions, the mechanic can guide the rest.

This guide is for a first, curious setup. The exact colors and model names on your screen may differ from the previews below.

## In This Guide

- [What you need](#what-you-need)
- [Choose where Shrimpy lives](#choose-where-shrimpy-lives)
- [macOS: prepare Terminal](#macos-prepare-terminal)
- [Ubuntu or Debian: prepare the terminal](#ubuntu-or-debian-prepare-the-terminal)
- [Windows: start with WSL 2](#windows-start-with-wsl-2)
- [Install Shrimpy](#install-shrimpy)
- [What setup looks like](#what-setup-looks-like)
- [Meet your agent](#meet-your-agent)
- [Stay near the controls](#stay-near-the-controls)
- [A gentle automation schedule](#a-gentle-automation-schedule)
- [A few fun habitats](#a-few-fun-habitats)

## What You Need

- A Linux or macOS computer, a Linux virtual machine, or Windows with WSL 2.
- Git, Node.js `22.19.0` or newer, and npm.
- An AI provider account.
- About 15 minutes and a willingness to tell the mechanic what kind of helper you want.

The easiest model setup is an AI subscription you already have. Setup shows the supported choices and walks you through sign-in.

- **ChatGPT Plus/Pro** and **GitHub Copilot** are simple places to start.
- **Claude Pro/Max** works, but Anthropic currently bills this kind of third-party use as extra usage.
- Other subscriptions may appear in the setup menu.

Plans can still have limits. You do not need to learn token pricing before your first conversation; just read any provider notice shown during sign-in. API keys and local models can wait until you want them.

## Choose Where Shrimpy Lives

Shrimpy can use terminal tools to read files, edit files, and run commands with the permissions of its operating-system account. It is not a sandbox.

For a quick, supervised look, using your normal Linux or macOS account can be reasonable if you keep scheduled agents disabled, stay present while the agent works, and give it only folders you are comfortable letting it touch. Setup installs its schedules disabled and asks before enabling them or starting the background gateway.

For the fuller Shrimpy experience—background work, experiments, chat surfaces, and agents that keep busy while you are away—give it a contained habitat. A dedicated virtual machine, a dedicated computer, or a separate least-privileged OS account limits the shoreline if an agent makes a mistake or follows a bad instruction. Keep recoverable backups outside that environment.

WSL 2 is a convenient Linux home on Windows, but it can still reach mounted Windows drives such as `/mnt/c`. Treat it as useful separation, not a hard security wall. A dedicated VM is the stronger choice when the Windows machine holds valuable files or credentials.

Read [Security](../SECURITY.md) before connecting private accounts, enabling broad file access, or leaving scheduled work unattended.

## macOS: Prepare Terminal

Open **Terminal** from Applications → Utilities, or press Command-Space and search for “Terminal.”

Install Apple's command-line tools, which include Git:

```bash
xcode-select --install
```

A macOS window will open. Choose **Install**, wait for it to finish, then return to Terminal. If the tools are already present, macOS will tell you and you can continue. Apple documents this step in [Installing the command-line tools](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools/).

Next, download the **LTS** installer from the [Node.js download page](https://nodejs.org/en/download) and run the downloaded `.pkg`. Shrimpy needs Node.js `22.19.0` or newer. Close and reopen Terminal after the installer finishes.

Check that everything is ready:

```bash
git --version
node --version
npm --version
```

You should see three version numbers. If `node --version` reports `v22.19.0` or newer, continue to [Install Shrimpy](#install-shrimpy).

## Ubuntu or Debian: Prepare the Terminal

Open the Terminal application. Install Git and the small download tools used below:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
```

Your computer may ask for your password. The cursor will not move while you type it; that is normal.

Install the current Node.js LTS release with the version-manager commands recommended on the Node.js download page:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
. "$HOME/.nvm/nvm.sh"
nvm install 24
```

Check that everything is ready:

```bash
git --version
node --version
npm --version
```

You should see three version numbers. Other Linux distributions are welcome too; install Git, npm, and a Node.js version of `22.19.0` or newer using your distribution's normal tools, then continue below.

## Windows: Start With WSL 2

Shrimpy does not currently run as a native Windows host. WSL 2 is the shortest route; a normal Linux VM is also fine.

On a supported Windows 10 or Windows 11 computer, open PowerShell as Administrator and run:

```powershell
wsl --install
```

Restart Windows when asked, then open Ubuntu from the Start menu and create the Linux username and password it requests. New installations use WSL 2 by default. You can confirm from PowerShell:

```powershell
wsl --list --verbose
```

The `VERSION` column should show `2`. Microsoft maintains the current [WSL installation instructions](https://learn.microsoft.com/windows/wsl/install) if your machine needs a different path.

From this point on, run the Shrimpy commands in the Ubuntu terminal, not PowerShell. Keep the Shrimpy workspace in your Linux home directory, such as `~/.shrimpy`, rather than under `/mnt/c`.

Follow [Ubuntu or Debian: Prepare the Terminal](#ubuntu-or-debian-prepare-the-terminal) inside your Ubuntu window. Then return here.

## Install Shrimpy

These commands are the same on macOS, Linux, and Ubuntu inside WSL 2. If you have not already checked the three tools Shrimpy needs, run:

```bash
git --version
node --version
npm --version
```

Your Node version must be `v22.19.0` or newer. Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
```

When the installer finishes, close Terminal and open it again. Then start setup:

```bash
shrimpy setup
```

The installer teaches new Terminal windows where to find `shrimpy`. If you still see `command not found`, run this once and try again:

```bash
export PATH="$HOME/.local/bin:$PATH"
shrimpy setup
```

From here on, every command in this guide begins with plain `shrimpy`.

## What Setup Looks Like

Setup first creates the basic workspace. If it cannot find an available model, it opens the model-access menu:

```text
shrimpy setup

Initialized 30 workspace files.
No working models found yet.
Starting model access setup...

Model access setup

Choose how to configure model access.
  1. Use a local endpoint
  2. Enter an API key
  3. Use a subscription login
  4. I configured auth another way
  5. Cancel setup
Choose [1]:
```

For the simple subscription route, enter `3`. Choose your provider from the next menu and follow its browser, link, or device-code instructions. The available providers and model names come from the installed model runtime, so your list may differ.

Once model access works, setup may ask which model should handle normal work:

```text
Found 4 available models: openai-codex/gpt-5.3-codex, ...

Choose the model candidate for coding.
  1. openai-codex/gpt-5.3-codex
  2. ...
Use which model for coding? [1]
```

Press Enter to accept the first choice if you do not have a preference. This creates a named `coding` policy, which means Shrimpy can use a sensible model choice without making you repeat provider details in every conversation.

Next, Shrimpy launches a session with the **mechanic**. The mechanic is the maintenance agent: it sets up and repairs the home so your normal agent can live in it. It inspects what already exists, gives you a short summary, and asks one question at a time.

A simplified conversation might look like this:

```text
Mechanic
Your model is working and the workspace is healthy.
What should Shrimpy call you?

You
Maya

Mechanic
Got it. What should your main Shrimpy agent be like?

You
Calm, curious, and good at explaining technical things without assuming I know them.
```

The mechanic will guide you through:

1. Your name and durable preferences.
2. The personality and working style of your main `shrimpy` agent.
3. Whether the agent should stay inside its own workspace or inspect other folders you name.
4. Whether to add a chat surface such as Telegram.
5. Whether to enable any scheduled work.
6. Whether to install and start the background gateway that runs chat surfaces and schedules.

You can say “none for now” to chat surfaces, schedules, or the gateway. A small setup is a complete setup. The mechanic preserves existing files, explains consequential choices, performs the routine setup you approve, and validates the result before it says the workspace is ready.

At the end, the terminal shows your next commands and important paths:

```text
Next:
  shrimpy                  open the main TUI
  shrimpy status           inspect setup, workspace, and gateway status

Paths:
  workspace: /home/maya/.shrimpy
  command:   /home/maya/.shrimpy/runtime/bin/shrimpy
  config:    /home/maya/.shrimpy/config/shrimpy.json
  log:       /home/maya/.shrimpy/runtime/logs/gateway.log
```

## Meet Your Agent

Run:

```bash
shrimpy
```

You are now talking to the normal `shrimpy` agent. It is fine to begin with plain requests:

```text
Explain what is in my Shrimpy workspace like I am new to terminals.
```

```text
Help me make a small reading tracker. Show me the plan before changing files.
```

```text
Remember that I prefer short explanations with examples.
```

```text
What can you do right now, and what would require more setup?
```

Useful early requests include:

- “Show me the files you would change before you change them.”
- “Keep this project inside your own workspace.”
- “Help me connect Telegram, one step at a time.”
- “Create a specialist agent for this project, if it really needs a separate identity and memory.”
- “Turn this repeated process into a skill.”
- “Schedule this only after showing me the exact instruction, frequency, and destination.”
- “Ask the mechanic to inspect my setup and explain anything unhealthy.”

Use `shrimpy chat mechanic` whenever you want help with models, tools, agents, skills, channels, schedules, updates, or repairs. Use plain `shrimpy` for the work and conversations you want your main agent to remember.

## Stay Near the Controls

These commands make the system easier to trust:

```bash
shrimpy status
shrimpy watches
shrimpy agent inspect shrimpy
shrimpy chat mechanic
```

`shrimpy status` shows whether setup and the gateway are healthy. `shrimpy watches` lists scheduled work and whether each watch is enabled. `shrimpy agent inspect shrimpy` shows the main agent's effective tools and configuration.

If you start on your everyday computer, a caring first posture is:

- Leave watches disabled until you understand each one.
- Leave the gateway stopped unless you need schedules or a chat surface.
- Keep the agent inside its official workspace and folders you explicitly name.
- Stay present for command execution and review changes.
- Avoid placing valuable secrets in files the agent can reach.
- Keep backups of anything you would be sad to lose.

Disabling shell or other tools can reduce what an agent can do, but it does not turn the environment into a sandbox. Move to a contained environment before giving Shrimpy broad access or unattended responsibility.

## A Gentle Automation Schedule

Fresh setup includes five focused watches, all disabled until you approve them. The two mechanic-owned audits are a good minimum for a contained, always-on habitat:

- **Monday at 05:00 — security audit:** the mechanic writes a read-only report about tools, reachable state, surfaces, routing, watches, and exposure risks.
- **Friday at 05:00 — hygiene audit:** the mechanic checks for failing or stale watches, dead channels, invalid skills, bloated context, mixed ownership, and automation that is hard to inspect.

The main agent also offers daily memory upkeep, a daily journal, and weekly journal compaction. Those can be pleasant once the agent has real activity, but they are optional and every run uses your configured model.

The setup conversation can enable the audits for you. Later, you can turn them on directly:

```bash
shrimpy watches enable mechanic/security-audit
shrimpy watches enable mechanic/hygiene-audit
```

Scheduled work runs only while the gateway is running. Confirm the result with `shrimpy watches` and `shrimpy gateway status`.

For a small weekly quality check, ask the mechanic:

```text
Please propose a weekly read-only QA watch. It should check Shrimpy status, gateway and surface health, skill validation, recent watch failures, and unresolved delivery problems. Write a short report, notify me only when something needs attention, and show me the complete schedule and instruction before enabling it.
```

Review the first few runs. Quiet, narrow automation is healthier than a busy general-purpose “do whatever seems useful” schedule.

## A Few Fun Habitats

Once the basics feel comfortable, ask Shrimpy to help you make:

- A personal field station that collects reading notes, follows questions over time, and prepares a weekly curiosity report.
- A tiny game studio with a world-building agent, character files, play-test notes, and a mechanic-run weekly project health check.
- A household tide chart for recurring chores, maintenance records, warranties, and gentle reminders.
- A learning companion that keeps a syllabus, notices where you are stuck, creates small exercises, and celebrates visible progress.
- A project lighthouse that watches a codebase or creative folder, summarizes changes, and flags decisions that need you.
- A story-world resident with its own voice, memories, relationships, journal, and scheduled letters.

Start with one habitat, one agent, and one useful rhythm. You can always grow another tidepool later. 🦐
