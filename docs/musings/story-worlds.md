# 🦐 Story Worlds: Matrix-Builder, Scene-Manager, Autonomous Cast

Date: 2026-06-16
Status: Draft

## Purpose

Push the character-agent idea to its self-running extreme and use it as a design test.

This is the sibling of [`character-agents.md`](character-agents.md) and [`../research/facade-interactive-drama.md`](../research/facade-interactive-drama.md), with one big change: no human in the dramatic loop. The three musings form a progression:

- **character-agents** — one mind plus inner voices, with the user as the other party.
- **facade-interactive-drama** — a human player supplies agency while a drama manager supplies arc.
- **story-worlds** (this note) — a cast of autonomous agents supplies its own agency, a director supplies arc, and a world authority supplies the place it all happens.

The configuration is an agent-story-generator: character agents that wake on a schedule, act on an environment they did not author, and get paced by a director, while a matrix-builder keeps the world coherent under them. The user is the audience, and optionally a director-level nudge, rather than a character.

If Shrimpy can run this from ordinary primitives, its seams are in the right place.

## The Three Authorities

The whole design is a clean split of authority across three ordinary agents. Each has its own `SOUL.md`, `context/` memory, sessions, and channel membership. None is a runtime species. The differences live entirely in instructions, memory scope, tools, and which channels they sit on.

- **Matrix-builder** owns the world. Geography, rooms, objects, props, lore, factions, physical rules, the premise, the weather. It holds the static picture and its job is to fill functional gaps on demand, then freeze each answer as canon. It is set-dresser and continuity editor in one. Only the matrix-builder establishes world facts.
- **Scene-manager** owns the dramatic clock. Tempo, beats, scene boundaries, who is "on," what pressure comes next, the arc, when to cut. This is the Façade drama manager pointed at autonomous agents instead of a human. Only the scene-manager establishes beats.
- **Character agents** own themselves. Identity, voice, goals, in-the-moment intention, and memory of their own experience. They propose actions. They do not author the world or the arc.

The rule that keeps this from collapsing: **three authorities, no overlap.** Characters propose, the matrix-builder establishes world facts, the scene-manager establishes beats. A character can try the locked drawer; only the matrix-builder says what was inside; only the scene-manager decides that finding it matters now.

This is a direct re-allocation of Façade's neo-Aristotelian forces. Façade needs bottom-up material agency (the player acting in language and character) to agree with top-down formal constraint (the plot), inside a world that affords the actions the player wants. Here the **characters** supply the bottom-up agency, the **scene-manager** supplies the top-down constraint, and the **matrix-builder** is the affording world. Drop the matrix-builder and the cast has nothing coherent to act on. Drop the scene-manager and you get strong local agency with no global arc, which is exactly Façade's documented weakness. Drop character autonomy and it is just Façade with a scripted player.

## Why This Is A Good Architecture Test

It pressures seams the two sibling musings leave alone:

- **Agent-as-environment** — can one agent be the authoritative, queryable, continuity-preserving world for others, using only channels and context assembly?
- **Distributed agency with central pacing** — can arc and tempo come from an ordinary agent posting messages, with no privileged orchestrator reaching into anyone's session?
- **Lazy coherent state** — can an agent hold authored canon plus frozen generated canon as inspectable memory, and never silently retcon?
- **Wake choreography** — can watches plus channel membership choreograph a cast that wakes, acts, and re-wakes with no runtime scheduler?
- **Budget as story governor** — can budget bound a story that would otherwise run forever, gracefully, instead of just stopping?

If those fall out of existing primitives, the seams are right. The one place that might genuinely want a new seam is synchronous agent-to-agent queries, and the recommendation below is built specifically to avoid needing one.

## The Stage And The Backstage

Three channels carry the whole thing. The user reads the stage; the maintainer inspects the backstage. This is the Façade rule that performance is the primary UI but inspection stays available.

