# 🦐 Configuration

Shrimpy's workspace config is file-backed and inspectable.

## Config Files

```text
config/shrimpy.json         runtime configuration
config/channels.json        explicit channel membership
config/schedules.json       optional workspace-level scheduler definitions
agents/<id>/schedules.json  agent-owned scheduler definitions
```

The workspace itself is selected by `~/.shrimpy-workspace.json`:

```json
{
  "workspace": "/path/to/workspace"
}
```

## `config/shrimpy.json`

Sections:

- `agents` — agent ids, root paths, optional default model, Shrimpy daemon tools, disabled effective tools, optional default `thinking`, and agent-owned channel policy.
- `runtime` — Pi loader/runtime behavior: theme, startup noise, prompt-template suppression, skill discovery, compaction.
- `tools` — Shrimpy tool defaults such as `send_message` actor id and `read_channel` default limit.
- `context` / `contextDefaults` — stable prompt sources, turn-context settings, command sources, env fields, channel overrides, agent-scoped context views.
- `telegram` — configured Telegram surface instances with token, channel prefix, allowlist, stable user mappings, default agent, reliability policy.
- `scheduler` — scheduler tick behavior.
- `status` — optional targeted schedule watches for diagnostics.
- `adapters` — extra channel-prefix to surface routes. Telegram routes are derived from configured Telegram instances.

## Runtime Defaults

- Pi prompt-template discovery is disabled.
- Pi-discovered `AGENTS.md` and append-system prompts are suppressed.
- Pi ambient skill discovery is suppressed. When `runtime.noSkills` is false,
  Shrimpy passes the active agent's resolved workspace/agent skill entrypoints
  to Pi explicitly.
- Shrimpy owns the system prompt passed into Pi.
- Compaction defaults are tuned for chat-style continuity: `reserveTokens: 32768`, `keepRecentTokens: 30000`.
- Compaction can be overridden globally, by agent id, by channel pattern, or by session label. `thresholdTokens` is translated to Pi's `reserveTokens` for the selected model.
- The built-in `heartbeat` compaction override compacts after roughly `100000` model-visible tokens and keeps roughly `30000` recent tokens.
- Inspect the resolved policy and selected model metadata with `shrimpy sessions compaction <channel> [--agent <id>] [--json]`. The command also shows whether the active session file recorded older policy or model/inference settings; running gateway sessions need to be reset/reopened or the gateway restarted before changed settings take effect.
- Runtime behavior, summary shape, provider request handling, and failure debugging are covered in [compaction.md](compaction.md).

```json
{
  "runtime": {
    "compaction": {
      "keepRecentTokens": 30000,
      "agents": {
        "ops": {
          "thresholdTokens": 120000,
          "keepRecentTokens": 40000
        }
      },
      "channels": {
        "heartbeat": {
          "thresholdTokens": 100000,
          "keepRecentTokens": 30000,
          "instructions": "Preserve unresolved follow-ups and active-session pointers. Collapse repetitive no-op turns."
        }
      }
    }
  }
}
```

Compaction precedence is:

1. `runtime.compaction`
2. `runtime.compaction.agents.<agentId>`
3. `runtime.compaction.sessions.<sessionType>`
4. matching `runtime.compaction.channels.<pattern>`
5. `runtime.compaction.sessions.<sessionLabel>`

Use `sessions.<sessionType>` for a broad class such as `gateway` or `tui`. Use `sessions.<sessionLabel>` for a concrete session directory label such as `heartbeat`.

## Turn Context

```json
{
  "context": {
    "turn": {
      "maxChars": 2000,
      "channelUnread": {
        "enabled": true,
        "channels": ["*"],
        "includeLatest": true
      },
      "sessionStatus": {
        "enabled": true,
        "staleAfterMinutes": 720
      }
    }
  }
}
```

Command-typed context sources emit compact per-turn text. Shrimpy may cache command output in per-agent turn-context state and reuse it until `freshForMs` expires.

## Telegram User Identity

Telegram instances map transport user ids to stable Shrimpy user ids:

```json
{
  "telegram": {
    "instances": {
      "shrimpy": {
        "token": "...",
        "defaultAgentId": "shrimpy",
        "allowedChatIds": [123456789],
        "users": {
          "123456789": {
            "id": "alice",
            "displayName": "Alice"
          }
        }
      }
    }
  }
}
```

That produces channel messages from `actorId: "human:alice"` and `userId: "alice"`. Without a mapping, Shrimpy creates a local anonymous user id in `state/users.json`.

`state/users.json` accepts an optional top-level `owner` field naming the canonical workspace user by `userId`. When set, `shrimpy channels post` (and other CLI publishers) stamp messages with that owner's actorId / userId / displayName. Manage with `shrimpy users list|get-owner|set-owner`.

## Agents

Each agent config entry has:

