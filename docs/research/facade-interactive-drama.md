# 🦐 Façade, Interactive Drama, And Story-Agent Architecture

Date: 2026-06-16
Status: Research

Question: what should Shrimpy learn from Michael Mateas and Andrew Stern's "Interaction and Narrative" chapter and the 2005 interactive drama Façade for future story-agent architectures?

## Short Answer

Façade is still unusually relevant because it treats interactive drama as an architecture problem, not just a writing problem and not just an AI-character problem. The system works by choosing a tightly bounded dramatic situation, mapping open player behavior into authored social actions, updating explicit story-state variables, sequencing reusable dramatic units, and communicating state through performance instead of visible meters.

The useful pattern is:

- a visible character or cast that performs the user-facing scene
- explicit story-state variables such as affinity, tension, revealed facts, loyalties, unresolved conflicts, motifs, and relationship pressure
- a small action ontology for user moves, even if an LLM performs the interpretation
- beat-like content units that can be selected, interrupted, resumed, remixed, or skipped
- a drama-manager policy that chooses what kind of story pressure comes next
- context assembly that makes the selected pressure visible to the active character session
- logs that let the user or maintainer inspect why a turn went where it went

For Shrimpy, this lines up strongly with the existing channel/session/agent split: channels are the stage and public record, sessions are the character's private working context, watches and worker sessions can run beat/drama-management work, skills can package authored story material, and memory can preserve continuity. The missing piece is an explicit "story state plus beat policy" layer that is inspectable and does not silently mutate a character's identity.

## Modern Reframe: Agent Protagonist

A modern Façade-like system does not have to put the human inside the scene as the main character. The protagonist can be an agent. The human side of the game can become more like an "AI Truman Show": observing, nudging, interrupting, tempting, steering, or applying pressure to an agent who is living through the dramatic situation.

Mechanically, that is close to the player-centered version. The system still needs scene state, action interpretation, beat selection, memory, recapitulation, and performance. The main difference is which actor owns the durable viewpoint. In original Façade, the human player is the visitor whose utterances directly move social state. In an agent-protagonist version, the resident character agent owns more of the continuity, while human input becomes one source of pressure among other scene events, watches, inner voices, and environmental changes.

That matters for Shrimpy because the interesting near-term target is not necessarily an LLM game centered around the human player. The same architecture can first support persistent character agents whose lives have inspectable dramatic mechanics around them.

## What The Paper Is Actually Arguing

The user-linked paper is "Interaction and Narrative," a 2005 Game Design Reader chapter by Michael Mateas and Andrew Stern. It frames Façade as an experiment in interactive drama, grounded in Mateas's neo-Aristotelian theory of agency and in the practical production of a playable work. The chapter starts by mapping interactive narrative approaches: commercial games that use narrative as framing, emergent/player-constructed narrative, new media narrative art, electronic literature, hypertext, interactive fiction, and interactive drama. Façade is placed specifically in the interactive-drama lineage, where the player participates as a first-person character in a tightly structured dramatic action rather than browsing story nodes or merely generating after-the-fact stories from a simulation. [Mateas and Stern, "Interaction and Narrative"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-game-design-reader-2005.pdf)

The core theory is that agency is not the same as activity. The player feels agency when actions available in the world produce effects that line up with the player's intentions. The chapter integrates that idea into an Aristotelian model of drama: the player acts inside the lower layers of dramatic material, such as spectacle, language, thought, and character, while the authored plot still exerts top-down formal constraint. Strong interactive drama needs those two pressures to agree. The world must afford actions the player wants to take, and the plot must be able to absorb those actions as meaningful. [Mateas and Stern, "Interaction and Narrative"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-game-design-reader-2005.pdf)

That is the paper's most Shrimpy-relevant point. A Façade-style story-agent architecture cannot be judged only by how expressive the character prompt is. It has to be judged by whether the system gives the user action affordances, recognizes the user's intended move, updates some consequential story state, and then lets the character performance reveal that consequence.