- **`stage`** — the visible performance. Characters post here with `reply`/`notify`. This is the story output the user reads.
- **`world`** — backstage. Characters post action-intents; the matrix-builder posts resolutions and new canon. Append-only, so it doubles as the continuity ledger.
- **`beats`** — backstage. The scene-manager posts beat decisions, scene cuts, and story-state deltas. The director's notes.

A `writers-room` channel can carry the matrix-builder and scene-manager negotiating directly: the director asks for a storm tonight, the matrix-builder answers with a storm consistent with canon and what it breaks. That is the "they work together" part of the idea, made into ordinary channel traffic.

The loop is just channels, watches, and sessions:

1. The scene-manager opens or advances a scene: sets the story-time, picks which characters are on, asks the matrix-builder for the scene's world slice, and posts a beat to `stage`/`beats`.
2. Characters who are members of the scene channel — woken by that beat message and by their own watch — each take a turn: read the beat, the world slice, and their own memory, then post their performance.
3. Novel world interactions escalate to the matrix-builder on `world`; resolutions return as canon and re-wake the character if it was waiting on the answer.
4. The scene-manager reads the stage, updates story-state (tension, affinity, unresolved threads — the Façade ledger), and decides the next beat or cuts the scene.
5. Loop, bounded by an arc target and a budget.

The scene-manager's entire "control" is posting beat messages and world requests. It never edits a character's prompt or memory. Direction is messages, not mutation.

**Two clocks** run underneath. Wall-clock time drives wakes — character watches and the scene-manager's cadence ride Shrimpy's watch clock. Story-clock time is in-fiction and owned by the scene-manager. A character waking on a wall-clock watch consults the current story-time to know "when" it is. This is what lets characters "wake on a schedule" while the story keeps its own pace; the scene-manager is the bridge that turns wall-clock wakes into story beats.

## How A Character Touches The World

This is the hard part and the real test. A character's turn produces an intention — "she tries the locked drawer." Something must resolve that against canon. Three mechanisms are available in Shrimpy:

1. **World channel, async.** The character posts the action to `world`, ends its turn, and the matrix-builder's resolution wakes it again. Pure channels-and-logs, fully inspectable, no new primitive. The cost is that one scene becomes many turns and many wakes, which suits a slow self-running story and would ruin a tight real-time one.
2. **Matrix as a synchronous oracle tool.** The character calls a daemon tool like `world.look(target)` that routes into the matrix-builder's session and returns within the turn. It reads naturally and resolves several interactions in one coherent turn, but it is agent-as-tool — a nested synchronous session Shrimpy does not cleanly have, and it edges toward the anti-pattern of one agent driving another. It also hides the world reasoning unless the tool leaves a trail.
3. **Pre-rendered world slice.** When the scene-manager sets up a scene, it has the matrix-builder pre-render the relevant slice — this room, these objects, their affordances — and that slice is injected into the character's turn context. Characters act against an already-resolved slice; only genuinely novel moves escalate.

The recommendation is **(3) plus (1)**: pre-rendered slices for the common case, async `world` resolution for the novel case, and treat the synchronous oracle (2) as the thing to avoid until Pi makes nested sessions clean.

That recommendation is itself the architectural finding. It reframes the matrix-builder away from a synchronous physics engine — which would demand new runtime primitives — and toward an asynchronous continuity author that mostly pre-bakes scene slices and is only occasionally a live oracle. A batch set-dresser invoked by the director, plus an append-only world log, fits Shrimpy as it stands today.

## Keeping Canon

The matrix-builder maintains two kinds of state.

- **World bible** — static authored canon: geography, lore, factions, physical rules, the premise. This lives in the matrix-builder's `context/` memory, or as a skill bundle the matrix-builder loads, and it changes rarely.
- **Canon ledger** — generated canon, frozen on first reference. "The drawer held a pawn ticket dated three years ago." Once generated it is appended to the `world` channel and never silently contradicted. This is the continuity-editor job.

The invariant: the matrix-builder fills gaps consistently and freezes them. It never retcons in silence. If a retcon is unavoidable, it is a visible event on `world`, not a quiet edit. This is the world-state analog of the character-agent rule that voices may contribute context but never silently rewrite identity.

