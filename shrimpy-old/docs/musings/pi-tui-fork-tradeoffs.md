# 🦐 Pi TUI Fork Tradeoffs

Date: 2026-04-18
Status: Draft

## Purpose

Log rough thoughts on a possible Shrimpy terminal UI direction:

- do not use Pi's stock `InteractiveMode`
- instead build a semi-custom Shrimpy TUI inspired by Pi
- maybe keep Pi's lower layers
- maybe hard-fork more of Pi if needed

This is not a final architecture decision. It is just the current tradeoff shape as I understand it.

## Important Existing Seam

Right now Shrimpy already has a cleaner seam than I expected:

- Shrimpy owns session bootstrap, context assembly, and runtime tool wiring.
- The stock Pi TUI mostly enters at the final step where Shrimpy calls `InteractiveMode`.
- That means "custom Shrimpy TUI" and "replace all of Pi" are not the same decision.

That distinction matters a lot.

## The Three Real Paths

### 1. Keep Pi TUI, customize around it

This means staying close to stock Pi and using extensions, themes, widgets, custom tool rendering, custom footer/header, and similar affordances.

**Gain:**

- cheapest path
- lowest maintenance burden
- keep getting Pi improvements almost for free
- least likely to destabilize session/runtime behavior

**Lose:**

- Shrimpy still feels like Pi wearing a costume
- channel/session/home-agent ideas stay squeezed into a coding-agent UI
- some product taste will always be downstream of Pi's assumptions

### 2. Keep Pi runtime, replace only the TUI

This means keeping `createAgentSession`, `SessionManager`, `DefaultResourceLoader`, model/auth handling, tools, compaction, and the rest of Pi's coding-agent runtime, but writing a real `shrimpy tui` surface around session events.

**Gain:**

- most of the product-shaping power
- Shrimpy can make channels, addressed agents, session resets, ambient work, and home-style status first-class
- the UI can feel like Shrimpy instead of like a generic coding agent
- keeps the boring infrastructure Pi already solves
- likely best alignment with "strengthen boundaries instead of growing orchestration blobs"

**Lose:**

- still inherits Pi's runtime model underneath
- if Pi's context construction, compaction, session tree model, or extension system becomes the true constraint, the custom TUI does not solve that
- some UX ideas may still be awkward if the runtime emits events shaped around coding-agent assumptions

### 3. Build on the lower Pi libraries and semi-fork the rest

This means depending more directly on `pi-ai`, `pi-agent-core`, and `pi-tui`, or vendoring chunks of `pi-coding-agent`, so Shrimpy owns much more of the runtime and the surface.

This is the path that sounds attractive when the instinct is "I want Pi's useful pieces, but I want Shrimpy to actually be Shrimpy."

**Gain:**

- maximum product control
- UI and runtime can be designed together around Shrimpy's real concepts
- easier to make channels, sessions, context assembly, and budget-aware ambient behavior feel native
- less pressure to translate every Shrimpy idea back into coding-agent language
- less risk of Pi's future UX direction quietly steering Shrimpy

**Lose:**

- Shrimpy re-owns a lot more than a UI
- session persistence and session lifecycle become our problem
- resource loading and context-file assembly become our problem
- auth/model registry behavior becomes our problem
- built-in coding tools and their rendering become our problem
- compaction behavior becomes our problem
- extension compatibility becomes our problem
- upstream merge tax appears immediately if we vendor Pi code instead of fully rewriting the needed pieces

This is where the complexity jumps.

## What We Actually Gain From A Harder Fork

The real benefits are not mostly visual.

The real gains are:

- **A Shrimpy-native mental model**: the TUI can treat channels, surfaces, addressed-agent state, deliveries, and resets as first-class instead of as adaptations of a coding-session UI.
- **Cleaner multi-agent affordances**: a side panel, room view, home feed, agent presence, or delivery queue can exist because Shrimpy wants them, not because they fit inside Pi's editor/chat layout.
- **More legible context assembly**: if inspectable context construction is a core Shrimpy value, owning more of the surface and runtime may make that easier to expose directly.
- **Freedom from coding-agent defaults**: the product no longer has to pretend the primary unit is always one agent in one local code session talking in one transcript view.

If those become core product requirements, the fork starts to make more sense.

## What We Lose Beyond Engineering Time

The cost is not just "more code to maintain."

The deeper losses are:

- **Loss of leverage**: Pi already solves many low-value but fiddly problems.
- **Loss of upstream velocity**: every Pi improvement becomes something to port or re-implement.
- **Loss of proven weird-edge handling**: interactive shell behavior, keyboard handling, tool rendering, auth flows, session restoration, and compaction are all easy to underestimate until they break.
- **Loss of focus**: Shrimpy risks turning into a framework-maintenance project instead of a home-agent product.

That last one is the scary part.

## Current Read

My current read is:

- replacing Pi's stock TUI is pretty plausible
- replacing `pi-coding-agent` as the runtime is much bigger than it first sounds
- a full semi-fork only makes sense if Pi's runtime concepts themselves become the blocking constraint

Right now, the strongest near-term option seems to be:

- keep Pi's session/runtime layer
- build a Shrimpy-native TUI surface on top of session events
- only fork deeper if the runtime itself starts fighting Shrimpy's actual architecture

That path gets a lot of the gain without immediately taking on the full fork tax.

## Good Trigger For Going Deeper

A deeper fork becomes easier to justify if one or more of these become true:

- Shrimpy needs context assembly to be far more inspectable than Pi can reasonably support
- Shrimpy needs session state and channel state to be modeled differently at the runtime level, not just the UI level
- Pi compaction or session-tree behavior keeps forcing awkward product compromises
- extension compatibility stops mattering
- upstream Pi churn starts costing more than owning the relevant layer directly

If those are not true yet, a full semi-fork is probably premature.

## Current Bias

Bias for now:

- do not hard-fork Pi casually
- do not confuse "custom TUI" with "custom runtime"
- try the smaller seam first
- keep the deeper fork as an escalation path, not the default starting point
