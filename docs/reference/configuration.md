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

- `model` — workspace default model used when a session does not pass `--provider` / `--model` and the agent has no model override.
- `agents` — agent ids, root paths, optional default model, allowed tools, optional default `thinking`, attention policy.
- `briefing` — per-turn context budget and channel-unread settings.
- `runtime` — Pi loader/runtime behavior: theme, startup noise, prompt-template suppression, skill discovery, compaction.
- `tools` — Shrimpy tool defaults such as `send_message` actor id and `read_channel` default limit.
- `context` / `contextDefaults` — stable prompt sources, command sources, env fields, channel overrides, agent-scoped context views.
- `telegram` — configured Telegram surface instances with token, channel prefix, allowlist, stable user mappings, default agent, reliability policy.
- `scheduler` — scheduler tick behavior.
- `status` — heartbeat channel and schedule id used by status commands.
- `adapters` — extra channel-prefix to surface routes. Telegram routes are derived from configured Telegram instances.

## Runtime Defaults

- Pi prompt-template discovery is disabled.
- Pi-discovered `AGENTS.md` and append-system prompts are suppressed.
- Shrimpy owns the system prompt passed into Pi.
- Compaction defaults are tuned for chat-style continuity: `reserveTokens: 32768`, `keepRecentTokens: 30000`.
- Compaction can be overridden globally, by agent id, by channel pattern, or by session label. `thresholdTokens` is translated to Pi's `reserveTokens` for the selected model.
- The built-in `heartbeat` channel policy compacts after roughly `100000` model-visible tokens and keeps roughly `30000` recent tokens.
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

## Briefings

```json
{
  "briefing": {
    "maxChars": 2000,
    "channelUnread": {
      "enabled": true,
      "channels": ["*"],
      "includeLatest": true
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
- `model` — optional default model for sessions opened as that agent. Overrides the workspace `model`.
- `tools` — allowed Shrimpy daemon tools.
- `thinking` — default reasoning effort for sessions opened as that agent.
- `attention` — when channel messages become turns for this agent.

Agent identity, tools, and attention policy live in `agents`. Channel participation lives in `config/channels.json`.

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

Attention defaults to:

```json
{
  "mode": "all"
}
```

Modes:

- `all` handles unaddressed messages from subscribed channels.
- `mentions` handles only explicit `@agent` text mentions or addressed metadata.
- `addressed` handles only explicit addressed metadata.
- `none` ignores channel messages unless another control path handles them.

System-implied attention rules apply before configurable attention:

- `origin.addressedAgentId` routes only to that agent.
- A human single-agent `@agent` mention calls that agent even if its ambient attention is quiet.
- An agent never handles its own channel message.

Attention can be narrowed by sender (`system`, `human`, `agent`), stable `actorIds`, or stable `userIds`, and overridden by channel pattern:

```json
{
  "id": "shrimpy",
  "attention": {
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
shrimpy agent attention shrimpy --channel home
shrimpy agent attention test shrimpy --channel home --sender human --text "@shrimpy wassup"
```

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
- `shrimpy channels join <name> --agent <id>` adds membership; the agent's own `attention` policy decides what becomes a turn.
- Surfaces may stamp a message with `addressedAgentId`, which routes directly without changing membership.

## Schedules

Schedules live in `agents/<id>/schedules.json`. The gateway compiles them into addressed channel messages for the owning agent, so scheduled/background wakeups use the same channel dispatch path as Telegram, CLI channel posts, and other async events.

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

Channel membership stays in `config/channels.json`. Agent schedules choose a channel to log through, and scheduled messages are addressed to the owning agent.

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
        "command": "finance-shrimpy alerts briefing",
        "channels": ["heartbeat", "finance"],
        "freshForMs": 60000
      }
    ]
  }
}
```

`context.agents.<id>` adds sources/env for one agent, and `context.agents.<id>.channels.<pattern>` specializes that agent's view for a channel pattern.

Live state lands in [turn context](briefing.md) rather than static prompt resources. See [context-assembly.md](context-assembly.md) for how sections are assembled.
