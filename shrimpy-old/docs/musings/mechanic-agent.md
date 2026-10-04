# 🦐 Self-Modification Via A Mechanic Agent

Date: 2026-04-19
Status: Draft

## Purpose

Explore a simpler user-facing answer to a core home-agent question:

How does Shrimpy help a user modify Shrimpy itself?

The desired product feeling is:

- a home agent should make it effortless for the user to create complex, reliable software flows
- the same agent interface should work both for using the system and for extending it
- modifying the home should feel like talking to a capable in-house specialist, not guessing which hidden setup flow or skill might apply

## Core Claim

Shrimpy should likely ship with a default second agent dedicated to setup, repair, and extension work.

Call it `mechanic` for now. `admin` is a plausible conventional name or alias, but `mechanic` better matches the product feel: a capable specialist who works on the home itself.

The distinctive part is not its storage or runtime semantics. If `shrimpy agents` is built correctly, `mechanic` is just another normal agent. The product choice is that Shrimpy ships it by default with:

- a clear setup, repair, and extension job
- richer Shrimpy-specific context than the everyday home agent
- stronger default model/reasoning settings when available
- first claim on a capable hosted model endpoint during setup, before the everyday `shrimpy` agent is nudged toward a local/private model
- an obvious command/surface path for direct use and main-agent deferral

The important part is that this is not a new runtime species or a special storage shape. It is a normal bundled agent with a very clear job.

## Why This Feels Better Than Hidden Skill Suggestions

Skills are still useful, but they are a weak primary mental model for self-modification.

The problem is not that skills are bad. The problem is that "maybe the system should suggest or invoke a skill here" is framework-internal thinking, not the most intuitive user-facing story.

When a user wants to:

- get Shrimpy working for the first time
- add a new capability
- change how channels, models, or automations behave
- repair a broken workspace

the natural expectation is not "there must be a setup skill for this."

The natural expectation is closer to:

- "there is an agent in my home that knows how to work on the home itself"

That is a much cleaner product story.

## Target Shape

The default shape could be:

- **`shrimpy`** — the main general home agent the user normally talks to
- **`mechanic`** — a specialized maintainer/builder agent for the home itself
- **skills** — optional capability bundles either agent can use inside ordinary sessions

In that shape:

- the main agent can still answer questions about Shrimpy
- the main agent can inspect mechanic logs and workspace files like any other files
- the main agent knows to defer actual Shrimpy modification work to the mechanic when the request is about setup, repair, config change, or framework extension
- the mechanic can use setup or repair skills internally without the user having to know that implementation detail

This keeps skills in the right place: session resources, not the main product abstraction the user has to reason about.

The mechanic agent should usually default to a more capable paid model, more deliberate reasoning, and richer Shrimpy-specific context than the ordinary home agent. This matters because Shrimpy can encourage the everyday `shrimpy` agent toward a local model for privacy, while the mechanic still needs enough capability for large coding, repair, and setup tasks. That should come from normal agent config and context resources. This is a policy/config default, not a new privilege boundary.

## What The Mechanic Agent Would Own

`mechanic` should probably own work like:

- first-run setup after at least one model works
- guided environment shaping for channels, agents, and defaults
- safe edits to workspace config and workspace docs
- installing or shaping agent skills
- helping the user add new local software flows and automations
- debugging broken config or runtime drift
- helping extend Shrimpy itself when the user is working inside the project repo

The specialization matters because it creates continuity.

A mechanic agent with its own `MEMORY.md` can remember things like:

- which providers the user prefers
- what kinds of automations or app-agents the user tends to add
- recurring mistakes or drift in the user's workspace
- house style for how this user wants their home system organized

That is a much better fit than treating setup/repair as stateless one-off skill prompts.

## What This Should Not Mean

This idea should not require:

- a privileged hidden control plane for one special agent
- the mechanic silently mutating the main agent's identity
- a second unrelated clock, session type, or surface model
- replacing skills with agents everywhere
- forcing the user to always talk to the mechanic directly

The clean version is still plain Shrimpy architecture:

- agents are persistent identities with instructions and memory
- channels are routing and logs
- sessions are where the actual instructions run
- skills are prompt bundles for ordinary sessions

The mechanic is just a better default app-agent for self-modification.

## First-Run Interpretation

This reframes setup in a useful way.

Instead of the polished setup story being "hand off to a base setup skill," the more legible story is:

