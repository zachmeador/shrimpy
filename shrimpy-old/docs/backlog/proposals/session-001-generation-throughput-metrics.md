---
status: draft
priority: P3
area: Sessions
depends_on:
  - Pi durable replacement
---

# 🦐 SESSION-001: Generation Throughput Metrics

## Why

Comparing model speed across providers, models, machines, and bad days needs timing that Shrimpy doesn't keep. Provider-reported token usage is recorded for each response, but time to first output and stream duration are lost once the response ends.

Provider output tokens can include hidden reasoning, and the stream can carry text, thinking summaries, and tool-call deltas. The metric therefore describes provider output throughput, not visible text speed.

## Proposed Work

Build this on the [durable runtime](../../REDESIGN/PLAN.md), not today's JSONL session recording, which that plan deletes.

- Start by checking what durable already records for a model request: the generation task, its committed stream progress, and `UsageDoc`. Add only the timing it lacks.
- Measure from the request start, the first streamed output, and the end of the model's response. Stop at the response, so tool execution never counts.
- Keep the raw values: output tokens, reasoning tokens when reported, time to first output, stream duration, and total response duration. Derive output tokens per second from them.
- Use provider-reported usage only. Don't estimate tokens from text length, chunks, or stream events.
- Leave the rate out when usage or timing is missing, and record why, so it can't be mistaken for a real zero.

Example record:

```json
{
  "outputTokens": 276,
  "reasoningTokens": 117,
  "timeToFirstOutputMs": 840,
  "streamDurationMs": 4210,
  "responseDurationMs": 5050,
  "outputTokensPerSecond": 65.56
}
```

## UX Implications

Chat, clients, Telegram, watches, and workers behave the same. Each model response gains a small diagnostic record that inspection commands can show and that never enters model context. This item adds no live speed display, configuration switch, remote telemetry, dashboards, or benchmarking.

## Done

- Each completed model response can carry one metrics record with raw timing and provider usage.
- The duration boundaries and rate formula are documented, and reasoning-inclusive output is labeled honestly.
- Tool execution never inflates generation duration.
- Missing usage, errors, aborts, and responses without streaming produce no misleading rates.
- Tests cover the calculation, the boundaries, and state isolation between consecutive responses.
