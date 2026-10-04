# 🦐 Tools

Shrimpy uses Pi's native tool runtime and adds a small set of Shrimpy daemon tools for channels and publication. There is no separate Shrimpy tool-calling protocol.

Pi validates and executes native tool calls and adds their results to model context. Shrimpy registers its channel tools through Pi's `customTools` SDK option.

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

`send_message` is the lower-level routing primitive; alias resolution and egress semantics live in [channels.md](channels.md). `read_channel` returns recent channel messages as bounded JSON, with the default limit from `tools.readChannel.defaultLimit`.

## Agent Policy

Configure an agent's allowed Shrimpy tools and excluded effective tools through [agents configuration](configuration.md#agents). Inspect the result with:

```bash
shrimpy agent inspect <id> --json
```

The view distinguishes Pi built-ins, Shrimpy daemon tools, and unknown names, and shows active, registered-inactive, and excluded tools.
