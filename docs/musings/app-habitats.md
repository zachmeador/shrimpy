# 🦐 Apps As Agent Habitats

Date: 2026-04-28
Status: Draft

## Purpose

Capture the skunkworks direction where a Shrimpy "app" is not just code the agent writes, but a living habitat that can contain code, specs, channels, state, skills, and resident agents that operate and maintain it.

The concrete motivating example is `shrimpy-career`: a personal career bot/app that can help prepare resumes and job-application material, remember the user's preferences, react to requests, and keep improving the workflow over time.

## Core Claim

A mature capability should be able to grow along this path:

```text
skill -> skill with scripts/state -> resident app-agent -> app habitat
```

That path should not require a new hidden runtime species at every step.

Shrimpy already has most of the raw material:

- agents are persistent identities with memory and sessions
- channels are durable comms/logs
- skills are prompt/resource bundles for ordinary sessions
- watches can write typed messages into channels
- tools let agents edit files, call CLIs, and run scripts

The missing piece is a first-class convention for grouping those primitives around a user-facing app.

## What An App Is

An app is a durable project/home inside the workspace.

It may contain:

- product intent and user requirements
- code and scripts
- app-local state and data
- app-local skills
- app-local docs and references
- channels for requests, work logs, and maintenance
- one or more resident agents that own operation and maintenance

In this framing, the code is not the whole artifact. The living artifact is the code plus the agents and communication loops that keep it useful.

## Current Shrimpy Fit

Shrimpy currently has no app primitive. It has:

- workspace config
- agents under `agents/<id>/`
- workspace-level skills under `skills/<id>/`
- agent-level skills under `agents/<id>/skills/<id>/`
- channels under `channels/`
- sessions under each agent workspace
- watches under `agents/<id>/watches.json`

This is enough to fake apps by convention:

- create an agent like `career`
- create channels like `career`, `career-dev`, `career-log`
- put code somewhere in the workspace or a repo
- put operating skills under `agents/career/skills/`
- configure watches that wake into `career-log` or `career`

But the framework does not understand that these pieces belong together.

That means:

- app status is not inspectable as one thing
- app channels are just names
- app agents are just agents
- app-local code/state has no standard home
- promotion from skill to resident app-agent is manual
- recurring app maintenance is not connected to app ownership

## Desired Shape

A minimal future convention could be:

```text
apps/
  career/
    APP.md
    REQUIREMENTS.md
    STATE.md
    src/
    scripts/
    data/
    skills/
      resume-tailoring/SKILL.md
      application-tracker/SKILL.md
    agents/
      operator/
        SOUL.md
        SYSTEM.md
        MEMORY.md
```

Or, if preserving the current top-level `agents/` shape matters more:

```text
apps/
  career/
    APP.md
    REQUIREMENTS.md
    src/
    scripts/
    data/
    skills/

agents/
  career-operator/
    SOUL.md
    SYSTEM.md
    MEMORY.md
    skills/
```

The second shape is probably easier to add first because it leaves current agent/session paths alone. The app becomes a grouping layer, not a replacement for agents.

## Mechanical Difference Between Apps And Agents

There is almost no mechanical difference at the runtime level.

An agent is already:

- persistent identity
- context resources
- memory
- sessions
- tool access
- channel participation

An app adds:

- a product/artifact boundary
- app-local files and state
- app-owned channels
- app-owned agents
- app-owned watches
- app-level status/inspection

So the framework should resist making apps a separate execution model.

An app is a durable container and ownership boundary around ordinary Shrimpy pieces.

## Channels As The Backbone

For app habitats, channels need to become the strong shared backbone.

An app should be able to have channels like:

- `career` — user-facing app front door
- `career-dev` — build/spec/design work
- `career-log` — background maintenance and watch output
- `career-issues` — GitHub issue mirror or request queue
- `career-private` — app-agent scratch/coordination if needed

The important part is that these are still normal channels.

The app layer should provide naming, membership, and inspection conventions, not a second message bus.

## Self-Maintaining Loops

A Shrimpy app should eventually be able to own loops such as:

- periodic health checks
- issue triage
- pending user-request review
- stale task cleanup
- dependency checks
- draft generation
- app-specific watches

Today this can be approximated with watch messages into channels. The missing piece is ownership:

- which app owns this watch?
- which agent is responsible?
- where should logs go?
- what is the app's current maintenance state?
- what should happen if the loop fails?

This argues for app metadata around watches, not a new scheduler.

## Skill Graduation

Skills should stay small and portable at first.

When a skill accumulates enough of the following, it may be ready to graduate:

- scripts that need state
- recurring work
- user-specific preferences
- issue/request handling
- maintenance burden
- code that evolves independently
- a need for its own memory

Graduation should be a normal mechanic/librarian workflow:

1. inspect the skill
2. create an app folder
3. create or assign a resident agent
4. move reusable instructions into app skills
5. create app channels
6. create app watches if needed
7. leave the original skill as a launcher or migration note

## Minimal Changes Needed

This direction likely needs these changes, in order:

1. **App workspace convention** Define `apps/<id>/APP.md` plus optional `REQUIREMENTS.md`, `src/`, `scripts/`, `data/`, and `skills/`.

2. **App config shape** Add a small `apps` config section that maps app ids to agent ids, channel names, and app root paths.

3. **CLI inspection** Add `shrimpy apps list`, `shrimpy apps show <id>`, and `shrimpy apps channels <id>` before adding heavier creation flows.

4. **Channel membership helpers** Let app creation seed app channels and memberships without making channel dispatch app-specific.

5. **App-local skills** Extend skill resolution to include app-local skills when a session is opened in an app context.

6. **App-aware watches** Let watches carry optional app metadata while still writing ordinary messages into ordinary channels.

7. **Promotion workflow skill** Add a system skill that knows how to turn a useful skill or repeated workflow into an app habitat.

8. **Mechanic/app-builder agent** Let the mechanic or a future app-builder agent own app creation, repair, and promotion workflows.

## Things To Avoid

- Do not make apps a second agent runtime.
- Do not create a second channel system for apps.
- Do not make every skill an app.
- Do not require users to understand app internals before asking for a thing.
- Do not build OpenClaw-style permission/gating machinery unless a real local need appears.
- Do not hide loops. Every loop should leave normal channel/session/file traces.

## Product Feeling

The ideal user experience is ordinary:

> "Make me a career helper."

Shrimpy grows the smallest useful form:

- maybe first a skill
- then scripts
- then state
- then channels
- then a resident app-agent
- then maintenance loops

The user should not have to know which stage it is in. They should be able to inspect it, steer it, and ask Shrimpy to improve it.

That is the deeper promise: software that can become more alive without becoming less legible.
