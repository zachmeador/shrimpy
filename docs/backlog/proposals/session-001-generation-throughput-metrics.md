---
status: draft
priority: P3
area: Sessions
depends_on: []
---

# 🦐 SESSION-001: Generation Throughput Metrics

## Why

Shrimpy session logs already preserve provider-reported token usage for each assistant message, but they do not preserve enough timing information to compare model generation speed across providers, models, machines, or periods of degraded service. A small generation-metrics record would make session JSONL useful for performance inspection without adding a tokenizer, a telemetry service, or provider-specific instrumentation.

The remaining product decision is terminology: provider-reported output tokens can include hidden reasoning tokens, while the visible stream may contain text, thinking summaries, and tool-call deltas. The stored field should therefore describe provider output throughput rather than imply that it measures only visible text tokens.

## Current State

- Pi emits `turn_start`, assistant `message_start`, streaming `message_update`, and assistant `message_end` lifecycle events.
- Final assistant messages already contain provider-reported `usage.output` and, when available, `usage.reasoning`.
- Shrimpy's session recording extension already writes custom JSONL entries that Pi excludes from model context.
- Session logs preserve completed usage but cannot reconstruct time to first output or generation duration after the session ends.

## Build

- Extend the session recording extension in `src/sessions/recording.ts` with small per-turn timing state based on a monotonic clock.
- Capture request start at `turn_start`, stream start at assistant `message_start`, first content arrival at the first assistant `message_update`, and completion at assistant `message_end`.
- Stop timing at `message_end` even when the response requests tools. Tool execution time must not affect generation throughput.
- Append one `shrimpy_generation_metrics` custom entry after the completed assistant message is safely persisted, using `turn_end` if necessary to preserve JSONL ordering.
- Record raw values sufficient to reinterpret the metric later: output tokens, reasoning tokens when reported, time to first output, stream duration, total response duration, and derived output tokens per second.
- Define `outputTokensPerSecond` from provider-reported `usage.output` and the documented stream-duration boundary. Do not estimate token counts from streamed string length.
- Omit derived rates when usage is missing, timing boundaries are incomplete, duration is zero, or the response ends before meaningful streaming begins. Preserve enough status information to distinguish unsupported metrics from a genuine zero-token response.
- Add focused tests for normal text responses, reasoning usage, tool-call responses, aborted or errored responses, and consecutive turns without timing-state leakage.

Example custom-entry data:

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

Normal chat, TUI, Telegram, watch, and worker behavior remains unchanged. Session JSONL gains one compact diagnostic entry per assistant response, available to future session-inspection commands and ad hoc analysis without entering model context. No live tokens-per-second display, configuration switch, or new required CLI workflow is part of this item. Existing logs remain readable without migration.

## Boundaries

- Do not add a tokenizer solely for this metric.
- Do not count characters, words, chunks, or streaming events as tokens.
- Do not describe the metric as visible-text throughput when `usage.output` may include reasoning or other generated tokens.
- Do not include tool execution time in generation duration.
- Do not add remote telemetry, aggregation, retention policy, dashboards, or model benchmarking to this item.
- Do not rewrite existing session files or add backward-compatibility paths for logs without generation metrics.
- Keep timing and recording in the session-recording boundary rather than spreading performance state across surfaces.

## Touches

- `src/sessions/recording.ts`
- `src/sessions/open.ts`
- `test/sessions.test.ts` or a focused session-recording test
- Session JSONL inspection and any future session-statistics CLI surface

## Done

- Each completed assistant response can produce one context-excluded generation-metrics entry with raw timing and provider usage.
- The documented duration boundary and rate formula are unambiguous.
- Reasoning-inclusive output usage is labeled honestly.
- Tool execution does not inflate generation duration.
- Missing usage, errors, aborts, and non-streaming edge cases do not produce misleading rates.
- Tests cover metric calculation, JSONL placement, and per-turn state isolation.
