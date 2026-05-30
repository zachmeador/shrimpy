# App and Config Patterns

Date: 2026-05-06
Status: Musing

## Seed

Shrimpy should have a repo-owned Markdown collection of app/config ideas: simple-to-complex patterns that emerge in serious user workspaces.

The point is not to ship a grab bag of generic automations. The useful artifact is a ladder of patterns that help someone recognize what kind of Shrimpy environment they are building:

- a small assistant with a few stable docs and one channel
- a recurring personal operations loop with schedules, memory, and checklists
- a project workspace with channels, skills, resident agents, and local state
- a durable app-agent habitat that maintains itself, consults the user, and leaves inspectable files behind

## Product Shape

These examples should become material for setup and guidance, not hardcoded behavior.

Possible homes:

- a setup/admin skill used during `shrimpy setup init` or guided onboarding
- a workspace review skill that inspects the user's current files and suggests deeper patterns
- scheduled check-ins where Shrimpy asks targeted questions about whether a workspace wants to grow into a richer app/config pattern

The best version feels consultative. Shrimpy can look at the user's actual workspace, notice recurring intent, and ask about concrete next steps: add a schedule, split a channel, create a skill, name a resident agent, add a small state file, or turn a repeated workflow into a durable app pattern.

## Taste

Examples should preserve the distinction between useful home-agent design and low-effort automation lists.

Good examples:

- start from a recognizable user need
- show the minimum useful workspace shape
- name the Shrimpy concepts involved
- explain how the pattern grows without pretending every workflow needs all features
- leave decisions in normal Markdown/config/state files that users and agents can inspect

Weak examples:

- generic productivity slogans
- app ideas without concrete files, channels, schedules, or agent responsibilities
- patterns that require hidden runtime policy instead of ordinary Shrimpy workspace structure

## Backlog

Tracked by `docs/backlog/app-001.md`.

## human notes:

https://hermes-agent.nousresearch.com/docs/user-stories hermes has the same idea