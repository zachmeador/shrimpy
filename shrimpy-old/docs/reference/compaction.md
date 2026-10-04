# 🦐 Compaction

Shrimpy uses Pi's session compaction to keep long-running sessions usable while keeping channel logs and session files as the records it can return to. See [sessions.md](sessions.md) for session files and lifecycle.

Compaction is working-context maintenance. It does not mutate channel history, and it is not long-term memory. When a session gets too large, older session entries are summarized into a `compaction` entry and recent entries remain in the active prompt context.

## Scope

Each Shrimpy session is a private Pi context with a canonical key such as `local/main` or `channel/home`. Auto-compaction applies to that session file only.

Channel logs remain append-only JSONL under `channels/`. If a summary is too compressed, an agent can use channel and session inspection tools to go back to the original logs.

Compaction summaries may cover human-agent, agent-agent, watch-origin, and system-originated turns. Prompt wording should describe participants and requests generically, not assume every transcript is a user talking to one coding assistant.

## Policy

Compaction policy is resolved when a session is opened. Shrimpy passes the effective values into Pi through an inline settings manager:

- `enabled` controls whether Pi auto-compaction runs.
- `reserveTokens` is the headroom Pi reserves before compacting.
- `keepRecentTokens` is the approximate amount of recent context Pi keeps after cutting old context away.
- `thresholdTokens` is Shrimpy syntax for "compact after roughly this many model-visible tokens." When a model context window is known, Shrimpy translates it to `reserveTokens = contextWindow - thresholdTokens`.
- `instructions` are additional summary instructions appended by Shrimpy's compaction extension.

Defaults are tuned to keep chat usable:

```json
{
  "runtime": {
    "compaction": {
      "enabled": true,
      "reserveTokens": 32768,
      "keepRecentTokens": 30000
    }
  }
}
```

Policy precedence is:

1. `runtime.compaction`
2. `runtime.compaction.agents.<agentId>`
3. `runtime.compaction.sessions.<purpose>`
4. matching `runtime.compaction.channels.<pattern>`
5. `runtime.compaction.sessions.<sessionName>`

`purpose` is a policy class such as `channel`, `interactive`, `setup`, `run`, or `worker`. `sessionName` is the key's concrete name, such as `maintenance`.

## Recorded Policy

When a session opens, Shrimpy appends inspection-only custom entries to the active session JSONL:

- `shrimpy_session_metadata`, including agent, channel, env, effective compaction policy, and resolved model metadata.
- `shrimpy_compaction_policy`, storing the policy that was active when the session was opened.

Pi ignores these custom entries when building LLM context. Shrimpy uses them for inspection and restart diagnostics.

Policy changes do not rewrite already-open sessions. Reset or reopen the durable session before changed policy takes effect. Use:

```sh
shrimpy sessions compaction <session-id> --agent <id> --json
```

The command reports the effective policy, selected model metadata, the active session's recorded policy/runtime metadata when present, and whether a restart/reset is required.

## Summary And Context

Pi chooses when to compact and which history to retain. Shrimpy summarizes the older entries using the session's model, system prompt, and compaction instructions. Pi persists the summary and rebuilds model context from it plus recent entries.

Summaries adapt to the conversation: task work retains progress, constraints, decisions, and next steps; casual chat retains useful facts, preferences, tone, and loose ends. Exact paths, commands, dates, and error messages remain useful inspection clues. A split turn gets a separate turn-prefix summary, and file-operation references remain in the stored result.

## Failures

Channel-owned gateway sessions append one typed `operation_status` when Pi reports a compaction error that it will not retry. The bound chat receives that status through the normal channel outbox, with the affected agent and canonical `shrimpy sessions compaction` inspection command. Compaction start, success, retryable failure, and ordinary abort events stay quiet, as do direct local sessions. The status omits summary content, token counts, provider payloads, and raw provider errors.

Gateway logs may show:

```text
Auto-compaction failed: Summarization failed: 503 status code (no body)
```

or, for split turns:

```text
Turn prefix summarization failed: 503 status code (no body)
```

These mean the summarization request reached the provider path and the provider returned an error. Common causes:

- the configured model id is not served by the backend
- the backend has no healthy worker for the selected model
- provider headers or API key are wrong
- requested output limits exceed provider/model limits
- the provider is temporarily unavailable

Check these in order:

1. `shrimpy sessions compaction <session-id> --agent <id> --json` to confirm effective and recorded policy.
2. The configured model entry in `state/pi/models.json`.
3. The gateway/provider model list and health status.
4. Recent `workspace/runtime/logs/gateway.log` lines around the failed compaction.

If the active session recorded stale policy or model metadata, run `shrimpy sessions new <session-id> --agent <id>`. Shrimpy routes the request to a gateway owner or takes an exclusive maintenance lease when the session is unowned. The next message opens a fresh session under current policy.

## Maintainer Details

The `session_before_compact` extension handles Pi's prepared cut plan and returns a result persisted with `fromHook: true`; Pi falls back to its built-in path if no result is returned. Stored results include the summary, first kept entry ID, prior token count, aggregate usage, and read/modified file references.

Summary requests use the session's provider path and retry settings, a fresh routing session ID, no prompt-cache retention, and output limits capped to the model. Usage includes split-turn, chunk, and merge requests.

- Policy and hook: `src/sessions/compaction/policy.ts`, `src/sessions/compaction/extension.ts`
- Provider requests: `src/sessions/compaction/runner.ts`
- Summary instructions: `src/instructions/compaction.ts`
- Regression coverage: `test/compaction-runner.test.ts`