The paper also argues against treating the ludology/narratology dispute as something solvable by theory alone. Mateas and Stern's position is pragmatic: build the system, then see what design-space point it samples. Their DiGRA paper makes this explicit: Façade exists to test whether a game can combine high-agency play and story through real-time language-based social games, overlapping progressions, and dramatic performance as feedback. [Mateas and Stern, "Build It to Understand It"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-digra2005.pdf)

## Façade As A Game

Façade is a short, first-person, real-time, one-act domestic drama. The player visits Grace and Trip, a married couple in their apartment, and gets pulled into the collapse of their relationship. The player can move, look around, interact with objects, touch or kiss characters, and type natural-language utterances while Grace and Trip continue performing in real time. The story lasts roughly 15 to 20 minutes and is meant to be replayed. [Mateas and Stern, "A Behavior Language for Story-based Believable Agents"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-is-2002.pdf)

The important design choice is that the game does not ask the player to solve puzzles. The challenge is social performance. The player is an old friend who can ally, criticize, flirt, pacify, provoke, ask about objects, refer to loaded topics, or give advice. Those actions affect how Grace and Trip interpret the player, which topics rise, how tense the scene becomes, what gets revealed, and which ending beat is selected. The paper's theory explains why this matters: puzzles tend to pause dramatic action and produce trial-and-error halos, while Façade wants continuous enactment, intensification, and unity of action. [Mateas and Stern, "Interaction and Narrative"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-game-design-reader-2005.pdf)

