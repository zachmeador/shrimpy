---
name: shrimpy-triggers
description: Use when you are asked to do something on a schedule, such as every morning or every hour, or to schedule a one-time wakeup, or to pause or remove a trigger.
---

# Work on a schedule

Use the `trigger` tool to schedule both one-time wakeups (`in` / `at`) and recurring triggers (`every` / `cron`, backed by `triggers/<name>.md` in your home). Recurring triggers can also be managed with `shrimpy triggers`.

## One-time vs recurring

- **One-time (`in` / `at`):** For one wakeup later ("check if the deploy finished in 20 minutes", or at an ISO 8601 timestamp). Defaults to the current thread. Call `trigger({ action: "add", in: "20m", prompt: "..." })` and end your turn.
- **Recurring (`every` / `cron`):** For work that repeats (a daily morning summary, an hourly build check). Requires a `name` and defaults to the current thread (or pass a fresh thread ID created with `thread({ action: "create", to: "@name", name: "..." })`).
- **Never use system cron or timers.** Triggers run inside you and act as you. A `shrimpy` command started outside your shell acts as the person unless `SHRIMPY_AGENT_HOME` is set.

## Make a recurring trigger

With the `trigger` tool:
- `trigger({ action: "add", name: "morning", cron: "0 8 * * *", timezone: "Europe/Berlin", prompt: "Read overnight notes and summarize." })`
- `trigger({ action: "add", name: "build", every: "1h", prompt: "Check the build, and report if broken; otherwise write END." })`

Or from the shell (every waking trigger requires `--thread <id>`):
- `shrimpy triggers add morning --cron "0 8 * * *" --timezone Europe/Berlin --thread <id> "Read the overnight notes and say what needs zach."`
- `shrimpy triggers add build --every 1h --thread <id> "Check the build, and say so if it broke. If it didn't, write only END."`

The prompt is all a fresh occurrence knows beyond the thread's history, so make it self-contained.

## Wake only when something changed

Give a recurring trigger a `check` command so it wakes you only when there is news (otherwise no turn runs and no model is called):

- `shrimpy triggers add inbox --every 10m --check "ls inbox | wc -l" --thread <id> "Say what is new in the inbox."`
- `--when`: `changed` (default), `output` (any output), or `always`.
- `--then`: `wake` (default, wakes the trigger's thread with prompt + quoted output) or `note` (writes output to `breadcrumbs/<name>.md` and wakes nobody; takes no `--thread` and no prompt is required). Example: `shrimpy triggers add inbox --every 10m --check "ls inbox | wc -l" --then note "Files waiting in inbox/. Look closer with ls inbox."`
- `--timeout`: `30s` or `2m` (default `1m`, max `10m`). Non-zero exit or timeout counts as news once until the failure changes.

Check output is shown as quoted data (`> `), not instructions. Keep timestamps out of check output so `changed` doesn't fire every time.

## Breadcrumbs

A breadcrumb is a small Markdown file in `breadcrumbs/` holding a fact that moves. Each conversation sees a changed breadcrumb once with its next input. Check the source before relying on it, keep timestamps out of the file, and delete it when no longer needed.

## Where occurrences speak

Every waking trigger runs in a real thread (`thread:` is required on every waking trigger file; only `then: note` breadcrumb triggers have no thread). What you write last in a turn is posted directly to that thread. Overlapping occurrences are skipped unless `overlap: allow` is set.

## Inspect, pause, resume, remove

- Use `trigger({ action: "list" | "pause" | "resume" | "remove", name? })` or the shell commands:
- `shrimpy triggers` lists standing triggers; `shrimpy triggers show morning` shows prompt, check, and recent occurrences.
- `shrimpy triggers run morning` fires one now without shifting its schedule.
- `shrimpy triggers off morning`, `shrimpy triggers on morning`, `shrimpy triggers remove morning`.
- Stopping a running turn in the trigger's thread uses `shrimpy sessions stop <thread>`.

Triggers fire only while you are running. One that came due while you were stopped fires once when you start.
