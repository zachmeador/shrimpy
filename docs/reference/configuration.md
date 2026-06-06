# 🦐 Configuration

Shrimpy's workspace config is file-backed and inspectable.

## Config Files

```text
config/shrimpy.json         runtime configuration
config/channels.json        explicit channel membership
agents/<id>/watches.json    agent-owned watch definitions
```

The workspace itself is selected by `~/.shrimpy-workspace.json`:

```json
{
  "workspace": "/path/to/workspace"
}
```

## `config/shrimpy.json`

Sections:

- `modelPolicies` — named model policies with ordered provider/model candidates.
- `agents` — agent ids, root paths, optional default model policy, Shrimpy daemon tools, disabled effective tools, optional default `thinking`, and agent-owned channel policy.
- `runtime` — Pi loader/runtime behavior: theme, startup noise, prompt-template suppression, skill discovery, compaction.
- `tools` — Shrimpy tool defaults such as `send_message` actor id and `read_channel` default limit.
- `context` / `contextDefaults` — stable prompt sources, turn-context settings, command sources, env fields, channel overrides, agent-scoped context views.
- `telegram` — configured Telegram surface instances with token, channel prefix, allowlist, stable user mappings, default agent, reliability policy.
- `watchClock` — watch clock tick behavior.
- `status` — optional targeted watch diagnostics.
- `adapters` — extra channel-prefix to surface routes. Telegram routes are derived from configured Telegram instances.

## Runtime Defaults