- `id` — stable agent id.
- `root` — workspace-relative or absolute path to that agent's root.
- `model` — default model for sessions opened as that agent, written as `{ "provider": "...", "id": "..." }`.
- `tools` — allowed Shrimpy daemon tools such as `reply`, `ask`, `notify`, `report`, `send_message`, `read_channel`, and `run_child`.
- `disabledTools` — effective tool names to exclude from Pi sessions. Use this to disable Pi built-ins such as `bash`; names are passed to Pi as `excludeTools`, so extension/custom tool names can be listed too.
- `thinking` — default reasoning effort for sessions opened as that agent.
- `channelPolicy` — when visible channel messages become turns for this agent.

Agent identity, model defaults, tool policy, and channel policy live in `agents`. Channel participation lives in `config/channels.json`. See [channels.md](channels.md) for channel delivery semantics and [tools.md](tools.md) for the full distinction between Pi built-ins, Shrimpy daemon tools, and `disabledTools`.
Inspect the resolved capability view with `shrimpy agent inspect <id> [--json]`.

Model resolution is inspectable with `shrimpy models resolve --agent <id> --session tui` or `shrimpy models resolve --agent <id> --channel <name>`.

## Model Variants

Sampler values live on model entries in `state/pi/models.json`, not in workspace or agent config. Pi parses this file as JSON with `//` comments and trailing commas tolerated, then validates it as `models.json`.

For GGUF models with task-specific recipes, define each recipe as its own model id and attach Shrimpy metadata to that model object:

```json
{
  "providers": {
    "local_qwen_moe": {
      "baseUrl": "http://your_server:8081/v1",
      "apiKey": "local",
      "api": "openai-completions",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false,
        "thinkingFormat": "qwen-chat-template"
      },
      "models": [
        {
          "id": "qwen-a3b:thinking-coding",
          "name": "Qwen 3.6 A3B Thinking Coding",
          "baseModel": "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
          "reasoning": false,
          "inference": {
            "enableThinking": true,
            "params": {
              "temperature": 0.6,
              "top_p": 0.95,
              "top_k": 20,
              "min_p": 0.0,
              "presence_penalty": 0.0,
              "repeat_penalty": 1.0
            }
          }
        },
        {
          "id": "qwen-a3b:instruct-general",
          "name": "Qwen 3.6 A3B Instruct General",
          "baseModel": "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
          "reasoning": false,
          "inference": {
            "enableThinking": false,
            "params": {
              "temperature": 0.7,
              "top_p": 0.8,
              "top_k": 20,
              "min_p": 0.0,
              "presence_penalty": 1.5,
              "repeat_penalty": 1.0
            }
          }
        }
      ]
    }
  }
}
```

Pi accepts the extra `baseModel` and `inference` fields but strips them from runtime model objects. Shrimpy re-reads the raw model entry for the selected provider/id and applies that metadata just before the provider request.

- `baseModel` rewrites the outgoing OpenAI-compatible `model` field, so a user-facing variant id can target the loaded GGUF name.
- `inference.params` injects supported sampler params into the provider payload.
- `inference.enableThinking` controls Qwen-style thinking formats such as `chat_template_kwargs.enable_thinking`.
- Pi model-level `thinkingLevelMap` maps Shrimpy/Pi thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) to provider values and hides unsupported levels with `null`. Use this instead of older `compat.reasoningEffortMap` shapes when model-specific reasoning controls are needed.

Use llama.cpp's `repeat_penalty` spelling; `repetition_penalty` is accepted in model metadata and normalized. For Qwen GGUF variants, set `reasoning: false` so Pi does not expose reasoning-effort levels that the model cannot consume; the selected model variant owns whether Qwen thinking is enabled.

`apiKey` and custom `headers` in `state/pi/models.json` support Pi's current config value syntax: `"$ENV_VAR"` / `"${ENV_VAR}"` interpolation, `"!command"` command execution, `"$$"` for a literal dollar prefix, and `"$!"` for a literal bang prefix. Command values are resolved at request time, so slow or flaky secret fetches should be wrapped in a caching script if needed.

Agent-owned channel policy defaults to:

```json
{
  "mode": "all"
}
```

Modes:

- `all` wakes for all visible channel messages after sender filters.
- `mentions` wakes only for messages addressed to this agent or with a single `@agent` mention.
- `addressed` wakes only for messages addressed to this agent.
- `none` ignores visible channel messages.

Addressing and mentions are inputs to the agent's own policy. They do not route
around channel visibility, and they do not override `mode: "none"`. An agent is
not re-offered its own channel messages.

Channel policy can be narrowed by sender (`system`, `human`, `agent`), stable
`actorIds`, or stable `userIds`, and overridden by channel pattern:

```json
{
  "id": "shrimpy",
  "channelPolicy": {
    "mode": "mentions",
    "channels": {
      "home": { "mode": "all", "senders": ["human", "system"] },
      "heartbeat": { "mode": "all", "senders": ["system"] }
    }
  }
}
```

Inspect and test the effective policy with:

```bash
shrimpy agent channel-policy shrimpy --channel home
shrimpy agent channel-policy explain shrimpy --channel home --sender human --text "@shrimpy wassup"
```

