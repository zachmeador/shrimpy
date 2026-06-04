# Agent Currency And Personal RL

Date: 2026-05-20
Status: Draft musing

## Prompt

The hunch: a breakthrough in useful personal-agent RL may involve something like an agent currency system.

That currency would give agents quantifiable high-impact goals to anchor on, and would offset the need for a human to manually tune every decision for token efficiency, compute efficiency, context size, model choice, wake cadence, and delegation.

## Core Claim

Budget is a constraint. Currency is a feedback system.

Shrimpy already talks about budget-aware agents: budget shapes cadence, context size, and model choice. That is necessary, but it is mostly defensive. It tells an agent what it cannot spend.

An agent currency would add a positive optimization target:

- spend fewer scarce resources
- create more verified user value
- preserve enough exploration to avoid local optima
- leave evidence that the value was real

In RL terms, this is interesting because the hard part is not only training. The hard part is defining reward signals that are local, private, inspectable, and connected to what the user actually cares about.

## Budget, Currency, Reward

These should stay separate:

- **Budget:** a quota or cap, such as tokens per day, tool calls per wake, max model class, or quiet-hours limits.
- **Currency:** an accounting unit that records costs, credits, transfers, and evidence across agents, sessions, tools, and outcomes.
- **Reward:** a training or eval signal derived from ledger entries under a versioned formula.

Budget prevents runaway behavior. Currency makes tradeoffs visible. Reward is what a trainer or eval harness may eventually consume.

The important move is not inventing a perfect economy. It is making agent work quantifiable enough that policy can improve without turning into hidden magic.

## What Could Be Priced

Costs:

- model tokens
- wall-clock time
- user attention
- tool calls
- failed commands
- retry loops
- stale wakeups
- latency-sensitive model choices
- privacy or risk class
- context size
- handoffs to other agents

Credits:

- completed task with accepted result
- passing tests
- valid structured output
- reduced future maintenance burden
- useful memory update
- accurate triage that avoided an unnecessary expensive wake
- successful delegation
- user correction incorporated
- time-based follow-up completed
- prevented regression or caught a real issue

The ledger should store the evidence, not just the number. A score without the session, command result, diff, user signal, or judge output behind it is too easy to game.

## Why This Could Matter For RL

Most personal-agent behavior has weak, delayed, messy feedback. The user usually does not want to label trajectories. The system still needs to learn:

- which work deserved an expensive model
- when a cheap triage pass was enough
- how much context was actually useful
- which agent should own a task
- when background work should stay silent
- when to ask the user instead of continuing
- which plans tend to finish cleanly

An agent currency can become the intermediate reward scaffold. It does not need to be the final RL algorithm. It can first drive normal runtime policy:

- context budgets
- model routing
- wake cadence
- delegation thresholds
- retry limits
- session summarization depth
- task prioritization

Later, the same ledger can export reward data or preference data into a trainer. That makes the currency useful before Shrimpy has a real RL stack.

## The Efficiency Angle

The human should not have to say "use 1,200 tokens here, wake every 4 hours, use cheap model X unless confidence drops below Y, and only delegate when Z."

That kind of tuning is brittle and tedious.

The better target is:

```text
maximize verified personal value per scarce resource, under user-visible caps
```

Then agents can discover some of the efficiency policy themselves:

- summarize more aggressively when summary quality remains acceptable
- avoid waking when recent wakeups had low yield
- spend on stronger models when past cheap attempts caused costly retries
- use deterministic checks before judge models
- stop doing background work that never produces accepted value

This turns token efficiency and compute efficiency from hand-authored rules into measurable pressure.

## Failure Modes

The currency idea is powerful enough to be dangerous if treated as too real.

Risks:

- reward hacking
- cheap visible wins crowding out necessary invisible work
- starving exploration
- agents optimizing for ledger entries instead of user intent
- false precision from arbitrary point values
- credit assignment across multiple agents becoming misleading
- judging style or verbosity instead of actual task success
- punishing agents for asking useful clarification questions
- currency inflation as more behaviors get rewarded
- overfitting to Shrimpy's current local habits

The system should assume the currency is a measurement instrument, not truth.

## Guardrails

Useful constraints:

- Keep ledger entries inspectable and deletable.
- Store evidence with every debit and credit.
- Prefer deterministic rewards before judge rewards.
- Version reward formulas.
- Keep raw events, interpreted signals, and training rewards separate.
- Let the user manually correct outcomes.
- Add expiry or decay so ancient credits do not dominate current policy.
- Track risk and privacy class separately from value.
- Use per-agent and per-role accounts to avoid one global soup.
- Preserve exploration budgets so the system can try non-obvious improvements.
- Never silently mutate prompts or policies based only on currency.
- Require A/B eval and rollback before trained adapters become defaults.

This matches Shrimpy's broader doctrine: files, logs, commands, and sessions beat hidden framework state.

## Small Shrimpy Version

The first implementation should be boring:

1. Capture session costs: tokens, model, tool calls, duration, retries, wake reason, owner, and channel/message path.
2. Capture outcome signals: accepted, corrected, abandoned, test result, command result, schema validity, user edit delta, or explicit rating.
3. Normalize those into an inspectable `impact_ledger` record with evidence pointers.
4. Add CLI commands to list, explain, correct, and export ledger entries.
5. Use the ledger only for reports at first.
6. Let scheduling, context size, and model choice read aggregate reports later.
7. Export tasksets and reward data only after the ledger has proven useful.

This keeps the currency useful even if RL training is deferred.

## Relationship To The RL Eval Watchlist

The current RL/eval note argues that Shrimpy should build capture, replay, tasksets, and reward/rubric infrastructure before adopting a trainer.

Agent currency is a sharper version of the same claim:

```text
private interaction stream
  -> typed evidence ledger
  -> currency-style cost/value accounting
  -> runtime policy improvements
  -> eval rewards and preference data
  -> trainer export when the ecosystem is ready
```

The likely product insight is that the currency/control plane may matter more than the trainer. Trainers can change. The private ledger of what was worth doing is the durable asset.

## Open Questions

- What is the smallest useful unit: credits, utility, impact, or something else?
- Should credits be transferable between agents, or only attached to outcomes?
- How should exploratory work be funded?
- How should long-horizon maintenance get credit?
- Can user attention cost be estimated without becoming creepy or annoying?
- What should be deterministic from day one?
- Which currency reports would change behavior before any RL exists?
- How does the ledger avoid becoming another opaque memory system?