The append-only `world` channel is doing real work here. It is both the resolution transport and the canon of record, so "what is true in the world" is always inspectable as a log rather than hidden inside one agent's head.

## What Shrimpy Should Not Do

- No "story engine" runtime species. The matrix-builder, scene-manager, and characters are ordinary agents.
- No synchronous god-orchestrator that reaches into character sessions to edit prompts or memory. Direction is channel messages.
- No hidden world-state. Canon is an append-only ledger, and gap-filling leaves a trail.
- No special "environment" primitive in the runtime. The environment is the matrix-builder agent plus the `world` channel plus pre-rendered slices in context assembly.
- No real-time game-loop assumption. This is a slow, wake-driven, asynchronous story.

If the framework needs any of those shortcuts to make this work, the seams are in the wrong place.

## Litmus-Test Questions

Shrimpy is on the right track if most of these are yes:

- Can the matrix-builder, scene-manager, and characters each be created as ordinary agents with no bespoke feature?
- Can a character act on the world through a visible path — a pre-rendered slice plus an append-only `world` log — without a synchronous call into another agent?
- Can the matrix-builder hold authored canon and frozen generated canon as inspectable memory, and explain why a given fact is true?
- Can the scene-manager pace the cast purely by posting beats, never by mutating a character?
- Can the cast wake, act, and re-wake from watches and channel membership alone?
- Can a maintainer read the world and the director's reasoning without breaking the user-facing fiction?
- Can budget bound an otherwise endless story by degrading cadence instead of breaking it?
- Can a practical helper swarm reuse the same shape — a shared-state authority, a pacing agent, and worker peers?

## Example Composition: The Lighthouse

A bounded first experiment keeps the state and action model inspectable, the same way Façade chose one apartment and one evening.

- `keeper` and `visitor` — two character agents, a two-hander.
- `matrix` — the matrix-builder. Owns the lighthouse, the island, the storm, the year (1908), what is in every room, and whether the radio works.
- `director` — the scene-manager. Owns the arc: a secret surfaces over one night. Owns tension and scene cuts.
- Channels: `stage`, `world`, `beats`.
- Cadence: a beat every few minutes of wall-clock, story spanning one night of story-clock, targeting roughly a dozen beats, hard-bounded by budget.

The cast wakes on watches, plays the scene on `stage`, and reaches into `world` only when it tries something the pre-rendered slice did not cover. The user reads `stage`. If the user wants a little agency back, they drop a note into `beats` to nudge the `director` — reintroducing Façade-style human agency, but at director level rather than character level.

Nothing in that flow is unique to fiction. A planner authority, a coordinator that paces work, and worker agents that act on shared state is the same shape wearing a suit.

## Risks

- **Silent retcon** — the matrix-builder's failure mode, the continuity equivalent of opaque state. The append-only `world` ledger is the guard.
- **No arc** — the cast chatters forever and the director never converges. Worse than Façade's "no global payoff" because there is no human to end the scene. An arc target and budget governor are mandatory, not optional.
- **Wake explosion** — if every micro-action round-trips `world`, a scene becomes thousands of wakes. Pre-rendered slices are the mitigation.
- **Cost with no audience** — a self-running cast burns budget while nobody watches. The story should run on a slow cadence, or only while someone is reading.
- **Consensus mush** — autonomous characters drift toward agreement and politeness; the LLM smooths away conflict. The scene-manager has to inject and protect tension, as Façade's drama policy does.
- **Authority bleed** — a character asserts a world fact ("there's a gun in the drawer") that the matrix-builder never established. The three-authorities rule and the `world` channel are what hold the line.

## Where This Sits

This is the most useless-looking of the three character-agent musings and therefore the most demanding test. If a self-running story world composes from ordinary agents, channels, watches, memory, and context assembly — with the only flagged pressure point being synchronous oracle calls the design deliberately avoids — then Shrimpy is becoming the system the broader goal wants: persistent personalities, cheap ambient loops, agent-to-agent chatter, and shared-state authorities, all grown from simple primitives instead of hidden orchestration.