1. `shrimpy setup` gets the mechanic model working first, usually by asking for an OpenAI or Anthropic key if no capable hosted endpoint is configured.
2. Shrimpy launches the default mechanic agent.
3. The mechanic guides the rest of the home setup.
4. The mechanic uses any setup skill/resources it needs internally.

That keeps the implementation freedom of skills without making the user think in skill-shaped terms.

It also creates a better continuity story. Later, when the user says "change my Telegram setup" or "add a reliable morning routine flow," they are effectively returning to the same specialist who helped build the home in the first place.

This makes the setup wizard one instance of a broader guided-session pattern. Shrimpy can launch interactive sessions for power-up flows: initial setup, adding a surface, creating a new app-agent, installing a skill, choosing model defaults, or shaping a recurring automation. The common shape is not a hidden wizard engine; it is a normal agent session with the right specialist, context, and skill resources.

## Ongoing Self-Modification

The mechanic agent also gives the main home agent a clean delegation target.

Example flow:

1. The user asks `shrimpy` to change some part of the home.
2. `shrimpy` decides this is real home-modification work, not just explanation.
3. `shrimpy` invokes or routes to `mechanic`.
4. `mechanic` inspects files, edits config/docs/code, validates the result, and leaves an inspectable trail.
5. `shrimpy` can summarize the outcome back to the user if the surface wants one main visible persona.

That feels more intentional than either:

- the main agent pretending to be equally specialized at everything
- the framework quietly injecting skill hints behind the scenes

## Why This Seems Low Complexity

If the agent/session architecture is already mature, this should not add much runtime complexity.

The framework already wants:

- persistent agents
- agent-specific memory
- inspectable sessions
- ordinary agent-to-agent interaction
- file-backed logs and context resources

So the mechanic should mostly be a packaging and default-behavior decision, not a novel subsystem.

The expensive mistake would be treating self-modification as special enough to justify a separate hidden execution model. A bundled maintenance agent is the simpler move.

## CLI Implications

If this direction is right, Shrimpy should expose it explicitly in the CLI.

Possible shape:

- `shrimpy setup` launches model setup if needed, then opens a mechanic-guided setup session
- `shrimpy mechanic` opens a direct TUI session with `mechanic`
- repair-oriented work returns to the same `shrimpy mechanic` front door instead of adding a separate top-level doctor product

That fits the rule that every real feature should be reachable through a normal `shrimpy <command>` path.

## Relationship To Skills

This idea does not weaken the case for skills. It probably strengthens it.

The cleaner split is:

- **agent** — who owns the job and continuity
- **skill** — reusable instructions/resources the agent may use while doing that job

So:

- the user thinks "ask mechanic"
- the framework thinks "open an ordinary mechanic session with these resources"
- the mechanic may think "I should use the setup, repair, or automation-building skill bundle here"

That stack is easier to explain than asking the user to reason upward from skills.

## Backlog Implications

This likely changes the framing of several current items.

- `ADMIN-001` should establish the bundled mechanic agent, default workspace shape, richer mechanic context, and guided setup ownership without changing the ordinary agent contract.
- `MECH-002` should establish `shrimpy mechanic` as the direct maintenance TUI command; repair can be a mechanic-led workflow rather than a separate doctor identity.
- Future skill work still matters, but its scope becomes more implementation-facing. Skills remain important session material, while the user-facing product abstraction for self-modification becomes the mechanic agent.
- Architecture work may benefit from this because it clarifies one more clean role split: general home-agent behavior versus home-maintenance specialization.

This is mostly a scope clarification, not a contradiction of the current architecture direction.

## Litmus-Test Questions

This direction is probably good if the answer to most of these is yes:

- Can a user discover home modification through an obvious agent identity instead of hidden framework behavior?
- Can the mechanic be implemented as an ordinary bundled agent, not a bespoke runtime feature?
- Can the main `shrimpy` agent defer modification work cleanly while still inspecting the mechanic's outputs?
- Can setup, repair, and extension work build continuity through the mechanic's own memory?
- Can skills stay explicit and inspectable without becoming the product's main mental model?
- Can a user create increasingly complex home software flows without leaving the ordinary agent interface?

## Product Interpretation

The deeper point is not just "add another agent."

The deeper point is that a good home-agent framework should help the user improve the home from inside the home, using the same conversational surface they already trust.

If Shrimpy gets that right, then self-modification stops feeling like developer plumbing and starts feeling like one of the system's core strengths.
