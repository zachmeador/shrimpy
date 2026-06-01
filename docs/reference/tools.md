# 🦐 Tools

Shrimpy uses Pi's native tool runtime and adds a small set of Shrimpy daemon
tools for channels, publication, and child runs. There is no separate Shrimpy
tool-calling protocol.

## Runtime Model

Pi owns the tool loop:

1. Active tool schemas are sent to the model provider as native tool definitions.
2. The model emits a tool call.
3. Pi validates the arguments against the tool's TypeBox schema.
4. Pi runs the tool's `execute()` function.
5. Pi appends the tool result back into the turn context.

Tool calls may run in parallel within a turn when the provider/model emits
parallel calls. Tool output should stay bounded and prompt-safe.

Shrimpy enters this model through Pi's SDK options:

- `customTools` — additive Shrimpy daemon tools.
- `excludeTools` — denied effective tool names, used for Pi built-ins,
  Shrimpy daemon tools, extension tools, or future custom tools.

## Native Pi Tools

Pi built-ins are the normal coding-agent tools. Shrimpy does not reimplement
them.

Default active Pi built-ins:

- `read`
- `bash`
- `edit`
- `write`

Known registered Pi built-ins that may be selected by Pi policy or future
configuration:

- `grep`
- `find`
- `ls`

Shrimpy's default sessions leave Pi's default active built-ins available unless
an agent excludes them through `disabledTools`. For example, add `bash` to an
agent's `disabledTools` to deny shell execution for that agent.

## Shrimpy Daemon Tools

Shrimpy daemon tools are Pi custom tools backed by Shrimpy runtime services.
They exist to connect a Pi session to Shrimpy channels, surfaces, and child
session execution.

| Tool | Purpose |
| --- | --- |
| `reply` | Publish a response to the active gateway/channel turn. |
| `ask` | Publish a user-facing question to the active gateway/channel turn. |
| `notify` | Publish a notification with optional urgency, quiet, and batching metadata. |
| `report` | Publish a concise completion report or summary to the active gateway/channel turn. |
| `send_message` | Send text to an explicit Shrimpy channel or agent DM. |
| `read_channel` | Read recent messages from a Shrimpy channel or agent DM. |
| `run_child` | Open a fresh child `run` session with the same agent, auth, and model registry, then return the child result. |

`reply`, `ask`, `notify`, and `report` require an active publication channel.
Gateway channel sessions have one. Direct `tui` and `run` sessions do not, so
those publication helpers are not registered there; the agent should answer the
local user with ordinary assistant text.

`send_message` is the lower-level routing primitive. It logs to the named
channel and delivers externally only when a surface adapter matches that
channel. Agent DMs are internal channels, so no external adapter is expected.

`read_channel` returns recent channel messages as bounded JSON. The default
limit comes from `tools.readChannel.defaultLimit`.

`run_child` is for bounded delegated work. The child run gets separate session
persistence under the agent workspace while reusing Shrimpy's Pi auth and model
registry.

Scheduling is intentionally CLI-only: agents create one-time follow-ups with
`shrimpy schedules once --at/--in ...`, not a daemon tool.

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
    "read_channel",
    "run_child"
  ],
  "disabledTools": ["bash"]
}
```

Policy fields:

- `tools` selects allowed Shrimpy daemon tools. If omitted or empty, Shrimpy uses
  all built-in daemon tools.
- `disabledTools` denies effective tool names by passing them to Pi as
  `excludeTools`. This is the field to use for Pi built-ins such as `bash`, and
  it can also name Shrimpy daemon tools or extension/custom tools.

The effective capability view is inspectable:

```bash
shrimpy agent inspect <id>
shrimpy agent inspect <id> --json
```

The view distinguishes `pi built-in`, `shrimpy daemon`, and `unknown` names, and
shows active, registered-inactive, and excluded tools.

## Prompt Text

Pi provider-native tool schemas are authoritative even when the rendered system
prompt does not include detailed built-in tool prose.

Shrimpy passes Pi an explicit assembled system prompt. With that custom prompt,
Pi still exposes active tool schemas to the provider, but Pi's default
"Available tools" prose for built-ins is not automatically rendered into
`shrimpy context` previews. Shrimpy daemon tools provide short prompt snippets
and descriptions for the model.

Use `shrimpy context --agent <id>` to inspect prompt text, and use
`shrimpy agent inspect <id>` to inspect the effective provider-side tool set.

## Skills Are Not Tools

Skills are Pi-style prompt/resource bundles, not executable daemon tools.
Shrimpy chooses which workspace and agent skill files Pi can see, while Pi owns
skill parsing, `/skill:<name>` expansion, autocomplete, and the
`<available_skills>` prompt block. See [skills.md](skills.md).

## Future Tools

Planned browser and web-search capabilities follow the same rule: CLI first,
then daemon tools that mirror inspectable CLI behavior. Active backlog notes:

- [browser-001-default-browser-tool.md](../backlog/browser-001-default-browser-tool.md)
- [search-001-web-search-provider-wrapper.md](../backlog/search-001-web-search-provider-wrapper.md)