Edit fields directly instead of hand-writing the JSON. `set`/`clear` target the base rule, or a channel override when `--channel <pattern>` is given, and leave the rest of the policy untouched:

```bash
# Narrow the base rule to humans, then add a per-channel override.
shrimpy agent channel-policy set shrimpy --senders human
shrimpy agent channel-policy set shrimpy --channel heartbeat --mode all --senders system

# Clear one field, or drop a whole channel override.
shrimpy agent channel-policy clear shrimpy --senders
shrimpy agent channel-policy clear shrimpy --channel heartbeat
```

`set` updates `mode`, `senders`, `actor-ids`, and `user-ids`; `clear` flags name the fields to remove. Clearing the last field removes the `channelPolicy` block, falling back to the default `all` policy. Channel membership is unaffected; policy only decides whether a visible member wakes. See [channels.md](channels.md) for the delivery model.

## Channel Membership

`config/channels.json` shape:

```json
{
  "channels": {
    "home": {
      "agents": {
        "shrimpy": {}
      }
    }
  }
}
```

- `channels.<name>.agents` is keyed by agent id.
- Membership means the agent participates in that channel.
- `shrimpy channels join <name> --agent <id>` adds membership; the agent's own `channelPolicy` decides what becomes a turn.
- Surfaces may stamp a message with `addressedAgentId`; visible agents evaluate that fact through their own channel policy.

See [channels.md](channels.md) for protocol, addressing, delivery, and egress
semantics.

## Schedules

Schedules live in `agents/<id>/schedules.json` for agent-owned schedules and
`config/schedules.json` for optional workspace-level schedules. The gateway
compiles them into scheduler-authored channel messages. Channel membership and
agent channel policy decide whether the scheduled message becomes a turn.

Triggers:

- `every_ms`
- `cron`

Schedule entry shape:

```json
{
  "id": "heartbeat",
  "trigger": { "type": "every_ms", "everyMs": 900000 },
  "channel": "heartbeat",
  "instructions": "Review recent activity and decide whether anything needs attention."
}
```

Fresh setup seeds four ordinary schedules for the default `shrimpy` agent:

- `heartbeat` — every 15 minutes, reviews recent activity and decides whether anything needs attention.
- `memory-management` — daily at 03:00, runs the memory upkeep skill.
- `journal-daily` — daily at 22:30, writes a same-day journal note only if activity warrants it.
- `journal-compact` — Sundays at 04:00, compacts old journal notes.

Channel membership stays in `config/channels.json`. Agent schedules choose a
channel to log through; setup seeds the default `heartbeat` channel with the
default `shrimpy` agent as a member.

Inspect schedules with `shrimpy schedules [--agent <id>] [--json]` or
`shrimpy schedules show <resolved-schedule-id>`. The inspection surface reports
source paths, owner/local ids, target channel, channel membership, expected
wake behavior, next run from scheduler state, and recent emitted channel
message ids from channel logs.

## Scheduler Status

`shrimpy status`, `shrimpy gateway status`, `shrimpy schedules`, TUI
`/status schedules`, and turn context summarize scheduled runs across all
configured agent and workspace schedules. This aggregate status is not tied to
the default heartbeat schedule.

`status.watchedSchedules` is optional targeted diagnostic config for callers that need to track a specific schedule/channel pair:

```json
{
  "status": {
    "watchedSchedules": [
      {
        "label": "heartbeat",
        "channel": "heartbeat",
        "scheduleId": "shrimpy/heartbeat"
      }
    ]
  }
}
```

- `label` is the diagnostic name. If omitted, Shrimpy uses `scheduleId`.
- `channel` is the channel log where the scheduler writes the scheduled message.
- `scheduleId` is the resolved scheduler id, for example `agent-id/local-schedule-id` for agent-owned schedules.

## Context

`context.sources` is a single ordered list of file, directory, and command sources. String sources such as `workspace:profile/SYSTEM.md`, `agent:SOUL.md`, and `agent:context/` load session prompt material. Object sources with `{ "type": "command", ... }` run at turn time and emit compact context text.

```json
{
  "context": {
    "sources": [
      "workspace:profile/WORKSPACE.md",
      "workspace:profile/SYSTEM.md",
      "agent:SOUL.md",
      "workspace:profile/USER.md",
      "agent:context/",
      {
        "type": "command",
        "id": "finance_alerts",
        "command": "finance-shrimpy alerts context",
        "channels": ["heartbeat", "finance"],
        "freshForMs": 60000
      }
    ]
  }
}
```

`context.agents.<id>` adds sources/env for one agent, and `context.agents.<id>.channels.<pattern>` specializes that agent's view for a channel pattern.

The runtime environment prompt includes workspace and session routing facts. Current model/provider identity is recorded in session metadata for inspection rather than rendered into the agent prompt, because model selection can change inside a running session.

Live state lands in [turn context](turn-context.md) rather than static prompt resources. See [context-assembly.md](context-assembly.md) for how sections are assembled.
