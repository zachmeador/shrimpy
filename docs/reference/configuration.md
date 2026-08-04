# 🦐 Configuration

Shrimpy config is file-backed and meant to be inspected through normal commands before hand-editing JSON. The workspace config names agents, model policies, tools, context sources, surfaces, watches, and status hints; the behavior behind each section lives in its owning reference doc.

## Files

```text
~/.shrimpy-workspace.json               optional default workspace pointer
config/shrimpy.json                     main workspace runtime config
config/channels.json                    channel membership, manifests, and transport bindings
agents/<id>/watches.json                agent-owned watches
runtime/bin/                            workspace-local command shims
state/pi/auth.json                      Pi provider auth
state/pi/models.json                    Pi-visible provider/model registry
state/pi/models-store.json              cached dynamic provider catalogs
state/users.json                        stable user ids and optional workspace owner
state/user-presence.json                last active chat surface per known user
```

The optional workspace pointer is:

```json
{
  "workspace": "/path/to/workspace"
}
```

Workspace resolution is explicit-first: leading `--workspace <path>`, then `SHRIMPY_WORKSPACE`, then a cwd-local `.shrimpy/config/shrimpy.json`, then `~/.shrimpy-workspace.json`, then `~/.shrimpy/`. The CLI stores the flag value in `SHRIMPY_WORKSPACE` so Shrimpy-owned child processes inherit it. Relative explicit values resolve against the cwd. The global `--workspace` must lead, before the subcommand (`shrimpy --workspace /path status`); a trailing `--workspace` belongs to the subcommand.

Each initialized runtime writes command shims under `runtime/bin/`. Shrimpy-owned child processes put that directory first on `PATH`, so bare `shrimpy` and `shrimpy-gateway` resolve to the app checkout and workspace that created the runtime.

## Inspect First

CLI commands validate inputs and preserve unrelated fields; hand-edit JSON only when there is no narrower command for the change.

```bash
shrimpy status
shrimpy models
shrimpy agent show shrimpy
shrimpy agent inspect shrimpy
shrimpy channels show home
shrimpy watches --agent shrimpy
shrimpy context --config
shrimpy users list
```

Use `--json` when the output feeds a script or another agent.

## Main Config

`config/shrimpy.json` is a JSON object. Recognized sections:

- `modelPolicies` — named model policies with ordered provider/model candidates.
- `agents` — agent ids, roots, session cwd, default model policy, tools, thinking default, and channel policy.
- `runtime` — Pi/Shrimpy runtime behavior: theme, startup noise, prompt-template suppression, skill discovery, and compaction policy.
- `tools` — defaults for Shrimpy daemon tools.
- `context` — stable prompt sources and live turn-context producers/settings. See [context-assembly.md](context-assembly.md).
- `telegram` and other surface keys — configured surface instances, auth, allowlists, user mappings, default agent, and reliability policy.
- `watchClock` — workspace watch clock tick and default timezone.
- `status` — optional targeted watch diagnostics.
- `web` — gateway-managed local workspace inspector enablement and port.

Config validation rejects unknown fields inside validated sections. Surface modules validate their own top-level section.

## Runtime

Shrimpy keeps Pi's ambient discovery quiet by default: prompt-template discovery is disabled, Pi-discovered `AGENTS.md` and append-system prompts are suppressed, ambient skill discovery is suppressed, and Shrimpy owns the assembled system prompt passed into Pi.

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

Compaction overrides can be scoped per agent, session type, channel pattern, or session name; the policy fields, precedence, and failure debugging live in [compaction.md](compaction.md).

## Web Inspector

The gateway starts the separate, read-only `shrimpy-web` process on loopback by default. It reads the current workspace files directly and serves the inspector at `http://127.0.0.1:5174`. A web bind or process failure is reported by `shrimpy status` and `shrimpy gateway status` but does not stop gateway delivery, watches, or surfaces.

```json
{
  "web": {
    "enabled": true,
    "port": 5174
  }
}
```

