# 🦐 Tools

Shrimpy uses Pi's native tool runtime and adds a small set of Shrimpy daemon tools for channels and publication. There is no separate Shrimpy tool-calling protocol.

## Runtime Model

Pi owns the tool loop:

1. Active tool schemas are sent to the model provider as native tool definitions.
2. The model emits a tool call.
3. Pi validates the arguments against the tool's TypeBox schema.
4. Pi runs the tool's `execute()` function.
5. Pi appends the tool result back into the provider-facing message stream for that turn.

Tool calls may run in parallel within a turn when the provider/model emits parallel calls. Tool output should stay bounded and prompt-safe.

Shrimpy enters this model through Pi's SDK options:

- `customTools` — additive Shrimpy daemon tools.
- `excludeTools` — denied effective tool names, used for Pi built-ins, Shrimpy daemon tools, extension tools, or other registered custom tools.

## Native Pi Tools

Pi built-ins are the normal coding-agent tools. Shrimpy does not reimplement them.

Default active Pi built-ins:

- `read`
- `bash`
- `edit`
- `write`

Additional registered Pi built-ins:

- `grep`
- `find`
- `ls`

Shrimpy's default sessions leave Pi's default active built-ins available unless an agent excludes them through `disabledTools`. For example, add `bash` to an agent's `disabledTools` to deny shell execution for that agent.

## Shrimpy Daemon Tools

Shrimpy daemon tools are Pi custom tools backed by Shrimpy runtime services. They exist to connect a Pi session to Shrimpy channels and surfaces. See [channels.md](channels.md) for channel publication and egress semantics.

| Tool | Purpose |
| --- | --- |
| `reply` | Publish a response to the active gateway/channel turn. |
| `ask` | Publish a user-facing question to the active gateway/channel turn. |
| `notify` | Publish a notification with optional urgency, quiet, and batching metadata. |
| `report` | Publish a concise completion report or summary to the active gateway/channel turn. |
| `send_message` | Send text to an explicit Shrimpy channel, `user:<id>` alias, or agent DM. |
| `read_channel` | Read recent messages from a Shrimpy channel or agent DM. |

`reply`, `ask`, `notify`, and `report` require an active publication channel. Gateway channel sessions have one. Direct `tui` and `run` sessions do not, so those publication helpers are not registered there; the agent should answer the local user with ordinary assistant text.

`send_message` is the lower-level routing primitive. It logs to the named channel; the gateway outbox delivers externally when the channel has a transport binding. `user:<id>` resolves to that user's last active chat surface at tool execution time, then logs to the concrete channel. Agent DMs are internal channels, so no external adapter is expected unless the channel is deliberately bound.

`read_channel` returns recent channel messages as bounded JSON. The default limit comes from `tools.readChannel.defaultLimit`.

Background attention rules are configured as agent-owned watches in `agents/<id>/watches.json` and inspected with `shrimpy watches`; there is no separate scheduling daemon tool.

## Agent Policy

Agent tool policy lives in `agents[]` inside `config/shrimpy.json`.

```json
{
  "id": "shrimpy",
  "tools": [
    "reply",
    "ask",
    "notify",
    "report",
    "send_message",
    "read_channel"
  ],
  "disabledTools": ["bash"]
}
```

Policy fields:

- `tools` selects allowed Shrimpy daemon tools. If omitted or empty, Shrimpy uses all built-in daemon tools.
- `disabledTools` denies effective tool names by passing them to Pi as `excludeTools`. This is the field to use for Pi built-ins such as `bash`, and it can also name Shrimpy daemon tools or extension/custom tools.

The effective capability view is inspectable:

```bash
shrimpy agent inspect <id>
shrimpy agent inspect <id> --json
```

The view distinguishes `pi built-in`, `shrimpy daemon`, and `unknown` names, and shows active, registered-inactive, and excluded tools.

## Prompt Text

`shrimpy context --agent <id>` is the context inspection surface for an agent. It should match the model-facing context for the requested agent, session, and turn. Use `shrimpy agent inspect <id>` when you specifically need to debug effective tool policy.

## Skill Context

Skills are Markdown instruction sets. Shrimpy adds trails for the visible workspace and agent skills to context, while Pi owns skill parsing, `/skill:<name>` expansion, autocomplete, and the `<available_skills>` prompt block. Executable behavior lives in tools, watches, and CLI commands. See [skills.md](skills.md).
