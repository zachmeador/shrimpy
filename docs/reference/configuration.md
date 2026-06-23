# 🦐 Configuration

Shrimpy config is file-backed and meant to be inspected through normal commands before hand-editing JSON. The workspace config names agents, model policies, tools, context sources, surfaces, watches, and status hints; the detailed behavior for each primitive lives in its owning reference doc.

## Contents

- [Files](#files)
- [Inspect First](#inspect-first)
- [Main Config](#main-config)
- [Runtime](#runtime)
- [Models](#models)
- [OpenAI-Compatible Providers](#openai-compatible-providers)
- [Agents](#agents)
- [Channels, Surfaces, And Users](#channels-surfaces-and-users)
- [Watches And Status](#watches-and-status)
- [Context](#context)

## Files

```text
~/.shrimpy/.shrimpy-workspace.json      primary workspace pointer
~/.shrimpy-workspace.json               fallback workspace pointer
config/shrimpy.json                     main workspace runtime config
config/channels.json                    channel membership, manifests, and transport bindings
agents/<id>/watches.json                agent-owned watches
state/pi/auth.json                      Pi provider auth
state/pi/models.json                    Pi-visible provider/model registry
state/users.json                        stable user ids and optional workspace owner
state/user-presence.json                last active chat surface per known user
```

The pointer files use:

```json
{
  "workspace": "/path/to/workspace"
}
```

When neither pointer selects a workspace, Shrimpy uses `~/.shrimpy/`.

## Inspect First

Use CLI commands for routine inspection and edits. They validate inputs and preserve unrelated fields.

```bash
shrimpy status
shrimpy models
shrimpy models resolve --agent shrimpy --session tui
shrimpy agent show shrimpy
shrimpy agent inspect shrimpy
shrimpy agent channel-policy shrimpy --channel home
shrimpy channels show home
shrimpy watches --agent shrimpy
shrimpy context --config
shrimpy context sources list --agent shrimpy --channel home
shrimpy users list
```

Use `--json` when the output is feeding a script or another agent. Hand-edit JSON only when there is no narrower command for the change.

## Main Config

`config/shrimpy.json` is a JSON object. Recognized sections:

- `modelPolicies` — named model policies with ordered provider/model candidates.
- `agents` — agent ids, roots, default model policy, Shrimpy daemon tools, disabled effective tools, default `thinking`, and channel policy.
- `runtime` — Pi/Shrimpy runtime behavior: theme, startup noise, prompt-template suppression, skill discovery, and compaction policy.
- `tools` — defaults for Shrimpy daemon tools, such as `send_message` actor id and `read_channel` limit.
- `context` / `contextDefaults` — stable prompt sources, command sources, turn-context settings, env fields, channel overrides, and agent-scoped context views.
- `telegram` and other surface keys — configured surface instances, auth, allowlists, user mappings, default agent, and reliability policy.
- `watchClock` — workspace watch clock tick and default timezone.
- `status` — optional targeted watch diagnostics.

Config validation rejects unknown fields inside validated sections. Surface modules validate their own top-level section.

## Runtime

Shrimpy keeps Pi's ambient discovery quiet by default:

- Pi prompt-template discovery is disabled.
- Pi-discovered `AGENTS.md` and append-system prompts are suppressed.
- Pi ambient skill discovery is suppressed; Shrimpy explicitly passes the active agent's resolved workspace and agent skill entrypoints to Pi when skills are enabled.
- Shrimpy owns the assembled system prompt passed into Pi.

Runtime compaction defaults live under `runtime.compaction`, but the full policy, precedence, provider request path, and failure debugging belong in [compaction.md](compaction.md).

```json
{
  "runtime": {
    "theme": "shrimpy",
    "quietStartup": true,
    "noPromptTemplates": true,
    "noSkills": false,
    "compaction": {
      "enabled": true,
      "reserveTokens": 32768,
      "keepRecentTokens": 30000
    }
  }
}
```

Inspect recorded/effective compaction settings with:

```bash
shrimpy sessions compaction <channel> --agent <id> --json
```

A useful override shape:

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
        "maintenance": {
          "thresholdTokens": 100000,
          "keepRecentTokens": 30000,
          "instructions": "Preserve unresolved follow-ups and active-session pointers."
        }
      },
      "sessions": {
        "gateway": {
          "enabled": true
        },
        "maintenance": {
          "thresholdTokens": 100000
        }
      }
    }
  }
}
```

Compaction precedence is global runtime config, then agent override, session type, channel pattern, and concrete session label. `thresholdTokens` is translated to Pi's `reserveTokens` for the selected model.

Tool defaults live under `tools`:

```json
{
  "tools": {
    "sendMessage": {
      "defaultActorId": "agent:shrimpy"
    },
    "readChannel": {
      "defaultLimit": 20
    }
  }
}
```

## Models

`modelPolicies` maps user-owned names to ordered concrete provider/model candidates. A working workspace should have `modelPolicies.coding`; setup creates or repairs it when possible.

```json
{
  "modelPolicies": {
    "coding": {
      "candidates": [
        { "provider": "openai", "id": "gpt-5" }
      ]
    },
    "local": {
      "candidates": [
        { "provider": "local_llm", "id": "local-coder" }
      ]
    }
  }
}
```

Policies resolve against Pi-visible models and configured auth. Shrimpy uses the first usable candidate.

```bash
shrimpy models
shrimpy models policies show coding
shrimpy models policies set coding --candidate openai/gpt-5
shrimpy models policies add-candidate coding anthropic/claude-opus --index 1
shrimpy models resolve --agent shrimpy --session tui
shrimpy models resolve --agent shrimpy --channel home
```

Concrete provider/model entries live in `state/pi/models.json`. `shrimpy setup` can write provider auth through Pi, refresh the Pi-visible registry, and create `coding` from the selected candidate. In a non-interactive shell, setup reports auth/model state paths instead of opening the TUI when no usable model exists.

### OpenAI-Compatible Providers

llama.cpp, Ollama, vLLM, LM Studio, private proxies, and similar servers are Pi custom providers in `state/pi/models.json`. Use the CLI when possible:

```bash
shrimpy models providers add-openai-compatible \
  --provider local_llm \
  --endpoint http://localhost:8090/v1 \
  --model local-coder \
  --name "Local Coder" \
  --context-window 200000 \
  --max-tokens 8192 \
  --set-coding
```

The command writes Pi's OpenAI-compatible provider shape, a local dummy `apiKey`, default provider `compat`, zero cost metadata, `input: ["text"]`, `reasoning: false`, and the requested `contextWindow`/`maxTokens`. `--set-coding` points Shrimpy's `coding` model policy at the new provider/model pair.

Provider request shape comes from Pi's selected provider/model config. The model id you configure is the id Pi sends to the provider. If a server exposes a different backend model name, configure that name as the model id or use a Pi-supported compatibility feature upstream before depending on it from Shrimpy.

For hand-edited local model entries:

- use Pi-native provider/model fields in `state/pi/models.json`
- use `compat.thinkingFormat` only with Pi's own values, such as `qwen` or `qwen-chat-template`, when the provider/model needs that compatibility behavior
- prefer Pi model-level `thinkingLevelMap` for model-specific reasoning controls
- set `reasoning: false` for local models when Pi should not expose reasoning-effort levels
- keep sampler presets and backend aliasing in the provider or in Pi-supported model config, not in Shrimpy workspace or agent config

Example `state/pi/models.json` provider:

```json
{
  "providers": {
    "local_llm": {
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "local",
      "api": "openai-completions",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false,
        "thinkingFormat": "qwen-chat-template"
      },
      "models": [
        {
          "id": "qwen3-coder",
          "name": "Qwen3 Coder Local",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 8192,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

`apiKey` and custom `headers` support Pi's config value syntax: `"$ENV_VAR"` / `"${ENV_VAR}"` interpolation, `"!command"` command execution, `"$$"` for a literal dollar prefix, and `"$!"` for a literal bang prefix. Command values resolve at request time; wrap slow secret fetches in a caching script.

## Agents

An agent config entry controls the runtime defaults for one agent. The agent's durable files still live under its root.

```json
{
  "id": "shrimpy",
  "root": "agents/shrimpy",
  "modelPolicy": "coding",
  "tools": ["reply", "ask", "notify", "report", "send_message", "read_channel"],
  "disabledTools": [],
  "thinking": "medium",
  "channelPolicy": {
    "mode": "all"
  }
}
```

Fields:

- `id` — stable agent id.
- `root` — workspace-relative or absolute path to that agent's root.
- `modelPolicy` — default model policy for fresh sessions opened as that agent; omitted agents fall back to `coding`.
- `tools` — allowed Shrimpy daemon tools. If omitted or empty, Shrimpy uses all built-in daemon tools.
- `disabledTools` — effective tool names passed to Pi as `excludeTools`; use this for Pi built-ins such as `bash` or any active custom tool.
- `thinking` — default reasoning effort for sessions opened as that agent.
- `channelPolicy` — when visible channel messages become turns for this agent.

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

Policy can be narrowed by sender (`system`, `human`, `agent`), stable `actorIds`, or stable `userIds`, and overridden by channel pattern:

```json
{
  "id": "shrimpy",
  "channelPolicy": {
    "mode": "mentions",
    "channels": {
      "home": {
        "mode": "all",
        "senders": ["human", "system"]
      },
      "maintenance": {
        "mode": "all",
        "senders": ["system"]
      }
    }
  }
}
```

Addressing and mentions are inputs to the agent's own policy. They do not route around channel visibility, and they do not override `mode: "none"`. An agent is not re-offered its own channel messages.

Channel participation lives in `config/channels.json`, not in agent config. See [channels.md](channels.md) for membership, addressing, and wake policy. See [tools.md](tools.md) for Pi built-ins, Shrimpy daemon tools, and `disabledTools`.

Prefer command edits:

```bash
shrimpy agent add <id>
shrimpy agent set <id> --model-policy coding
shrimpy agent inspect <id>
shrimpy agent channel-policy set <id> --channel maintenance --mode all --senders system
shrimpy agent channel-policy explain <id> --channel home --sender human --text "@shrimpy hello"
```

## Channels, Surfaces, And Users

`config/channels.json` owns channel membership and surface bindings. A minimal channel entry:

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

Membership means visibility. The agent's own `channelPolicy` decides whether a visible message becomes a turn. Use `shrimpy channels join|leave|members|show` instead of hand-editing membership.

Surfaces may stamp `origin.addressedAgentId`; visible agents evaluate that fact through their own channel policy. Telegram configuration lives under the `telegram` section in `config/shrimpy.json`. Every Telegram instance must configure `allowedChatIds`; unauthorized chats are dropped before channel logs, bindings, identity, presence, commands, media download, or model wake. Use `shrimpy setup telegram` for guided setup and [surfaces.md](surfaces.md) for transport behavior.

Telegram instance shape:

```json
{
  "telegram": {
    "instances": {
      "shrimpy": {
        "token": "$TELEGRAM_BOT_TOKEN",
        "defaultAgentId": "shrimpy",
        "allowedChatIds": [123456789],
        "users": {
          "123456789": {
            "id": "alice",
            "displayName": "Alice"
          }
        },
        "policy": {
          "sendMaxRetries": 3,
          "backoff": {
            "initialMs": 500,
            "maxMs": 10000,
            "factor": 2,
            "jitter": 0.2
          }
        },
        "textBurstWindowMs": 1000,
        "mediaGroupWindowMs": 1200
      }
    }
  }
}
```

Stable human ids live in `state/users.json`. Telegram `users` mappings turn transport ids into stable Shrimpy ids such as `human:alice`. The optional top-level `owner` names the canonical workspace user; when set, CLI publishers stamp messages as that owner. Manage with `shrimpy users list|get-owner|set-owner`.

## Watches And Status

Agent-owned watches live in `agents/<id>/watches.json`. A watch belongs to one agent, has a trigger, and either posts a watch-authored message to a channel or runs a command check that can emit to a channel. Time is the implemented trigger kind.

For normal edits:

```bash
shrimpy watches add morning-check \
  --agent shrimpy \
  --name "Morning check" \
  --every 1h \
  --concurrency-policy forbid \
  --channel maintenance \
  --addressed shrimpy \
  --message "Check the house."

shrimpy watches show shrimpy/morning-check
shrimpy watches history shrimpy/morning-check
shrimpy watches enable shrimpy/morning-check
shrimpy watches disable shrimpy/morning-check
```

`watchClock.defaultTimezone` sets the workspace default timezone for cron watches. Per-watch JSON can set root-level `timezone` or `trigger.timezone` for rare explicit overrides. Omitted `concurrencyPolicy` defaults to `forbid`.

Current trigger kinds are `time` with `cron` and `time` with `everyMs`. `concurrencyPolicy` is `forbid` or `allow`.

Message watch shape:

```json
{
  "id": "memory-management",
  "enabled": true,
  "trigger": {
    "kind": "time",
    "cron": "0 3 * * *"
  },
  "concurrencyPolicy": "forbid",
  "action": {
    "kind": "message",
    "channel": "maintenance",
    "addressedAgentId": "shrimpy",
    "text": "Use the `memory-management` skill."
  }
}
```

Command watch shape:

```json
{
  "id": "disk-space",
  "enabled": true,
  "trigger": {
    "kind": "time",
    "everyMs": 3600000
  },
  "concurrencyPolicy": "forbid",
  "action": {
    "kind": "command",
    "command": "df -h /",
    "timeoutMs": 30000
  },
  "emit": {
    "policy": "on_output",
    "channel": "maintenance",
    "addressedAgentId": "mechanic",
    "template": "Disk check:\n{{stdout}}"
  }
}
```

Command watch emit policies are `never`, `always`, `on_output`, `on_change`, and `on_failure`.

`status.watchedWatches` is optional targeted diagnostic config for callers that need to track a specific watch/channel pair. General status commands already summarize watches without this config:

```json
{
  "status": {
    "watchedWatches": [
      {
        "label": "memory",
        "channel": "maintenance",
        "watchId": "shrimpy/memory-management"
      }
    ]
  }
}
```

```bash
shrimpy status
shrimpy gateway status
shrimpy watches
```

See [runtime.md](runtime.md) and [channels.md](channels.md) for how watch messages become agent turns.

## Context

`context.sources` is the ordered source list for stable prompt material and turn-scoped command context. The built-in default sources are `workspace:context/`, `agent:SOUL.md`, and `agent:context/`. Add more workspace context files under `context/` or add scoped overrides according to which agents and channels should receive them.

```json
{
  "context": {
    "sources": [
      "workspace:context/",
      "agent:SOUL.md",
      "agent:context/",
      {
        "type": "command",
        "id": "finance_alerts",
        "command": "finance-shrimpy alerts context",
        "channels": ["maintenance", "finance"],
        "timeoutMs": 5000,
        "maxChars": 1200,
        "freshForMs": 60000
      }
    ],
    "agents": {
      "mechanic": {
        "sources": [
          "workspace:context/",
          "agent:SOUL.md",
          "workspace:context/maintenance.md",
          "agent:context/"
        ],
        "channels": {
          "maintenance": {
            "sources": [
              "workspace:context/",
              "agent:SOUL.md",
              "workspace:context/maintenance.md",
              "agent:context/"
            ]
          }
        }
      }
    },
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

String sources such as `workspace:context/`, `workspace:context/maintenance.md`, `agent:SOUL.md`, and `agent:context/` load stable session prompt material. `workspace:<path>` resolves from the workspace root; `agent:<path>` resolves from the active agent root. Directory sources load Markdown files recursively in deterministic path order. Command sources run at turn time and emit compact text. `context.agents.<id>` adds sources/env for one agent, and `context.agents.<id>.channels.<pattern>` specializes that agent's view for a channel pattern.

Inspect context with:

```bash
shrimpy context --config
shrimpy context --agent shrimpy --sections
shrimpy context --turn --channel home --agent shrimpy
shrimpy context sources list --agent shrimpy --channel home
shrimpy context sources run <id> --agent shrimpy --channel home
```

See [context-assembly.md](context-assembly.md) for stable prompt assembly and [turn-context.md](turn-context.md) for live per-turn context.