Set `web.enabled` to `false` when this gateway should not manage an inspector. `shrimpy-web --workspace /path --port 5174` remains available for direct development and diagnostics.

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
    }
  }
}
```

Policies resolve against Pi-visible models and configured auth; Shrimpy uses the first usable candidate.

```bash
shrimpy models
shrimpy models policies show coding
shrimpy models policies set coding --candidate openai/gpt-5
shrimpy models policies add-candidate coding anthropic/claude-opus --index 1
shrimpy models resolve --agent shrimpy --session local/main
```

Concrete custom provider/model entries live in `state/pi/models.json`. Pi caches refreshed dynamic provider catalogs in `state/pi/models-store.json` for offline startup. `shrimpy setup` can write provider auth through Pi's model runtime, refresh available models, and create `coding` from the selected candidate.

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

The command writes Pi's OpenAI-compatible provider shape with a local dummy `apiKey`, zero cost metadata, `input: ["text"]`, `reasoning: false`, and the requested `contextWindow`/`maxTokens`. `--set-coding` points the `coding` policy at the new provider/model pair.

The model id you configure is the id Pi sends to the provider. If a server exposes a different backend model name, configure that name as the model id.

For hand-edited local model entries:

- use Pi-native provider/model fields in `state/pi/models.json`
- use `compat.thinkingFormat` only with Pi's own values, such as `qwen` or `qwen-chat-template`, when the provider/model needs that compatibility behavior
- prefer Pi model-level `thinkingLevelMap` for model-specific reasoning controls
- set `reasoning: false` for local models when Pi should not expose reasoning-effort levels
- keep sampler presets and backend aliasing in the provider or Pi-supported model config, not in Shrimpy workspace or agent config

Example provider entry:

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
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

`apiKey` and custom `headers` support Pi's config value syntax: `"$ENV_VAR"` / `"${ENV_VAR}"` interpolation, `"!command"` command execution, `"$$"` for a literal dollar prefix, and `"$!"` for a literal bang prefix. Command values resolve at request time; wrap slow secret fetches in a caching script.

## Agents

An agent config entry controls the runtime defaults for one agent. The agent's durable files live under its root.

```json
{
  "id": "shrimpy",
  "root": "agents/shrimpy",
  "cwd": "agents/shrimpy",
  "modelPolicy": "coding",
  "tools": ["reply", "ask", "notify", "report", "send_message", "read_channel"],
  "disabledTools": [],
  "thinking": "medium",
  "knowledgeScope": "agent",
  "channelPolicy": {
    "mode": "all"
  }
}
```

- `id` — stable agent id.
- `root` — workspace-relative or absolute path to the agent's Shrimpy-owned root: identity, context, vault, watches, skills, and session files.
- `cwd` — default working directory for sessions opened as this agent. Defaults to `root`; use `"."` for the workspace root or an absolute path for another mount.
- `modelPolicy` — default model policy for fresh sessions; omitted agents fall back to `coding`.
- `tools` — allowed Shrimpy daemon tools; omitted or empty means all of them. See [tools.md](tools.md).
- `disabledTools` — effective tool names passed to Pi as `excludeTools`, including Pi built-ins such as `bash`.
- `thinking` — default reasoning effort.
- `knowledgeScope` — workspace-search visibility. `agent` sees shared workspace knowledge plus this agent's context, vault, and skills; `global` sees every indexed agent corpus. The default is `agent`. The `mechanic` agent always resolves to `global`.
- `channelPolicy` — when visible channel messages become turns. Modes, sender filters, and per-channel overrides are documented in [channels.md](channels.md).

Channel participation lives in `config/channels.json`, not in agent config.

Prefer command edits:

```bash
shrimpy agent add <id>
shrimpy agent set <id> --model-policy coding
shrimpy agent set <id> --knowledge-scope global
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

Membership means visibility; the agent's own `channelPolicy` decides whether a visible message becomes a turn. Use `shrimpy channels join|leave|members|show` instead of hand-editing membership. See [channels.md](channels.md).

Telegram configuration lives under `telegram` in `config/shrimpy.json`. Every instance must configure `allowedChatIds`; unauthorized chats are dropped before any processing. Use `shrimpy setup telegram` for guided setup and [surfaces.md](surfaces.md) for transport behavior.

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

Stable human ids live in `state/users.json`. Telegram `users` mappings turn transport ids into stable Shrimpy ids such as `human:alice` and authorize mapped users to run remote commands in allowed group chats. An allowed one-to-one private chat authorizes its matching Telegram user directly; see [surfaces.md](surfaces.md) for the transport boundary. The optional top-level `owner` names the canonical workspace user; when set, CLI publishers stamp messages as that owner. Manage workspace identities with `shrimpy users list|get-owner|set-owner`.

## Watches And Status

Agent-owned watches live in `agents/<id>/watches.json`. A watch belongs to one agent, has a trigger, and either posts a watch-authored message to a channel or runs a command check that can emit to a channel. Current trigger kinds are `time` with `cron` and `time` with `everyMs`. `concurrencyPolicy` is `forbid` (the default) or `allow`.

For normal edits:

```bash
shrimpy watches add morning-check \
  --agent shrimpy \
  --name "Morning check" \
  --every 1h \
  --channel maintenance \
  --addressed shrimpy \
  --message "Check the house."

shrimpy watches show shrimpy/morning-check
shrimpy watches history shrimpy/morning-check
shrimpy watches enable shrimpy/morning-check
shrimpy watches disable shrimpy/morning-check
```

`watchClock.defaultTimezone` sets the workspace default timezone for cron watches. Per-watch JSON can set root-level `timezone` or `trigger.timezone` for rare explicit overrides.

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

Command watch emit policies are `never`, `always`, `on_output`, `on_change`, and `on_failure`. See [runtime.md](runtime.md) for how watch messages become agent turns.

`status.watchedWatches` is optional diagnostic config for callers that need to track a specific watch/channel pair; general status commands already summarize watches without it:

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

## Context

`context.sources` is the ordered stable Markdown resource list; `context.turn.producers` configures automatic live-fact commands; other `context.turn` keys configure built-in per-turn context. `context.agents.<id>` and `context.agents.<id>.channels.<pattern>` can scope stable sources to one agent or channel. See [context-assembly.md](context-assembly.md) for source syntax, producer conditions, and what each context layer sends to the model.

### Workspace Knowledge Breadcrumbs

Workspace knowledge breadcrumbs are always active. Ranking thresholds are configured once for the workspace, while `agents[].knowledgeScope` determines which indexed documents participate in each agent's ranking.

```json
{
  "context": {
    "turn": {
      "knowledge": {
        "maxItems": 3,
        "minScore": 1.5
      }
    }
  }
}
```

| Field | Default | Meaning |
|---|---:|---|
| `context.turn.knowledge.maxItems` | `3` | Maximum distinct workspace paths included in one turn. |
| `context.turn.knowledge.minScore` | `1.5` | Minimum workspace-search relevance score required for a breadcrumb. |

```bash
shrimpy context --config
shrimpy context sources list --agent shrimpy --channel home
shrimpy context producers list --agent shrimpy --channel home
```
