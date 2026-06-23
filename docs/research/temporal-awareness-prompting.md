# Temporal Awareness Prompting for LLM Agents

Date: 2026-06-17
Status: Research
Scope: prompt and context engineering for Shrimpy; training, model architecture, and large memory-system rebuilds are out of scope except where they expose a useful prompt-side lesson.

## Source Set

| Paper | Version checked | Why it matters for Shrimpy |
| --- | --- | --- |
| [Real-Time Deadlines Reveal Temporal Awareness Failures in LLM Strategic Dialogues](https://arxiv.org/abs/2601.13206) | arXiv v1, submitted 2026-01-19 | Cleanest evidence that adding per-turn temporal state can change autonomous agent behavior, and that qualitative urgency can outperform a numeric countdown. |
| [Your LLM Agents are Temporally Blind: The Misalignment Between Tool Use Decisions and Human Time Perception](https://arxiv.org/abs/2510.23853) | arXiv v3, revised 2026-04-15; ACL 2026 Findings | Directly studies the prompt/context question for tool use: timestamps, explicit elapsed time, general reminders, and few-shot temporal rules. Data: [TicToc](https://huggingface.co/datasets/yizecheng/TicToc); code: [chengez/TicToc](https://github.com/chengez/TicToc). |
| [Discrete Minds in a Continuous World: Do Language Models Know Time Passes?](https://arxiv.org/abs/2506.05790) | arXiv v1, submitted 2025-06-06 | Shows models respond to urgency prompts by shortening answers, but time-pressure adaptation is model-dependent and entangled with token latency. |

## Executive Read

The papers do not support "put the current date in the prompt and hope." They support a stronger and narrower pattern: make time task-local, decision-local, and action-linked.

The repeated finding is that models often can respond to a temporal cue when it is placed directly beside the decision, but do not reliably derive the right cue from raw timestamps, old context, or a one-time statement of the deadline. Shrimpy already has useful raw material: a current time fact, per-turn time, relative ages for watches, user interaction, sessions, workers, command-source caching, and channel unread state. The gap is that those facts are mostly telemetry. They do not consistently say what changed because of time, what is stale, what is urgent, what can be trusted, or what behavior should adapt.

The highest-value prompt-side improvements look small:

- Label the per-turn temporal state as authoritative over older session text.
- Attach freshness metadata to cached/generated context: observed_at, age, fresh_for, stale_after, and whether the host reused cached output.
- Add qualitative salience labels next to numeric time: fresh, stale, overdue, urgent, waiting, idle, no active deadline.
- Give agents tiny temporal decision rules for common Shrimpy cases: live data, watches, background workers, user follow-ups after a gap, and repeated requests.
- Avoid one global "be aware of time" instruction. The temporally-blind paper tried that shape and found little to no effect for most models.

## Current Shrimpy Shape

Shrimpy already exposes time in several places:

- `src/sessions/contained-system-prompt.ts` renders Pi runtime facts, including `Current time: ...; UTC: ...` and cwd.
- `src/context/turn/render.ts` renders per-turn `[turn-context]` with `time: ...`.
- `src/context/turn/service.ts` adds gateway status: last watch run, next watch run, and last user interaction.
- `src/context/turn/agent-watches.ts` summarizes watch state: enabled/disabled, trigger text, target channels, next run, last run, active run, and important diagnostics.
- `src/context/turn/session-status.ts` adds active/stale session counts on generated watch turns.
- `src/context/turn/workers.ts` adds owned worker outcomes and ages.
- `src/context/turn/service.ts` caches command-source output according to `freshForMs`.
- `docs/reference/turn-context.md` documents generated turn context and inspection commands.

That is a strong substrate. The most suspicious parts, viewed through these papers:

- Shrimpy has at least two model-visible "now" surfaces: Pi runtime facts and turn context. The source also has a `before_agent_start` prompt-containment hook, while reference docs describe a stable session prompt. A follow-up implementation/doc audit should clarify which "Current time" the model actually sees per session type, how often it refreshes, and whether the turn-context time should be explicitly authoritative.
- The turn-context instruction says the context is background to use "when relevant." The papers suggest time often needs stronger placement than ordinary background, because models frequently ignore temporal cues unless they are decision-local.
- Command-source caching is invisible unless the command output includes its own timestamp. When Shrimpy reuses cached command items inside `freshForMs`, the model may see an alert without knowing whether it was observed 1 second or 59 seconds ago.
- Watch context tells the model next/last/active state, but not an explicit behavior cue such as "this is a scheduled nudge; no user is waiting" or "this fired late; compress and prioritize overdue checks."
- Path-indexed memory context has no framework-owned temporal validity. A note in `context/people/` or `context/channels/` can be durable, stale, or time-sensitive, but the renderer does not distinguish those cases.
- Session and worker ages are visible, but there is no general stale/fresh rule tying age to action. The agent must infer the policy from project instructions, if any.

## Paper 1: Real-Time Deadlines

This paper tested paired LLM agents in multi-issue hiring negotiations under real-time deadlines. The key manipulation was prompt/context only. In the control condition, agents were told the total time budget once. In the time-aware condition, agents received the same total budget plus a per-turn remaining-time prefix such as `(137 seconds left)`. The agents had the same payoff tables, outside options, action schema, and transcript history.

The main result is stark: for GPT-5.1-chat-latest, deal closure rose from 4% to 32.3% when remaining time was surfaced per turn. Offers in the time-aware condition were over six times more likely to be accepted after controlling for deadline and payoff. The content and quality of offers barely changed: first-offer and final joint payoffs were nearly identical. The difference was not "the model negotiated better"; it was "the model accepted/moved at the right time more often."

The turn-limit control is the clearest diagnosis. When equivalent constraints were expressed as 5 to 9 collective utterances rather than wall-clock time, GPT-5.1-chat-latest closed 98% to 100% of deals. That suggests the agents could handle the strategic task when the constraint was token/turn-aligned. The failure was translating continuous time into strategy.

The oddest and most Shrimpy-relevant result is the urgency ablation. The authors added a per-turn qualitative cue, `(Deadline approaching--act with urgency.)`, without giving the numeric countdown. That condition outperformed the numeric time-aware condition overall. Their interpretation is important: the bottleneck is not just exposing a countdown; it is mapping time pressure into an action policy such as accepting a reasonable offer, simplifying the next proposal, or making concessions.

Other odd findings:

- GPT-4.1, a non-reasoning model, had the highest closure rates among tested models: 44.7% control and 72.0% time-aware. Temporal adaptation did not require explicit reasoning mode.
- Claude Sonnet 4.5 had near-floor deal closure in this setup even with reasoning, so temporal-awareness deficits are diagnosable only when baseline task competence is high enough.
- Qwen3-8B with reasoning disabled was almost insensitive to time feedback, while reasoning-enabled Qwen3-8B got much worse. The authors traced this to very long reasoning output, about 2,500 reasoning tokens per utterance, consuming the simulated time budget before enough turns could happen.
- Removing the text-to-speech latency assumption did not remove the pattern. With no latency, time-aware negotiation still strongly outperformed control at shorter deadlines.

Shrimpy implication: do not stop at exact timestamps. Add qualitative temporal salience when the host can infer it. "Overdue", "user may be waiting", "scheduled check", "no active deadline", "live data likely stale", and "recent enough to reuse" are likely more useful than raw ISO timestamps alone.

## Paper 2: Temporally Blind Tool Use

This paper is the closest match to the prompt-engineering question. It asks whether agents decide correctly between reusing prior context and making a fresh tool call when time has passed. Their term "temporal blindness" means agents assume a stationary context by default, causing two opposite mistakes: over-relying on stale context and skipping needed tool calls, or under-relying on fresh context and redundantly calling tools.

They built TicToc: 76 scenarios across low, medium, and high time sensitivity. Examples include slow-changing domains like policy or safety data, medium-changing domains like hotel availability or hiking trail conditions, and high-changing domains like ICU vitals, stock order books, ride-hailing dispatch, live vehicle GPS, or parking reservations. Each trajectory was paired with three elapsed-time settings, producing 5,592 samples before filtering. Human annotators chose whether direct answer or tool use was preferable; after excluding uncertain samples, the evaluation set had 3,016 retained samples with high agreement.

The timestamp manipulation was practical: prepend ISO 8601 timestamps to user, assistant, and tool messages. For proprietary models, they prepended the timestamp string to message text. Appendix B tested an easier variant where the host also supplied explicit elapsed time, delegating delta calculation to the system.

The results are cautionary:

- Without timestamps, most models were near random; the best normalized alignment rate was just above 55%.
- With timestamps, some OpenAI and larger Qwen models improved, but no model exceeded 65% normalized alignment.
- Explicit elapsed-time values helped little beyond absolute timestamps. For most models there was no gain; where present, it was only about 1% to 4%.
- Timestamps often increased tool-call attempt rates for both cases where humans preferred tools and cases where humans preferred no tool. That is not temporal alignment; it is a generic "maybe call tools more" bias.
- Tool-use tendency varied wildly by model. Some models called tools almost everywhere; OpenAI and Qwen models tended to avoid calls more often.

The paper's prompt-engineering result is especially relevant. A minimal system reminder, roughly "the environment may be dynamic; be aware of elapsed time", had little to no effect. A stronger few-shot instruction with concrete examples did help advanced reasoning models such as o3 and o4-mini, but most models saw marginal or no effect. The examples were not generic timestamps; they encoded domain rates. A garden moisture reading from five minutes ago can be reused; after four days it should be checked again. A gradebook checked seconds ago can be reused; after many days it should be checked again.

The failure analysis is useful for Shrimpy:

- Models appear to use conversation length as a staleness heuristic. Longer trajectories caused more tool calls and lower alignment even when elapsed time was controlled. For Shrimpy, a long channel history or long session is not the same as stale evidence.
- Reasoning traces often omitted time. In Qwen3 reasoning traces, exact timestamps appeared in fewer than 4% of traces, and broader time keywords appeared in under 15%.
- Reasoning did not materially improve temporal alignment. The model may have the raw ability to reason about dates, but not spontaneously apply it to "should I call a tool again?"
- Some models had think-answer mismatches. A model might reason that no tool is needed and then call one anyway, creating false positives.

Shrimpy implication: a bare "be aware of time" rule is probably low value. A small library of scenario-specific temporal policies is more promising. The host should classify context and tool outputs by volatility, surface elapsed time and freshness, and then give a direct action hint when the classification is clear.

## Paper 3: Discrete Minds

This paper separates temporal reasoning from perception of time passing. Its Token-Time Hypothesis says models may treat token count and sequence length as a proxy for time. That matters because an LLM cannot observe real wall-clock passage while it is idle between messages, but during generation it could map output tokens to elapsed time if generation speed is known or implied.

The paper has three experiments:

- Dialogue duration judgment: can models judge which conversation took longer, using tokens, timestamps, or hints?
- Urgency-aware QA: do models shorten responses when the user says time is urgent?
- BombRush: can models adapt behavior in a dynamic gridworld where remaining time decreases as generated tokens consume simulated seconds?

The urgency-aware QA result is the prompt-side lesson. They appended urgency expressions to otherwise normal QA prompts and measured accuracy plus output tokens across OpenbookQA, GSM8K, and GPQA. Nearly all models reduced token usage under urgency. Accuracy stayed nearly identical on easier tasks. Oddly, on the difficult GPQA set, five of six models improved accuracy under urgency; Qwen-72B improved by 8.2%, DeepSeek-R1-Distill-Llama-70B by 12.2%, and QwQ-32B by 4.9%. The authors speculate urgency may reduce unnecessary exploratory reasoning and overthinking.

BombRush adds an agent-loop lesson. The environment showed map state, bomb signal, and remaining seconds each step. Output token length consumed time. Models generally reduced token usage as time diminished, but adaptation was uneven. Qwen-2.5-72B changed little because it was already concise. Reasoning models could succeed but sometimes timed out because of verbose reasoning. The analysis also showed that explicit reasoning mentions of token-to-wall-time mapping were rare for some models: Qwen-2.5 had effectively none, even though its concise style could still behave time-efficiently.

Shrimpy implication: time pressure should be allowed to change response style and reasoning budget, not only tool decisions. In watch-triggered or user-waiting contexts, a concise answer or a quick status message may be better than a full reflective pass. Conversely, scheduled background watches with no user waiting may be allowed to think longer.

## Cross-Paper Lessons For Shrimpy

1. Put temporal state beside the decision. The deadline paper improved behavior by adding per-turn state. The tool-use paper showed message timestamps alone were weak. Shrimpy's turn context is the right place, but the time facts should be more decision-shaped.

2. Numeric time is not enough. The urgency cue beating the numeric countdown is the biggest practical result. Shrimpy should include both exact facts and labels like overdue, urgent, fresh, stale, or waiting.

3. Staleness is domain-specific. Five minutes is stale for an order book and fresh for plant moisture. A single global stale threshold will be wrong. Shrimpy context sources, memory notes, watch definitions, and tool wrappers could carry volatility classes.

4. Conversation length is a bad clock. Models may overuse turns as a proxy for stale evidence. Shrimpy should prefer explicit observed_at and elapsed values over relying on long transcripts to imply age.

5. Time affects style, not just facts. Urgency prompts shortened responses without hurting accuracy and sometimes improved difficult-task accuracy. Shrimpy could deliberately set response-depth cues for time-sensitive turns.

6. Reasoning can be a time cost. In real-time or user-waiting contexts, high reasoning effort may be counterproductive. Shrimpy already has thinking configuration; time context could eventually inform when a session should run with lower thinking or issue a quick interim report.

7. The host should calculate deltas. Even explicit delta time only partly helped in TicToc, but it removes a needless burden. Shrimpy should not expect the model to subtract timestamps.

8. Prompt examples should encode rates. The useful few-shot examples in TicToc were really "how fast this kind of world changes" examples. Shrimpy should teach policies such as live sensors expire quickly, channel history is durable, user preferences persist unless contradicted, and command output has a configured freshness window.

## Design Candidates

These are not settled recommendations. They are small Shrimpy-shaped ideas suggested by the papers.

### 1. Authoritative Temporal State Block

Add a clearer per-turn temporal section near the top of turn context:

```text
## Temporal State
now: 2026-06-17 14:03:12 EDT; UTC: 2026-06-17T18:03:12.000Z
authoritative_for_this_turn: yes
session_opened: 3h ago
last_user_message_in_channel: 47m ago
agent_last_handled_channel: 2h ago
turn_source: watch
watch_fire: due 5m ago; fired 1m ago; cadence daily
deadline: none
salience: scheduled background check; no active user is waiting
```

The important part is not the exact fields. It is the explicit "authoritative_for_this_turn" and "salience" labels. This helps avoid conflict with older session text or stale prompt facts.

### 2. Freshness Wrapper For Command Sources

Today command-source `freshForMs` is a cache control, but the rendered item can hide whether it was reused. Wrap command items with host metadata:

```text
- finance_alerts: cached command context; observed 42s ago; fresh_for=60s; expires in 18s
  summary: ...
  inspect: shrimpy context sources run finance_alerts --agent shrimpy --channel finance
```

If the command result itself includes an observation timestamp, keep both: host_observed_at and source_observed_at. The host timestamp says when Shrimpy saw the output; the source timestamp says when the underlying world was observed.

### 3. Volatility Classes

Add optional metadata for sources and maybe memory files:

```jsonc
{
  "type": "command",
  "id": "weather_alerts",
  "command": "weather-shrimpy alerts context",
  "channels": ["home"],
  "freshForMs": 300000,
  "volatility": "live",
  "staleAfterMs": 900000
}
```

Possible classes:

- `durable`: identity, durable preferences, project conventions.
- `slow`: docs, long-running project facts, channel summaries.
- `daily`: schedules, reminders, planned tasks.
- `live`: weather, availability, build status, inboxes, market-ish data.
- `volatile`: sensors, auctions, queue positions, GPS, active incidents.

The class can drive a short action cue: "reuse", "verify if answering directly", "call tool before acting", or "ask if freshness matters."

### 4. Temporal Policy Snippets

Instead of one global reminder, add compact examples tied to Shrimpy's own surfaces:

```text
Temporal policy:
- If a tool or command result is marked stale and the answer depends on its current value, refresh or inspect before acting.
- If a watch turn says no user is waiting, prefer a complete check over a rushed reply.
- If a recent user follow-up asks "still?", compare the prior observation age with the source volatility before reusing it.
- If a user is waiting and time is short, send a concise status update before doing long background work.
```

This matches the TicToc finding: examples/rules beat generic reminders, at least for stronger reasoning models.

### 5. Watch-Specific Temporal Cues

Watch context could separate schedule semantics from status telemetry:

```text
watch_context:
kind: scheduled_nudge
expected_behavior: check the watched condition, report only if action is needed
scheduled_for: 09:00
fired_at: 09:07
lateness: 7m
last_success: 1d ago
next_due: in 23h
```

This gives the agent an operational frame: "this woke because of a schedule" rather than just "a watch exists."

### 6. Time-Aware Response Depth

Add a derived hint for direct/user-visible turns:

```text
response_depth_hint: concise; user has waited 47m and this is a direct follow-up
```

or:

```text
response_depth_hint: thorough; scheduled background watch, no active user waiting
```

This is inspired by both the urgency ablation and the urgency-aware QA results. It should be a hint, not a hard rule.

### 7. Tool Result Memory With Ages

For repeated requests, Shrimpy could eventually maintain a lightweight per-session/per-channel index of recent tool observations:

```text
recent_observations:
- source=calendar_check observed=12m ago volatility=daily result="no event at 3pm"
- source=weather_check observed=2h ago volatility=live result="rain likely"
```

This is more useful than expecting the model to scan old transcript entries and infer staleness from timestamps. Keep it compact and inspectable.

## Anti-Patterns

- One-time session-start "Current time" without per-turn temporal state.
- A generic "be aware of elapsed time" instruction with no concrete rates or actions.
- Raw timestamps without elapsed deltas.
- Elapsed deltas without volatility or freshness semantics.
- Hidden cache reuse where the model cannot tell whether context is freshly observed or cached.
- Treating long conversations as stale and short conversations as fresh.
- Letting high reasoning effort burn real-time budgets on user-waiting or deadline turns.
- Marking everything urgent. The papers suggest urgency works because it is local and salient; constant urgency becomes noise.

## Particularly Odd Findings

- A non-numeric urgency cue beat a numeric countdown in the deadline paper. This is unintuitive but useful: labels can be more action-directing than measurements.
- GPT-4.1 without explicit reasoning was the strongest negotiator in the deadline paper. More reasoning was not inherently more time-aware.
- Qwen3-8B reasoning-enabled got worse in real-time negotiation because reasoning tokens consumed the time budget.
- In TicToc, explicit elapsed time barely improved over absolute timestamps for most models. The bottleneck was not only arithmetic.
- In TicToc, adding timestamps increased tool calls in both prefer-tool and prefer-no-tool cases, so "more temporal metadata" can degrade precision by making the model generally more tool-happy.
- TicToc found models may treat more conversation turns as "staler", independent of actual elapsed time.
- Qwen3 reasoning traces almost never mentioned exact timestamps, even when timestamps were present and relevant.
- Discrete Minds found urgency sometimes improved accuracy on hard GPQA questions while shortening output, which cuts against the usual "longer reasoning is better" intuition.
- BombRush found some models behaved time-efficiently without verbalizing time awareness. Conversely, explicit time talk did not guarantee correct time-sensitive behavior.

## Suggested Shrimpy Evaluation Tasks

These could be simple local harnesses, not full benchmarks.

1. Stale tool replay: create a fake command source whose value changes after a configured interval. Compare current turn context, explicit observed_at/freshness metadata, and few-shot temporal policy.

2. Watch lateness: simulate a watch firing on time, late, and after a missed run. Score whether the agent notices the difference and chooses appropriate report depth.

3. User follow-up gap: ask "is it still X?" after 30 seconds, 30 minutes, and 3 days with the same prior observation. Vary volatility class.

4. Urgency/style: compare response length and correctness when the turn context says "user waiting", "scheduled background", and "deadline in 2m."

5. Hidden cache ablation: reuse command-source output inside `freshForMs` with and without an explicit cached/as_of wrapper. Score whether the model treats the evidence correctly.

## Bottom Line

Shrimpy's current direction is compatible with the research: time is already layered into runtime context, watches, and workspace state. The likely improvement is not "add more timestamps." It is to make Shrimpy's time data legible as decisions: this is fresh, this is stale, this is overdue, this user may be waiting, this watch is background, this source changes quickly, this cached context was observed at a specific time, and this turn calls for concise or thorough behavior.
