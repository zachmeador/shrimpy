# 🦐 CTX-013: Separate Stable Context From Turn Producers

Status: draft
Priority: P2
Area: Context

## Why

`context.sources` currently treats stable Markdown resources and automatically executed shell commands as variants of one source type. A command source also carries channel applicability, timeout, cache freshness, and prompt-budget policy. This makes the configuration difficult to explain because a file loaded once into the stable session prompt and a program run before selected turns are not the same lifecycle or responsibility.

The mixed shape also obscures the actual behavior: command output, not the command itself, enters turn context; `channels` is an execution condition rather than channel routing; and channel-less sessions currently bypass the channel filter and run every configured command source.

## Current State

- `context.sources` accepts both `workspace:` / `agent:` resource strings and `{type: "command", ...}` objects.
- String resources contribute stable session prompt sections.
- Command sources execute during turn-context construction and contribute bounded output.
- Command sources combine execution (`command`), applicability (`channels`), runtime limits (`timeoutMs`), prompt budget (`maxChars`), and caching (`freshForMs`) in one object.
- Agent and channel source overrides accept the same source union even though override command sources are discoverable but are not executed by the live turn-context service.
- Built-in turn-context producers live under `context.turn`, while configurable command producers live in `context.sources`.

## Proposed Direction

Make the lifecycle boundary explicit:

```jsonc
{
  "context": {
    "sources": [
      "workspace:context/",
      "agent:SOUL.md",
      "agent:context/"
    ],
    "turn": {
      "producers": [
        {
          "id": "finance_alerts",
          "run": "finance-shrimpy alerts context",
          "when": {
            "channels": ["finance"]
          },
          "timeoutMs": 5000,
          "cacheMs": 60000,
          "maxChars": 1200
        }
      ]
    }
  }
}
```

- `context.sources` contains only stable file and directory resources.
- `context.turn.producers` contains automatic live-fact producers.
- Applicability is named as a condition (`when`) instead of looking like channel ownership or routing.
- A missing channel has explicit semantics; it must not silently match a channel-scoped producer.
- Inspection reports whether a producer matched, ran, used cached output, failed, or was skipped.

## Open Decision

Decide whether configurable automatic shell producers should survive at all. Prefer an agent-invoked CLI command or tool when the agent can decide whether current data is relevant. Keep an automatic producer only for bounded facts the model must receive before it can make that decision.

If no concrete automatic-producer use case clears that bar, remove command sources instead of relocating their configuration.

## Build

- Separate stable resource types and turn-producer types in `src/context/`; do not retain a union that allows executable objects wherever stable resources are accepted.
- Define explicit matching behavior for channel sessions and channel-less sessions.
- Move automatic command execution, caching, clipping, and failure rendering behind a turn-producer boundary.
- Make `shrimpy context sources list/run` distinguish stable sources from turn producers, or introduce an equally inspectable producer command without duplicating prompt assembly.
- Remove agent/channel override shapes that falsely accept executable sources, regardless of whether stable resource overrides remain.
- Update setup defaults, config validation, context inspection, reference docs, and tests together.
- Remove the replaced command-source path outright; do not add migration shims or deprecated aliases.

## UX Implications

Normal users continue to get the built-in stable context without configuring anything. Users inspecting configuration can tell at a glance which material is loaded for the whole session and which programs may execute before a turn. Channel conditions describe applicability only; they do not imply channel commands, message routing, wake behavior, or agent-callable tools. Direct and TUI sessions must not unexpectedly run producers scoped to named channels.

The configuration break is intentional under Shrimpy's no-legacy-support policy. Error messages should point directly from the removed command-source shape to the final supported replacement, if one exists.

## Boundaries

- Do not turn channels into instruction containers; channels remain routing and logs.
- Do not create a general workflow engine inside context assembly.
- Do not automatically execute a command merely because it might occasionally provide useful information.
- Do not conflate automatic producers with tools the agent voluntarily invokes or watches that run on schedules.
- Keep stable prompt assembly cache-friendly and turn output bounded.
- Coordinate with CTX-008 only where producer inspection overlaps; CTX-008's broader built-in producer observability is not a prerequisite.

## Touches

- `src/context/spec.ts`
- `src/context/source.ts`
- `src/context/turn/service.ts`
- `src/context/preview.ts`
- `src/commands/context.ts`
- `test/context-defaults.test.ts`
- `test/context.test.ts`
- `test/skill-command.test.ts`
- `docs/reference/context-assembly.md`
- `docs/reference/configuration.md`

## Done

- Stable context resources and automatic turn producers no longer share one config union.
- No executable producer object is accepted in a stable source or stable override list.
- Automatic producer applicability has documented, tested semantics for matching channels, nonmatching channels, and channel-less sessions.
- A configured producer can be inspected without executing or mutating freshness state unless execution is explicitly requested.
- The obsolete command-source configuration and implementation are removed with no compatibility path.
- Tests cover config validation, stable assembly, execution conditions, caching, clipping, failures, inspection, and provider-facing turn-context output.
