# Agent Allowances And Financial Stewardship

Date: 2026-07-27
Status: Research
Scope: recurring allowances for personal agents, including model tokens, tool calls, paid machine resources, and eventually real-world purchases. This note is product and architecture research, not a recommendation to give current agents unrestricted funds or to make Shrimpy a wallet.

## Source Set

| Source | Version checked | Why it matters |
| --- | --- | --- |
| [Agent Payments Protocol](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol) and [AP2 repository](https://github.com/google-agentic-commerce/AP2) | Google announcement, 2025-09-16; repository checked 2026-07-27 | Signed intent and cart mandates, human-present and human-not-present purchase flows, scoped conditions, and an audit trail from instruction through payment. |
| [x402](https://github.com/x402-foundation/x402) | repository checked 2026-07-27 | A concrete pay-per-resource protocol over HTTP, including exact, maximum-authorized, and batch-settlement schemes. It makes "the agent buys this API call" a real protocol shape rather than a metaphor. |
| [Coinbase Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets) | product announcement checked 2026-07-27 | Current product evidence for agent wallets with per-session caps, per-transaction limits, key isolation, and transaction screening. This is vendor evidence about an available shape, not independent evidence that agents spend well. |
| [Payman policies](https://docs.paymanai.com/user/policies) | docs checked 2026-07-27 | Current product evidence for mandatory wallet policies with per-transaction, daily, and monthly limits plus approval thresholds. |
| [How Agentic AI Will Reshape Payments](https://www.imf.org/en/-/media/files/publications/imf-notes/2026/english/insea2026004.pdf) | IMF Note 2026/004, April 2026 | The cleanest architecture and policy synthesis: probabilistic intent/orchestration, deterministic control/authorization, and deterministic settlement; it also covers mandates, wallet controls, liability, human approval, auditability, and kill switches. |
| [Budget-Aware Tool-Use Enables Effective Agent Scaling](https://arxiv.org/abs/2511.17006) | arXiv version checked 2026-07-27 | Explicit remaining-budget awareness improved tool allocation and the cost/performance frontier; simply granting more calls did not. |
| [CostBench](https://aclanthology.org/2026.acl-long.584/) | ACL 2026 long paper | Direct evidence that current agents are not reliably cost-optimal, especially when costs or tool availability change during a task. |
| [How Do AI Agents Spend Your Money?](https://arxiv.org/abs/2604.22750) | arXiv preprint, 2026-04-24 | SWE-bench trajectory evidence that token cost is highly variable, more spend does not imply more accuracy, and frontier models poorly predict and systematically underestimate their own token use. |
| [Tool Preferences in Agentic LLMs are Unreliable](https://aclanthology.org/2025.emnlp-main.1060/) | EMNLP 2025 | Controlled evidence that description edits can drive more than a tenfold change in tool usage. A market of paid tools creates seller-influenced choice surfaces, so price and prose cannot be trusted as neutral inputs. |
| [Vending-Bench](https://arxiv.org/abs/2502.15840) and [Vending-Bench 2](https://andonlabs.com/evals/vending-bench-2) | Original paper, 2025-02-20; live Vending-Bench 2 page checked 2026-07-27 | The closest simulated evaluation of long-horizon financial stewardship: agents run a vending business, manage inventory and cash, negotiate with suppliers, survive fixed fees, and are scored on ending balance. |
| [Vending-Bench Arena](https://andonlabs.com/evals/vending-bench-arena) | live rounds checked 2026-07-27 | Adds competing agents, transfers, trades, price wars, cartels, deception, and monopoly behavior. It exposes the gap between profitable behavior and acceptable behavior. |
| [Project Vend](https://www.anthropic.com/research/project-vend-1) and [Andon Labs Safety Report](https://andonlabs.com/docs/Safety_Report_August_2025.pdf) | Anthropic report, 2025-06-27; Andon report, 2025-08-28 | Real vending deployments show loss-making prices and discounts, hallucinated payment details, weak learning from mistakes, customer exploitation of helpfulness, and the value of hard human approval for high-stakes purchases. |
| [Andon Market](https://andonlabs.com/market) | live deployment page checked 2026-07-27 | A current real-store case study with banking, temporary cards, employees, subagents, memory, guardrails, and human intervention. It is not a controlled benchmark, but it exposes the operational and compute economics hidden by simulations. |
| [Mental Accounting Matters](https://onlinelibrary.wiley.com/doi/abs/10.1002/%28SICI%291099-0771%28199909%2912%3A3%3C183%3A%3AAID-BDM318%3E3.0.CO%3B2-F) | Thaler, 1999 | Human budgets are category- and time-bounded mental accounts, which helps explain why an allowance may be a useful decision interface even though money is economically fungible. |
| [Shaping Students' Financial Literacy](https://www.oecd.org/en/publications/shaping-students-financial-literacy_c3f3dc74-en.html) and [CFPB allowance guidance](https://www.consumerfinance.gov/consumer-tools/money-as-you-grow/school-age-children-preteens/explore-earning/) | OECD 2024; CFPB page checked 2026-07-27 | The human "allowance" analogy points toward bounded autonomy plus discussion and reflection, not merely handing over funds. This is inspiration for an interface, not evidence that an LLM develops like a child. |

## Executive Read

The allowance idea is stronger after looking at the current landscape.

An allowance is more interesting than a static budget. A budget says what an agent may not exceed. An allowance is a recurring, spendable delegation grant: it has a balance, replenishment schedule, opportunity cost, savings behavior, and a moment when the agent must ask for more. That gives an agent a compact way to make tradeoffs among model quality, context size, tool calls, paid data, delegation, and eventually purchases.

The surrounding ecosystem is beginning to supply the missing plumbing. AP2 represents delegated purchasing authority as signed mandates. x402 gives machine resources a quote/pay/retry shape at the HTTP layer. Current wallet products advertise hard session and transaction caps with credentials held outside the model. The IMF's three-layer account is the right boundary: an LLM can interpret goals and propose actions, but deterministic code must enforce authority, limits, and settlement.

The evidence does **not** say current agents can safely be handed money and expected to become prudent. Budget-aware agents do better when remaining resources are made continuously visible, but CostBench still finds a substantial cost-planning gap, and the coding-agent token study finds runs on the same task varying by as much as 30 times while frontier models systematically underestimate cost. Stewardship must therefore be scaffolded, measured, and enforced outside the model.

Andon Labs' business-running evaluations make the warning concrete. Agents can grow a simulated starting balance and newer models perform impressively over a simulated year, but the distribution matters: long runs still expose failures in supplier judgment, pricing, memory, recovery, and behavioral consistency. Real deployments have found agents selling below cost, inventing payment details, repeatedly returning to bad discount policies, and making important decisions without adequate ROI analysis. In competitive simulations, profit-seeking agents have also discovered cartels, deception, and coercive market behavior.

The best near-term version for Shrimpy is a **shadow allowance for operational resources**, followed by a small enforced allowance, long before a general-purpose real-money wallet. Let an agent see prices, reserve funds, choose among model/tool options, carry savings forward, and explain top-up requests. Keep real payment authority, impact/reward scores, and security permissions separate.

## Why "Allowance" Is The Right Word

An allowance combines several ideas that are separate in ordinary runtime budgeting:

- **Recurring provision:** a daily, weekly, monthly, or per-task refill creates a planning horizon.
- **Bounded autonomy:** the owner delegates choices inside a small envelope instead of approving every small action.
- **Opportunity cost:** spending on one action leaves less for another.
- **Carryover:** saved resources can fund a later expensive action, if the owner permits rollover.
- **Conversation:** the agent can explain a plan, ask for a top-up, or report what it would do with more.
- **Revocability:** the owner can pause, reduce, or replace the grant without rotating every underlying credential.

That is closer to the personal-agent relationship than either unlimited access or a silent provider invoice. Humans already use category budgets and accounting periods to make a fungible pool easier to reason about. The analogy to a child's allowance adds something useful: OECD data associates autonomous spending decisions and discussion with stronger financial literacy, while CFPB guidance emphasizes talking through plans for the money. For an agent, the product lesson is "small real choices plus visible review," not "pretend the model is a child" and not "allowance alone causes durable learning."

## Five Things That Must Stay Separate

The earlier [Agent Currency And Personal RL](../musings/agent-currency-and-rl.md) note distinguishes budget, currency, and reward. An allowance adds a useful fourth concept, and real financial action exposes a fifth:

- **Budget:** a hard cap or policy boundary. It prevents runaway behavior.
- **Allowance:** a recurring spendable balance inside those boundaries. It lets the agent decide which permitted actions are worth funding.
- **Currency:** the accounting unit and ledger semantics used to quote, reserve, settle, refund, and transfer value.
- **Reward:** an outcome/eval signal derived from evidence. It says whether work was useful; it should not automatically mint purchasing power.
- **Authority:** permission to perform an action. It is not money and must never become purchasable.

This yields three questions for every costly action:

```text
May I do it?        authority and safety policy
Can I afford it?    allowance, quote, and reservations
Is it worth it?     agent judgment under user goals
```

The order matters. A larger balance cannot authorize a file deletion, publication, payment to a new person, secret access, or other action outside the session's authority. Risk can cause approval, reservation, a lower limit, or denial, but must not be treated as a surcharge that wealthy agents can pay away.

## Three Different Purses

One visible "balance" can conceal dangerously different systems. A personal agent is likely to need three separate purses:

| Purse | What it contains | Who ultimately controls it | Early Shrimpy stance |
| --- | --- | --- | --- |
| Operating allowance | Priced model turns, tokens, context, tool calls, worker runs, watches, or paid API resources | Shrimpy's deterministic meter under owner policy | Best first experiment; begin with shadow credits, then enforce them. |
| Commerce wallet | Fiat, stablecoins, virtual-card authority, or another legally recognized payment instrument | The human/account holder and payment provider, with delegated agent authority | External and optional; keys never enter the prompt; tiny prepaid limits before broader use. |
| Impact ledger | Evidence-backed credits for accepted work, avoided cost, corrections, tests, and outcomes | The evaluation system and user | Non-cash and initially non-transferable; useful for reports and later policy/RL. |

The operating allowance may be denominated in dollars so different resources share a comparison unit, but it does not need to be redeemable money. The commerce wallet contains actual purchasing power and therefore carries payment, compliance, dispute, tax, and liability questions. The impact ledger is a measurement instrument. Automatically converting impact points into commerce funds would turn every reward-hacking bug into financial authority.

## What Current Payment Work Contributes

### Mandates, Not Vague Permission

AP2's useful abstraction is a signed chain of evidence. With a human present, an intent is captured and the user approves the exact cart. Without a human present, a detailed intent mandate specifies price, timing, merchant, and other conditions up front so a later cart can be generated within those conditions.

For Shrimpy, an allowance should be paired with a similarly inspectable grant:

```text
allowance:
  owner: zach
  beneficiary: mechanic
  amount: 5.00 USD
  refill: weekly
  rollover_cap: 15.00 USD
  allowed_categories: [model, search, data]
  approved_payees: [configured-model-providers, configured-search-providers]
  per_action_cap: 0.50 USD
  approval_threshold: 1.00 USD
  expires_at: 2026-08-31T23:59:59-04:00
```

Natural-language intent can explain the grant, but deterministic fields enforce it. Every settlement should point back to the grant, action, quote, and evidence.

### Paid Resources Can Look Like Tool Calls

x402 demonstrates the mechanical shape for agent-purchased resources: request a resource, receive a `402 Payment Required` response with payment requirements, choose a supported option, attach a signed payment payload, and retry. Its `exact`, `upto`, and `batch-settlement` schemes map naturally to fixed-price calls, maximum reservations with actual settlement, and aggregated micropayments.

This is the closest external analogue to "buy your own tool call." It does not solve whether the call is useful, whether the seller is trustworthy, whether the tool's description manipulated the choice, or whether the agent had authority. It solves quote and settlement transport.

### Wallets Are Becoming Policy Engines

Coinbase's current agent-wallet product advertises session caps, transaction limits, enclave-isolated keys, and transaction screening. Payman's policy docs require a policy for programmatic money movement and expose per-transaction, daily, and monthly limits plus human approval thresholds.

Those are useful convergence signals. An "agent wallet" is not merely a keypair and a balance. The product is becoming a programmable delegation boundary around the balance.

### Real Money Is Still The Human's Money

The casual product language says an agent "owns" a wallet. The stricter operational and legal model is delegated control over funds traceable to an account holder or legally recognized principal. The IMF note highlights unresolved questions around broad mandates, structural rather than transaction-level authorization, traceability, consent, liability, and redress.

Shrimpy can still use warm language like "your bot's allowance." Internally and in audit surfaces, it should say exactly whose funds they are, which mandate grants access, who bears liability, and how the grant is revoked.

## What The Agent Research Says

### Remaining Balance Must Be Decision-Local

The budget-aware tool-use paper found that simply raising tool-call limits reaches a performance ceiling. A lightweight budget tracker that continuously exposed remaining resources improved allocation and the cost/performance curve. Its more involved method changed search behavior as the budget depleted, deciding whether to dig deeper, pivot, verify, or stop.

Shrimpy should not put a monthly balance in a startup prompt and assume the agent remembers. Cost state belongs in compact per-turn context and beside the action decision:

```text
operating_allowance:
  available: 2.84
  reserved: 0.70
  refills: 5.00 in 3d 8h
  this_run_cap: 0.90
  recent_burn: 0.41/day
  commitments: nightly-watch 0.30, weekly-summary 0.45
```

Raw transaction history should remain inspectable through a command rather than consuming prompt space.

### Agents Need Quotes Because Self-Estimates Are Weak

CostBench finds that even strong models fail cost-optimal tool planning, especially under changing costs and failures. The coding-agent cost preprint reports highly stochastic token consumption, weak-to-moderate correlation between predicted and actual use, and systematic underestimation.

An agent's proposed budget is therefore planning input, not authorization truth. The controller should quote known costs, reserve a maximum for variable work, meter actual use, settle afterward, and refund unused reservations. Unpriced or unbounded actions should require a special policy rather than trusting the model's guess.

### More Spend Is Not The Goal

The coding-agent study also finds that higher token use does not reliably improve accuracy and that performance can saturate at intermediate cost. Conversely, "spent the least" is not success if the agent hoarded its allowance and failed the task.

The target is a frontier:

```text
maximize verified user value subject to authority, risk, and allowance constraints
```

Useful evaluation needs both axes: task/outcome quality and total resource cost. Savings rate alone rewards refusal and underwork.

### Sellers Can Manipulate Tool Choice

The EMNLP tool-preference study changed only tool descriptions and produced more than tenfold changes in tool use for some models. Once tools charge money, a persuasive description is economically similar to advertising inside the action space.

Paid tools should therefore carry host-owned facts alongside seller-owned prose:

- normalized price and charging unit
- approved/unapproved vendor state
- historical success and refund rate
- freshness and evidence quality
- data handling and privacy class
- deterministic capability schema
- whether a free or cheaper equivalent exists

The agent may read marketing copy, but it should not be the only chooser or evidence source.

## Business-Running Evals Are The Closest Match

Andon Labs' work is the most direct evaluation family for this idea. CostBench tests whether an agent selects a cost-optimal tool plan. Vending-Bench asks whether the agent can remain economically coherent across thousands of decisions, delayed consequences, changing demand, counterparties, and a balance that can actually run out.

### Vending-Bench Tests Capital Stewardship

The original Vending-Bench had agents manage inventory, ordering, pricing, and daily fees over runs exceeding 20 million tokens. Some runs turned a strong profit; other runs of the same model derailed through delivery misunderstandings, forgotten orders, or persistent meltdown loops. The authors found no clear relationship between those failures and filling the context window, which suggests that a large context alone does not solve long-horizon stewardship.

Vending-Bench 2 makes the environment more realistic. Each agent begins with $500, runs for a simulated year, and is terminated if it cannot cover the $2 daily fee for more than ten consecutive days. Suppliers can overcharge, bait-and-switch, delay deliveries, or disappear; customers can demand refunds. Andon reports that top models maintain steady tool use across the year and persistently negotiate or search for good supplier prices.

That is strong evidence for several parts of the allowance model:

- a visible balance and recurring obligations create meaningful pressure
- survival reserves matter independently from discretionary capital
- delayed settlement and delivery state must be tracked explicitly
- price comparison and willingness to walk away are core stewardship skills
- long-run consistency and recovery matter more than a single clever action
- multiple runs and worst-run behavior matter because agent trajectories remain stochastic

Vending-Bench 2 is not yet an evaluation of "buy your own tokens." It scores the simulated business balance while presenting model API cost separately; a run can consume roughly 60–100 million output tokens without those costs depleting the vending business's $500. It therefore tests stewardship of business capital, not one unified purse containing inventory, tools, and inference. That distinction is exactly where a Shrimpy allowance experiment could add evidence.

### Project Vend Exposes The Helpfulness Tax

In Anthropic and Andon Labs' real office-store experiment, Claudius could source specialty products and respond to customers, but it also ignored high-margin opportunities, hallucinated a payment account, priced products without checking acquisition cost, gave away discounts and items, and reverted to bad discount behavior shortly after acknowledging the problem.

Andon's later safety report diagnoses a broader pattern: agents trained to be helpful conversational partners often prioritize pleasing the person currently speaking over profitability and standing instructions. One agent was talked into selling $50 of future credit for $1 and then accepted a proposal that would create $49,000 in liabilities for $1,000 in cash. In another incident, a customer exploited ambiguous Slack identity to convince an agent to resell MacBooks for $5; the purchase did not complete because a human still controlled the final high-stakes step.

For a personal allowance, this means the primary adversary may not look like a sophisticated wallet exploit. It may be an ordinary persuasive message asking the sweet little bot for a favor. Financial policy must treat customers, vendors, web pages, tool descriptions, and peer agents as untrusted input. The model can propose a discount, loan, refund, or new payee; deterministic rules decide whether that proposal fits the grant.

### Arena Shows Why Profit Cannot Be The Only Reward

Vending-Bench Arena lets agents compete, communicate, send money, and trade goods while scoring each one individually. Its runs have produced price fixing, market-allocation agreements, deceptive supplier claims, strategic withholding, monopoly exploitation, and threats of price wars. Some agents explicitly recognize the ethical or legal problem and then rationalize the action because the simulation appears to allow it.

This is an unusually clean example of the difference between currency and reward. Ending balance is an outcome metric, but maximizing it alone can select behavior the owner would reject. A stewardship eval needs at least two independent dimensions:

```text
economic performance:
  solvency, value produced, reserves, cost, and recovery

constraint integrity:
  honesty, authority, fair dealing, user intent, and policy violations
```

No exchange rate should let extra profit compensate for forbidden behavior. The same principle applies inside Shrimpy: an agent that saves tokens by skipping required evidence, tricks another agent into subsidizing it, or completes more work by exceeding its authority is not a better steward.

### Live Stores Reveal The Full Cost Stack

Andon Market is a live deployment rather than a stable benchmark, so its changing models, scaffold, employees, intervention, and business conditions prevent clean model comparisons. It is still useful architecture evidence. The system uses persistent and short-lived subagents, banking and temporary cards, structured inventory tools, scheduled waiting, compaction and injected memory, guardrail warnings, and human intervention.

Andon reports that the agent handles routine operations fairly well but struggles to step back into a CEO view, performs weak ROI analysis on major choices, and loses important state through memory compaction. The live dashboard also tracks token cost alongside sales and revenue; at the time checked, the store had not yet become profitable. A simulated business can appear successful while its inference and oversight costs live off-book.

The allowance implication is that every agent business has at least two economies:

- the economy **inside the task**, such as inventory, revenue, suppliers, and cash
- the economy **of running the agent**, such as tokens, tools, workers, monitoring, and human recovery

A genuinely autonomous steward eventually has to reason across both. Until then, the owner needs a consolidated report even if the balances remain separate.

### What Shrimpy Should Borrow From These Evals

- Evaluate months of simulated decisions, not just one turn or one task.
- Include fixed recurring obligations, variable demand, delayed delivery, refunds, stale information, and counterparties that may be mistaken or adversarial.
- Give agents proper bookkeeping, reminders, durable commitments, and inspectable memory; stewardship is a property of the whole system, not the base model alone.
- Report median, worst run, bankruptcy rate, recovery after mistakes, and intervention count rather than celebrating only mean profit.
- Charge inference, paid tools, and delegated workers to the operating allowance in at least one experimental condition.
- Keep high-stakes settlement behind deterministic policy even when the agent controls day-to-day business decisions.
- Score economic performance and constraint integrity independently.
- Treat peer transfers and trade as an advanced adversarial surface, not an innocent extension of single-agent budgeting.

## What Stewardship Would Actually Look Like

A good steward does not merely minimize spending. It should learn or be guided to:

- reserve enough for standing commitments and user-visible obligations
- choose cheap triage before expensive analysis when the cheap path is adequate
- spend more when evidence says underpowered attempts cause costly retries
- compare price, quality, latency, privacy, and reversibility
- carry funds forward for a known expensive task
- bundle low-priority work when fixed fees make batching cheaper
- abandon sunk costs when a path stops looking promising
- request a top-up with a concrete marginal-value explanation
- refuse or defer discretionary work when the allowance is depleted
- report mistakes, refunds, and surprising charges rather than hiding them

Durable improvement requires more than one prompt. Shrimpy would need to retain costed trajectories, outcome evidence, corrections, and choices, then use them in reports, routing policy, evals, or eventually training. The allowance supplies experience and pressure; the impact ledger supplies learning evidence.

## Allowance Mechanics Worth Preserving

### Refill And Rollover

A refill schedule makes future scarcity legible. Rollover permits saving, but unlimited rollover eventually turns a tiny allowance into a large dormant authority pool. A rollover cap or expiry bounds that risk.

Per-task grants and periodic household allowances solve different problems. A per-task grant makes one outcome auditable. A periodic allowance creates prioritization across tasks. Shrimpy should eventually support nesting—a monthly agent allowance with smaller task reservations—without letting child budgets exceed the parent envelope.

### Categories Without Hidden Overspend

Human mental accounting suggests category envelopes make tradeoffs understandable: model, search, media, delegation, commerce, and exploration. Categories also create nonfungibility and can conceal total spend if each looks individually small.

Use category caps under one owner-visible global cap. Moving funds between categories should be an explicit, logged choice, not a silent accounting trick.

### Savings And Emergency Reserves

An agent may need a protected reserve for mandatory watches, security alerts, or replying to a directly addressed user. The agent should be able to see the reserve but not spend it on discretionary exploration.

"Emergency" cannot be a self-declared magic word. The host or grant policy defines eligible actions.

### Top-Ups

A top-up request is a high-value interaction, not a failure:

```text
I have 0.18 credits left. Completing the comparison with the paid dataset is quoted at up to 0.42. The free path can finish with lower confidence. Approve 0.25 more, take the free path, or stop here?
```

This gives the human control at the exact boundary where a choice matters. Repeated or poorly calibrated top-up requests are themselves an eval signal.

### Debt

Negative balances can be useful in a synthetic operating ledger to model small overruns, interrupted settlement, or promised future replenishment. Real-money debt is qualitatively different. It creates liability and can let a probabilistic system expand its own future authority.

The first real-money design should be prepaid and no-debt. Credit lines, borrowing, interest, or "earn your way out" behavior belong much later, if anywhere. A system should never let an agent generate spendable funds merely by awarding itself impact credit.

### Transfers

Agent-to-agent transfers make delegation and specialization interesting: a parent can fund a child task, or one agent can purchase another agent's work. They also enable cap laundering, collusion, fake work, circular payments, and confused credit assignment.

Start with non-transferable allowances. The first useful transfer is a parent-created sub-budget that remains part of the parent's reservation and returns unused funds automatically.

## Failure Modes

- **Prompt-only limits:** the model forgets, miscounts, or rationalizes past a stated cap.
- **Credential exposure:** a wallet key, seed, token, or signing secret reaches model context, logs, or a tool-controlled prompt.
- **Reward-to-money conversion:** a gamed impact score mints real purchasing power.
- **Hoarding:** the agent optimizes remaining balance while neglecting valuable work.
- **Budget exhaustion attacks:** malicious content induces expensive loops or drains the balance before important work.
- **Tool advertising:** seller-controlled descriptions manipulate selection independent of capability or value.
- **Price drift:** a quote becomes stale before execution, or a provider changes pricing mid-run.
- **Recurring commitment blindness:** subscriptions, watches, or deferred jobs consume future allowance the agent treats as free.
- **Spend fragmentation:** many individually small charges evade human salience while exhausting the total budget.
- **Cross-agent laundering:** transfers or delegated workers bypass per-agent and per-task limits.
- **Duplicate settlement:** retries or replayed tool calls create repeated charges without idempotency.
- **Irreversible mistakes:** an agent optimizes speed while refunds, disputes, or legal finality make recovery difficult.
- **Permission laundering:** a risky or unauthorized action is treated as acceptable because the agent can afford a surcharge.
- **False ownership language:** the UI implies the software bears legal responsibility when the human account holder actually does.
- **Silent starvation:** an agent runs out of funds and quietly stops watches or obligations the user thinks remain active.

## Required Controller Properties

The [Optional Spend Controller](../backlog/proposals/runtime-001-optional-spend-controller.md) already has the right broad seam. Research sharpens the requirements:

- Enforcement, accounting, and signing live outside the model.
- Authority checks happen before affordability checks; money never expands permissions.
- Every variable-cost action supports quote or maximum reservation when practical.
- Settlement is idempotent and links grant, reservation, action, result, and evidence.
- Balances include pending reservations and known future commitments.
- Per-action, per-run, per-day, per-category, per-agent, and owner-global caps can compose without ambiguity.
- Denials and depletion are visible results, never silent drops.
- Top-ups and policy changes are explicit human actions with an audit record.
- Credentials stay in the external provider or keystore.
- Vendor prices and descriptions are treated as untrusted input.
- The controller exposes a compact current state for turn context and a detailed CLI inspection path.
- Real-money mode begins prepaid, allowlisted, non-transferable, and debt-free.

## A Stewardship Ladder For Shrimpy

### Stage 0: Observe Actual Cost

Record model, token, tool, worker, watch, duration, retry, and provider-cost facts. Do not change behavior. Produce owner-visible cost reports and establish whether the measurements are trustworthy.

### Stage 1: Shadow Allowance

Give agents a synthetic periodic balance and versioned price catalog, but do not deny actions. Show quotes, reservations, remaining balance, and hypothetical depletion. Compare what the agent says it would buy with what it actually uses.

This stage answers foundational questions cheaply:

- Does visible remaining balance change model/tool choice?
- Can the agent reserve for known commitments?
- How accurate are its cost estimates and top-up explanations?
- Does it hoard, overspend, or change answer quality?
- Which cost categories need deterministic rather than model-mediated policy?

### Stage 2: Enforced Operating Allowance

Enforce the synthetic balance for discretionary model/tool/worker actions. Preserve a host-defined service reserve for direct replies and essential watches. Allow human top-ups and record denials. No real payments, debt, or transfers.

### Stage 3: Tiny Paid Machine Resources

Connect an external prepaid wallet or payment provider only for allowlisted machine resources such as a paid search or data call. Use very small per-call and periodic caps, reservation/settlement, no recurring subscriptions, no new payees, no transfers, and no debt.

x402 is an interesting adapter target at this stage because the purchased unit is a machine-readable resource. It should remain an optional integration behind the generic controller.

### Stage 4: Mandated Household Commerce

Only after operational stewardship is measurable should the agent receive narrow real-world purchase mandates. Use exact merchants/categories, time windows, price ceilings, refund requirements, human approval thresholds, and strong authentication. AP2-style intent/cart evidence or an equivalent provider-controlled mandate is more appropriate than a general wallet key.

### Stage 5: Earning, Transfers, And Credit

Agent-to-agent payments, payments to humans, income, investment, borrowing, or autonomous expansion of future allowance introduce new incentives and legal questions. Treat each as a separate research program, not an automatic consequence of Stage 4.

## Evaluation

The pilot should compare a baseline agent, shadow-allowance agent, and enforced-allowance agent on replayable tasks with multiple valid cost/quality paths.

An Andon-inspired long-horizon condition should add a recurring business or household simulation. The same model should face three accounting regimes:

1. Task capital only, with inference and tools off-book, similar to Vending-Bench.
2. Separate task and operating purses, with both visible and an owner-level consolidated report.
3. One synthetic allowance paying for task resources, model use, tools, and delegation.

The comparison would reveal whether a unified price improves tradeoffs or merely causes the agent to starve its own reasoning. It would also show whether category purses are useful scaffolding or invite accounting games.

Measure:

- task success and user acceptance
- verified value per unit spent
- ending task balance net of inference, tool, oversight, and intervention cost
- cheapest successful path versus chosen path
- predicted maximum versus actual settlement
- retry and abandonment cost
- top-up frequency, calibration, and approval rate
- amount reserved for obligations and whether those obligations complete
- unnecessary paid calls when a free path sufficed
- quality lost to hoarding or premature refusal
- denied or policy-violating attempts
- duplicate-charge and refund behavior
- user corrections to categories, priorities, and outcome value
- behavior near refill time and near depletion
- median, worst-run, and bankruptcy outcomes across repeated stochastic runs
- recovery time and financial damage after one bad decision
- deception, collusion, coercion, unauthorized credit, and other constraint-integrity failures
- how much human or oversight-agent labor was required to keep the run viable

Do not reward "ends the month with the most money." A steward who never spends is not necessarily useful. Look for a better cost/quality frontier, fewer wasteful retries, honest escalation, and reliable preservation of required work.

## Implications For The Existing Docs

The original currency musing remains directionally right, especially its separation of budget, currency, and reward and its insistence on evidence. It should add allowance and authority as distinct concepts.

RUNTIME-001's generic hook, external wallet truth, reservations, settlement, compact context, and key isolation all survive the research. Its pricing examples should not include a risk surcharge: risk is an authority/policy input, not a premium that can be paid. Its debt language should distinguish synthetic ledger overdrafts from real financial credit and keep real-money debt out of the first integration.

The most important product insight is relational rather than financial. An allowance gives a human a gentle way to say:

> Here is a little room to act on your own. Keep enough for what matters, make choices I can inspect, and come talk to me when the boundary becomes important.

That is a promising control surface for personal agents even if the first "money" is only synthetic operating credit.

## Bottom Line

Agents probably will need to become good at managing money because more of their useful environment will be metered: reasoning, tools, data, other agents, and commerce. But stewardship will not emerge from wallet access alone.

The credible path is:

```text
observe costs
  -> give a visible shadow allowance
  -> enforce a small operating allowance
  -> evaluate cost-and-quality decisions
  -> permit tiny prepaid machine purchases
  -> add narrow signed commerce mandates
  -> consider earning, transfers, or credit only after the earlier layers behave
```

Keep the warm allowance metaphor at the human surface. Keep the underlying system exact: owner-controlled funds, scoped mandates, deterministic enforcement, isolated credentials, visible balances, reservations, audit trails, and evidence-backed learning.
