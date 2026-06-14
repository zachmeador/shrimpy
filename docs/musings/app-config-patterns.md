# App and Config Patterns

Date: 2026-05-06
Status: Musing

## Seed

Shrimpy should have a repo-owned Markdown collection of app/config ideas: simple-to-complex patterns that emerge in serious user workspaces.

The point is not to ship a grab bag of generic automations. The useful artifact is a ladder of patterns that help someone recognize what kind of Shrimpy environment they are building:

- a small assistant with a few stable docs and one channel
- a recurring personal operations loop with watches, memory, and checklists
- a project workspace with channels, skills, resident agents, and local state
- a durable app-agent habitat that maintains itself, consults the user, and leaves inspectable files behind

## Product Shape

These examples should become material for setup and guidance, not hardcoded behavior.

Possible homes:

- a setup/admin skill used during `shrimpy setup init` or guided onboarding
- a workspace review skill that inspects the user's current files and suggests deeper patterns
- watch-driven check-ins where Shrimpy asks targeted questions about whether a workspace wants to grow into a richer app/config pattern

The best version feels consultative. Shrimpy can look at the user's actual workspace, notice recurring intent, and ask about concrete next steps: add a watch, split a channel, create a skill, name a resident agent, add a small state file, or turn a repeated workflow into a durable app pattern.

## Taste

Examples should preserve the distinction between useful home-agent design and low-effort automation lists.

Good examples:

- start from a recognizable user need
- show the minimum useful workspace shape
- name the Shrimpy concepts involved
- explain how the pattern grows without pretending every workflow needs all features
- leave decisions in normal Markdown/config/state files that users and agents can inspect

## Optional Weird Patterns

The collection should have a clearly labeled bundle of more experimental Shrimpy configs. These are not first-run defaults, but they are useful because they show how far the ordinary primitives can stretch.

One example is a Scrappy-style character agent:

- a persistent agent has a strong personality, voice, lore, and relationship to the user
- a watch-origin morning message logs into an ordinary channel, and the character becomes eligible for that turn through channel membership plus its attention config
- memory upkeep preserves important facts, recurring motifs, and new bits of lore as ordinary agent memory
- the character is encouraged to elaborate its own world over time, while still leaving inspectable files, watches, channels, and session logs behind

This is not especially practical, but it is a good product/design example. It shows that Shrimpy can support playful, durable agent habitats without adding a special character runtime.

Weak examples:

- generic productivity slogans
- app ideas without concrete files, channels, watches, or agent responsibilities
- patterns that require hidden runtime policy instead of ordinary Shrimpy workspace structure

## Backlog

Tracked by `docs/backlog/skill-001-shrimpy-workflows-skill.md`.

## human notes:

https://hermes-agent.nousresearch.com/docs/user-stories hermes has the same idea