Release and reception details are secondary to Shrimpy, but they help calibrate the historical achievement. Façade was released for Windows in July 2005, with a Mac OS X release in August 2006, and later won the Grand Jury Prize at Slamdance Independent Games Festival while also being an IGF finalist earlier in development. [Wikipedia, "Façade (video game)"](https://en.wikipedia.org/wiki/Fa%C3%A7ade_%28video_game%29)

## The Mechanics Under The Drama

Façade's mechanics are social games hidden inside theatrical performance. The system internally tracks values, but it tries to show them through Grace and Trip's behavior rather than through UI meters. That matters because a visible "relationship score" would make the experience legible as a stat game, while Façade wants the player to read emotional performance.

The main social-state structures described by Mateas and Stern are:

- **Affinity game:** early in the story, Grace and Trip interpret player discourse as evidence of whose side the player is on.
- **Hot-button game:** topics such as sex and divorce progress through tiers, revealing more backstory or producing stronger reactions as the player presses them.
- **Therapy game:** later in the story, the player's statements can increase each character's self-realization about their problems.
- **Tension arc:** the system tracks overall dramatic tension and uses it to guide beat sequencing toward an authored dramatic shape.

This is the cleanest bridge from Façade to story-agent architecture. The player experiences a fluid social scene, but the architecture sees discourse acts, topic references, affinity shifts, tension, self-realization counters, and reveal state. [Mateas and Stern, "Structuring Content in the Façade Interactive Drama Architecture"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-aiide2005.pdf)

## Architecture

Façade is organized around several cooperating layers:

- **ABL characters:** Grace and Trip are authored in ABL, a reactive planning language for believable agents with support for coordinated multi-character behavior. [Mateas and Stern, "A Behavior Language for Story-based Believable Agents"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-is-2002.pdf)
- **Natural language rules:** typed player text is mapped into a small set of parameterized discourse acts by broad, shallow, author-intensive rules. [Mateas and Stern, "Natural Language Understanding in Façade"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-tidse2004.pdf)
- **Joint dialog behaviors:** the atomic dramatic performance unit is a small coordinated exchange between Grace and Trip, typically a few lines of dialogue plus emotion, gesture, and staging.
- **Beats:** a beat contains 10 to 100 joint dialog behaviors and sequences a subset of them in response to player interaction.
- **Beat goals and beat mix-ins:** each beat has a canonical progression, plus handlers that react to player moves by inserting, removing, or reordering content.
- **Global mix-ins:** player-triggered reactions, topic progressions, object comments, deflections, and recoveries can intermix with the active beat.
- **Drama manager:** the highest-level sequencer chooses the next beat based on preconditions, priority, weights, and how the beat's tension effect matches the desired story arc.
- **Animation and audio engine:** the selected behavior is rendered as real-time speech, gesture, staging, music, and visual performance.

The numbers are striking. For a roughly 20-minute experience, Façade used about 2,500 joint dialog behaviors. Around two thirds were organized into 27 beats, with about 15 beats encountered in one run. A single run performs at most about a quarter of the available content. Global mix-ins made up roughly the remaining third of the joint dialog behavior library. [Mateas and Stern, "Structuring Content in the Façade Interactive Drama Architecture"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-aiide2005.pdf)

The architecture is not "generate any story." It is authored recombination. Mateas and Stern are explicit that Façade generates sequences, not sentences. It avoids the classic branch explosion by making many story fronts causally sparse and only occasionally interdependent. Grace and Trip can argue about redecorating, Italy, parents, drinks, and the anniversary in different orders because those conflicts are designed to be mostly order-independent. Tone matching then makes causally independent pieces feel related in performance. [Mateas and Stern, "Structuring Content in the Façade Interactive Drama Architecture"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-aiide2005.pdf)

## Natural Language: Broad, Shallow, And Pragmatic

The NLU system is especially interesting now because LLMs make the surface problem look solved. Façade's authors did not try to parse complete meaning. They treated language understanding as dialog management: what social move did this utterance perform here? Phase 1 maps surface text into discourse acts; Phase 2 maps those acts, in context, into character reactions and possible story-state changes. [Mateas and Stern, "Natural Language Understanding in Façade"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-tidse2004.pdf)

The discourse acts include agreement, disagreement, positive or negative exclamation, emotional expression, uncertainty, thanks, greeting, alliance, opposition, apology, praise, criticism, flirtation, pacification, explanation, advice, object reference, intimacy, goodbye, inappropriate language, specialized miscellaneous acts, and a catch-all for unrecognized input. The many-to-few reduction is intentional. It loses nuance, but it gives the story engine stable action types that can drive state and authored reactions. [Mateas and Stern, "Natural Language Understanding in Façade"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-tidse2004.pdf)

For LLM-era story agents, the lesson is not to copy the shallow parser. The lesson is to preserve the action ontology. An LLM can do a better job mapping "I think Trip is pretending to like this apartment" into a structured action such as criticism of Trip, reference to decor, and possible alliance with Grace. But the system still needs the structured action if the user's move is supposed to change the story rather than merely prompt another plausible line of dialogue.

## ABL And Coordinated Character Performance

ABL matters because Façade is not one chatbot wearing two masks. Grace and Trip are separate believable agents coordinated through joint behaviors. ABL extends Hap-style reactive planning with mechanisms useful for multi-character story worlds, including joint goals, behavior coordination, conflict/suspension behavior, and authoring idioms for player-interruptible beats. [Mateas and Stern, "A Behavior Language for Story-based Believable Agents"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-is-2002.pdf)

That distinction is important for Shrimpy. A story-agent system with multiple voices or characters should not reduce everything to one monolithic prompt if the goal is inspectable architecture. It can still use one visible speaking agent, but the internal contributors should have names, responsibilities, logs, and scoped context. Façade's joint dialog behaviors are a concrete precedent: coordination is authored as a first-class behavior, not left to accidental transcript blending.

## Agency: Local, Global, And Uneven

Mateas and Stern distinguish local agency from global agency. Local agency is immediate, meaningful, context-specific response. Global agency is the sense that the full shape and outcome of the experience were determined by the player's actions in a way the player can understand. Façade had more success with local agency than global agency. The authors estimate strong local agency only part of the time, with many moments of partial, shallow, or missing reactivity. They also describe the ending as a calculus over the social games that selects one of several ending beats. [Mateas and Stern, "Structuring Content in the Façade Interactive Drama Architecture"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-aiide2005.pdf)

The honest failure analysis is as valuable as the system. The authors say authoring burden pushed them toward local agency at the expense of the drama manager's full global potential. They also identify a hard UI problem: when the "game state" lives in the characters' heads, the system must communicate it through performance. Affinity and hot-button state were easier to communicate than the more complex therapy game. [Mateas and Stern, "Structuring Content in the Façade Interactive Drama Architecture"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-aiide2005.pdf)

For Shrimpy, this suggests a strong design rule: if a story agent tracks hidden relationship or plot variables, it needs deliberate recapitulation points. The user should periodically hear, through character behavior or an explicit out-of-character inspector, how past moves are shaping the current situation. Otherwise the system may be stateful internally but feel arbitrary externally.

## Authoring Economics

Façade is astonishing partly because it was so expensive to author. The AIIDE paper says the project required roughly three person-years of authoring beyond architecture work, and that each joint dialog behavior required spoken lines, staging, emotion, and gesture specification. The authors conclude that future systems need higher-level authoring tools or more generative approaches to reduce the burden. [Mateas and Stern, "Structuring Content in the Façade Interactive Drama Architecture"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-aiide2005.pdf)

LLMs change the economics but not the shape of the problem. They can draft lines, paraphrase variants, infer discourse acts, summarize state, and maintain continuity. They do not automatically solve:

- what counts as a player action
- which hidden state variables matter
- how local moves accumulate into global story change
- when a character should ignore, deflect, escalate, or reveal
- how to avoid the expectation mismatch caused by open-ended input
- how to make the system inspectable enough to debug

The likely modern replacement for thousands of hand-authored joint dialog behaviors is not "just prompt the model harder." It is a hybrid: authored state machines and beat policies where structure matters, generative language where surface variation matters, and evaluation/logging around the boundary.

## Design Lessons For Shrimpy

### 1. Keep Character Agents Normal, Add Story Policy Around Them

The existing Shrimpy musing on character agents is aligned with Façade: the character should be an ordinary persistent agent, while internal voices and story managers contribute context rather than mutating identity. Façade adds the missing content architecture: a story agent needs explicit beat/state machinery around the session.

In Shrimpy terms:

- agent identity lives in the agent's instructions, memory, model choice, and tools
- story state lives in inspectable files or channel records
- a drama policy selects relevant state, beats, voices, and constraints
- context assembly injects the selected material into the character session
- the channel records what happened, including any visible performance and any backstage artifacts worth keeping

### 2. Treat Player Messages As Actions, Not Just Text

Façade's discourse-act layer is the key design move. A user message can be a question, an accusation, a refusal, a topic reference, a loyalty signal, a flirtation, a joke, a boundary, or a request to leave. Façade-style story agents should probably classify user turns into one or more structured moves before generation. The classifier can be an LLM, but the result should be written down enough for the rest of the system to use.

Possible Shrimpy story-action record:

```json
{
  "turn": "channel-message-id",
  "acts": [
    {"type": "criticize", "target": "trip", "confidence": 0.81},
    {"type": "refer_to_topic", "topic": "apartment_decor", "confidence": 0.74},
    {"type": "ally", "target": "grace", "confidence": 0.52}
  ],
  "state_effects": [
    {"path": "affinity.grace", "delta": 1},
    {"path": "tension", "delta": 1},
    {"path": "topics.apartment_decor.heat", "delta": 1}
  ]
}
```

The exact schema should not be designed yet, but this is the right category of artifact.

### 3. Use Sparse Plot Fronts To Avoid Branch Explosion

Façade's beats work because many conflicts can happen in different orders. Story-agent systems should avoid brittle branching trees and instead define fronts: relationship pressure, secrets, daily motifs, unresolved promises, setting facts, external events, internal voices, and pending reveals. A drama manager can then choose which front to press without requiring every possible total order to be written.

This maps well to Shrimpy's file-backed workspace. A character's lore and story state can be decomposed into fronts that watches or worker sessions maintain independently, then context assembly selects a small subset per turn.

### 4. Make Performance The Primary UI, But Keep Inspectors

Façade deliberately avoids visible scores. That is right for immersion, but hard for debugging. Shrimpy can separate user experience from maintainer inspection:

- user-facing channels receive character performance
- internal channels or trace artifacts show detected acts, selected beats, included voice snippets, and state deltas
- a CLI command can inspect a story agent's current state without forcing that state into the fiction

This follows Shrimpy's general bias toward legible systems without making the user-facing art project feel like a dashboard.

### 5. Design Failure Into The Scene

Façade benefits from the fact that Grace and Trip are self-absorbed, tense, and moving fast. They can believably ignore some player input, redirect, or react imperfectly. A story agent needs similar failure affordances. The character, setting, and interaction rhythm should make partial understanding acceptable.

For Shrimpy, that means a Façade-style character-agent experiment should start with a bounded scene, ritual, or relationship where deflection, silence, confusion, or topic changes can be narratively valid.

### 6. Separate Local And Global Agency In Evaluation

A story agent can feel good turn-by-turn while going nowhere, or it can have a rich hidden state machine that feels unresponsive moment-to-moment. Façade gives useful labels for this:

- local agency: did this turn respond to what the user meant?
- global agency: did repeated user behavior change the durable direction of the story?

Shrimpy story experiments should evaluate both. A daily-letter character, for example, should locally reflect yesterday's user message and globally evolve motifs, relationship, and lore over weeks.

### 7. Do Not Confuse Generated Prose With Dramatic Structure

LLMs make it easy to create convincing lines. Façade shows why lines are not enough. The hard part is the relation between lines, state, timing, reveal, and player agency. A story-agent architecture should make dramatic structure a first-class resource rather than relying on the model to rediscover it from a growing transcript.

## Possible Shrimpy Experiments

### Character Agent With A Story Ledger

Build one persistent character agent that writes normal replies but has a small story ledger:

- relationship affinity with the user
- recurring motifs
- unresolved promises
- secrets or lore not yet revealed
- current tension or mood
- recent user discourse acts

The character session sees a short rendered summary, while the ledger remains inspectable as a file or state artifact.

### Inner Voices As Beat Mix-ins

The current `character-agents.md` musing imagines inner voices as context producers. Façade suggests treating those voice outputs like beat mix-ins: short, optional inserts that can redirect tone, topic, or pressure without owning the whole turn. The context policy can select one or two voice snippets when they match the current beat or state.

### Drama Manager Watch

A watch or lightweight worker could run after user-visible character turns:

1. classify the user's last message into story acts
2. update story state
3. decide whether any beat/front is now eligible
4. leave a compact artifact for the next character session

This keeps the character generation turn simpler and makes the story-manager decision inspectable.

### Scene Mode

A stronger experiment would be a bounded "scene mode": one channel, one character or small cast, one location, one active dramatic premise, explicit scene state, and a target duration. The point would be to test Façade-style agency under constraints before broadening the premise.

### Agent-Protagonist Scene

An adjacent experiment would make the main character an agent and treat the human as an outside pressure source. The channel still records the scene, the drama manager still updates state and selects beats, and the character session still receives selected context. The difference is that the agent owns the protagonist continuity rather than the system assuming the human is the visitor inside the drama.

## Risks

- **Prompt-only drift:** the character sounds right but the story has no durable mechanics.
- **Opaque state:** hidden variables shape behavior but the user and maintainer cannot inspect why.
- **Scope mismatch:** a tightly managed dramatic-beat system can fail when the scene premise is broader than its authored state/action model.
- **Branch explosion:** authored beats become impossible to maintain if every event depends on every prior event.
- **LLM flattening:** the model smooths away tension, conflict, and hard consequences unless the drama policy preserves them.
- **No global payoff:** the system reacts locally but never lets accumulated user behavior change durable outcomes.

## Sources

- Michael Mateas and Andrew Stern, ["Interaction and Narrative"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-game-design-reader-2005.pdf), Game Design Reader chapter, 2005.
- Michael Mateas and Andrew Stern, ["Structuring Content in the Façade Interactive Drama Architecture"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-aiide2005.pdf), AIIDE, 2005.
- Michael Mateas and Andrew Stern, ["Build It to Understand It: Ludology Meets Narratology in Game Design Space"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-digra2005.pdf), DiGRA, 2005.
- Michael Mateas and Andrew Stern, ["A Behavior Language for Story-based Believable Agents"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-is-2002.pdf), 2002.
- Michael Mateas and Andrew Stern, ["Natural Language Understanding in Façade: Surface-text Processing"](https://users.soe.ucsc.edu/~michaelm/publications/mateas-tidse2004.pdf), TIDSE, 2004.
- ["Façade (video game)"](https://en.wikipedia.org/wiki/Fa%C3%A7ade_%28video_game%29), Wikipedia, accessed 2026-06-16, used only for release/reception summary details.
