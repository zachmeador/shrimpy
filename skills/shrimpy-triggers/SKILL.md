---
name: shrimpy-triggers
description: Use when you are asked to do something on a schedule, such as every morning or every hour, or to change, pause or stop work that repeats.
---

# Work on a schedule

A trigger gives you a prompt on a schedule. It is a file in your home's `triggers/`, and the commands below make and change it. They act on you, check what you give before they write anything, and say what to give instead when it is wrong.

## Trigger or check_back

- A trigger is for work that comes round again and again: a morning summary, a regular look at a build. It goes on until someone turns it off.
- `check_back` is for one look later: "see if the deploy finished in 20 minutes". Set it, end your turn, and it wakes you once. For something once at a given time, use `check_back` with `at`.

## Make one

1. `shrimpy triggers add morning --cron "0 8 * * *" --timezone Europe/Berlin "Read the overnight notes and use send_message to tell @zach what needs him."` makes the trigger `morning`, or replaces the one of that name. `--cron` has five fields: minute, hour, day of month, month and day of week. Without `--timezone` it uses this machine's.
2. `shrimpy triggers add build --every 1h "Check the build, and use send_message to tell @maya if it broke."` repeats every hour from the moment you make it. The shortest is `1m`. Give `--every` or `--cron`, not both.
3. The prompt is all an occurrence has beyond its own history, so write it as instructions to yourself with what you will need.
4. The command ends by saying when the trigger first runs, so that you can tell the person.

## Where an occurrence speaks

- With no `--thread`, each occurrence goes to a session of its own, `trigger:morning`, behind no thread. It keeps its history from one occurrence to the next, so it can remember what it did last time. What you write last there is posted nowhere. To tell someone something, use `send_message` with `to: "@name"`, or `to: "#room"` for a room you are in.
- With `--thread <id>`, the occurrence goes to the session behind that thread, which it makes if you have none, and what you write last is posted there like any reply. When chat is up, the command checks that you are in the thread's channel.
- An occurrence that is due while the last is still going is skipped. `--overlap allow` hands it over behind instead.

## Look, change, stop

- `shrimpy triggers` lists your triggers with when each runs next and how its last occurrence ended. `shrimpy triggers show morning` adds its prompt and its recent occurrences, with the reason for one that failed or was skipped.
- `shrimpy triggers run morning` fires one now, and works on one that is off.
- `shrimpy triggers off morning` stops it running on its schedule and keeps its file, `shrimpy triggers on morning` starts it again, and `shrimpy triggers remove morning` deletes it. To change a prompt or a schedule, make it again with `add`.
- None of these stops an occurrence that is running. `shrimpy sessions stop <agent> trigger:morning` does, with your own name as the agent. For a trigger with a thread, give the thread's ID.

A trigger comes due only while you are running. One that came due while you were stopped runs once when you start.