- Pi prompt-template discovery is disabled.
- Pi-discovered `AGENTS.md` and append-system prompts are suppressed.
- Pi ambient skill discovery is suppressed. When `runtime.noSkills` is false, Shrimpy passes the active agent's resolved workspace/agent skill entrypoints to Pi explicitly.
- Shrimpy owns the system prompt passed into Pi.
- Compaction defaults are tuned for chat-style continuity: `reserveTokens: 32768`, `keepRecentTokens: 30000`.
- Compaction can be overridden globally, by agent id, by channel pattern, or by session label. `thresholdTokens` is translated to Pi's `reserveTokens` for the selected model.
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
        "maintenance": {
          "thresholdTokens": 100000,
          "keepRecentTokens": 30000,
          "instructions": "Preserve unresolved follow-ups and active-session pointers."
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

Use `sessions.<sessionType>` for a broad class such as `gateway` or `tui`. Use `sessions.<sessionLabel>` for a concrete session directory label such as `maintenance`.

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

## Model Policies

`modelPolicies` maps user-owned policy names to ordered concrete model candidates. A working workspace should define the `coding` policy with at least one candidate. If `modelPolicies` is present, config validation requires `coding`.

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
        { "provider": "local", "id": "qwen-coder" }
      ]
    }
  }
}
```

Policies are resolved against Pi-visible models and configured auth. Shrimpy uses the first usable candidate. Inspect and edit policies with:

```bash
shrimpy models
shrimpy models policies
shrimpy models policies show coding
shrimpy models policies set coding --candidate openai/gpt-5
shrimpy models policies add-candidate coding anthropic/claude-opus --index 1
shrimpy models policies move-candidate coding anthropic/claude-opus --index 0
shrimpy models policies remove-candidate coding openai/gpt-5
```

Concrete provider/model ids still live in Pi's `state/pi/models.json`. Policies point at those ids; they do not create a second model registry.

`shrimpy setup` sets up the minimal working shape. A workspace is setup-ready only when `modelPolicies.coding` resolves to a Pi-visible model with configured auth and both default agent `context/` directories exist. If no usable model exists in an interactive terminal, setup runs a plain model access wizard that stores API-key or subscription credentials through Pi's auth layer, refreshes available Pi models, and then resolves `coding`. In a non-interactive shell, setup reports the auth/model state paths and exits without opening a TUI. Setup creates `modelPolicies.coding` from the selected candidate when the policy is missing, defaults unset `shrimpy` and `mechanic` agents to `modelPolicy: "coding"`, and smoke-tests `coding` through the normal resolver. If `coding` exists but does not resolve during setup, it reports the candidate problems and keeps the existing policy unless replacement is confirmed. After the policy setup passes, the guided setup session opens as the `mechanic` agent with the `setup` skill and an explicit `modelPolicy: "coding"` session override. Additional explicit agent policies are preserved, but they do not define whether first setup is complete.

## Agents

Each agent config entry has:

- `id` — stable agent id.
- `root` — workspace-relative or absolute path to that agent's root.
- `modelPolicy` — default model policy for fresh sessions opened as that agent. If omitted, Shrimpy uses `coding`.
- `tools` — allowed Shrimpy daemon tools such as `reply`, `ask`, `notify`, `report`, `send_message`, `read_channel`, and `run_child`.
- `disabledTools` — effective tool names to exclude from Pi sessions. Use this to disable Pi built-ins such as `bash`; names are passed to Pi as `excludeTools`, so extension/custom tool names can be listed too.
- `thinking` — default reasoning effort for sessions opened as that agent.
- `channelPolicy` — when visible channel messages become turns for this agent.

Agent identity, model policy defaults, tool policy, and channel policy live in `agents`. Channel participation lives in `config/channels.json`. See [channels.md](channels.md) for channel delivery semantics and [tools.md](tools.md) for the full distinction between Pi built-ins, Shrimpy daemon tools, and `disabledTools`. Inspect the resolved capability view with `shrimpy agent inspect <id> [--json]`.

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

Addressing and mentions are inputs to the agent's own policy. They do not route around channel visibility, and they do not override `mode: "none"`. An agent is not re-offered its own channel messages.

Channel policy can be narrowed by sender (`system`, `human`, `agent`), stable `actorIds`, or stable `userIds`, and overridden by channel pattern:

```json
{
  "id": "shrimpy",
  "channelPolicy": {
    "mode": "mentions",
    "channels": {
      "home": { "mode": "all", "senders": ["human", "system"] },
      "maintenance": { "mode": "all", "senders": ["system"] }
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
shrimpy agent channel-policy set shrimpy --channel maintenance --mode all --senders system

# Clear one field, or drop a whole channel override.
shrimpy agent channel-policy clear shrimpy --senders
shrimpy agent channel-policy clear shrimpy --channel maintenance
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

See [channels.md](channels.md) for protocol, addressing, delivery, and egress semantics.

## Watches

Background attention rules live in `agents/<id>/watches.json`.

A watch is owned by one agent. Its `trigger` says what the system keeps an eye on; time is one trigger kind. There is no second public config file for recurring work.

To wake an agent on a clock, add a watch with `trigger.kind = "time"` and a message action. When the trigger fires, the gateway posts the watch text into the configured channel. If the owning agent is a member of that channel and its policy accepts the message, it gets a normal turn.

For the common case, use the CLI:

```sh
shrimpy watches add morning-check \
  --agent shrimpy \
  --name "Morning check" \
  --every 1h \
  --concurrency-policy forbid \
  --channel maintenance \
  --message "Check the house."
```

Command watches are optional. Use them when the watch should check something deterministic first and only post when the result is worth saying.

Fresh setup records `watchClock.defaultTimezone`, which cron watches use for the workspace. Per-watch JSON can set root-level `timezone` or `trigger.timezone` for a rare explicit override. `--concurrency-policy` accepts `forbid` or `allow`; omitted watches default to `forbid`.

Current trigger kinds:

- `time` with `cron`
- `time` with `everyMs`

Message watch shape:

```json
{
  "id": "memory-management",
  "trigger": { "kind": "time", "cron": "0 3 * * *" },
  "concurrencyPolicy": "forbid",
  "action": {
    "kind": "message",
    "channel": "maintenance",
    "text": "Use the `memory-management` skill."
  }
}
```

Command watch shape:

```json
{
  "id": "disk-space",
  "trigger": { "kind": "time", "everyMs": 3600000 },
  "action": { "kind": "command", "command": "df -h /" },
  "emit": {
    "policy": "on_output",
    "channel": "maintenance",
    "template": "Disk check:\n{{stdout}}"
  }
}
```

Fresh setup seeds three focused watches for the default `shrimpy` agent:

- `memory-management` — daily at 03:00, runs the memory upkeep skill.
- `journal-daily` — daily at 22:30, writes a same-day journal note only if activity warrants it.
- `journal-compact` — Sundays at 04:00, compacts old journal notes.

Channel membership stays in `config/channels.json`. Message watches choose a channel to log through; setup seeds the default `home` and `maintenance` channels with both default agents, `shrimpy` and `mechanic`, as members.

Inspect watches with `shrimpy watches [--agent <id>] [--json]`, `shrimpy watches show <agent-id>/<watch-id>`, or `shrimpy watches history <agent-id>/<watch-id>`. The inspection surface reports source paths, owner/local ids, target channels, expected wake behavior, next run, active runs, diagnostics, and recent run history. JSON includes `nextRunSource`; `clock_state` means the gateway clock recorded the timestamp, while `computed` means inspection calculated a fallback because clock state has not recorded that watch yet.

## Watch Status

`shrimpy status`, `shrimpy gateway status`, `shrimpy watches`, TUI `/status watches`, and turn context summarize watch runs across configured agent-owned watches. This aggregate status is not tied to any reserved channel.

`status.watchedWatches` is optional targeted diagnostic config for callers that need to track a specific watch/channel pair:

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

- `label` is the diagnostic name. If omitted, Shrimpy uses `watchId`.
- `channel` is the channel log where the watch writes emitted messages.
- `watchId` is the resolved watch id, for example `agent-id/local-watch-id`.

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
        "channels": ["maintenance", "finance"],
        "freshForMs": 60000
      }
    ]
  }
}
```

`context.agents.<id>` adds sources/env for one agent, and `context.agents.<id>.channels.<pattern>` specializes that agent's view for a channel pattern.

The runtime environment prompt includes workspace and session routing facts. Current model/provider identity is recorded in session metadata for inspection rather than rendered into the agent prompt, because model selection can change inside a running session.

Live state lands in [turn context](turn-context.md) rather than static prompt resources. See [context-assembly.md](context-assembly.md) for how sections are assembled.
