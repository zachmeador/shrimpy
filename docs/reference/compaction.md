# Compaction

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

## Runtime Flow

Pi decides whether to compact after an agent turn completes. It uses the selected model, current compaction settings, recent assistant usage, and the active session branch.

When compaction starts:

1. Pi prepares a cut plan: entries to summarize, entries to keep, optional split-turn prefix messages, previous compaction summary, token counts, and file operation details.
2. Shrimpy's `session_before_compact` extension handles the prepared plan.
3. The extension reads Shrimpy policy instructions from the branch entries.
4. The extension reads the current session system prompt through Pi's extension context and passes it to Shrimpy's compaction runner, so the compaction request has the same parent agent identity, personality, voice, tone, and operating context as the session being compacted.
5. The extension calls Shrimpy's compaction runner with Pi's selected model, model-registry API key, headers, and abort signal.
6. If the extension returns a compaction result, Pi persists it as a normal `compaction` entry with `fromHook: true`.
7. If the extension does not return a compaction result, Pi falls back to its built-in compaction path.

The compaction entry stores:

- `summary`
- `firstKeptEntryId`
- `tokensBefore`
- `details.readFiles`
- `details.modifiedFiles`

After the entry is appended, Pi rebuilds the session context. Future prompts see the compaction summary plus the kept recent entries.

## Summary Shape

Shrimpy asks the compaction model to write the kind of summary that fits the session rather than forcing one fixed template.

For task or project work, a summary can use headings for goals, constraints, progress, decisions, blockers, next steps, and important files or commands when those are useful. For casual chat, the summary can instead be a short note with what they were talking about, facts that matter, loose ends, preferences, tone, and timestamps. Empty headings and filler should be omitted.

When a compaction updates an earlier compaction, the summary prompt asks the model to keep useful old details, add new facts and decisions, update task status when there is task work, update the chat summary when there is chat, and keep exact file paths, function names, commands, dates, and error messages.

Shrimpy also asks summaries to keep rough time clues and notes about the agent itself. Time clues matter because Shrimpy agents have tools to inspect original channel and session logs by date. Agent notes matter because the same agent resumes after compaction; the summary should carry forward who the agent is, how it talks, how it works, and relevant user/workspace preferences instead of turning the next turn into a generic assistant reply.

If Pi cuts in the middle of a large turn, Shrimpy generates two summaries:

- a history summary for older entries
- a turn-prefix summary for the prefix of the current turn

The final stored summary includes a `Turn Context (split turn)` section for that prefix. File operations are appended as `<read-files>` and `<modified-files>` tags.

## Provider Request Path

Compaction must use the same provider path as normal turns. Shrimpy's compaction runner calls `completeSimple` through the selected Pi model and passes:

- model-registry API key
- model-registry headers
- abort signal
- Pi-compatible reasoning options for reasoning-capable models

Compaction uses Pi's selected model/provider config for provider compatibility, model ids, thinking formats, and request shaping.

Compaction also caps summarization `maxTokens` to the selected model's `maxTokens`. Pi's requested summary budget can otherwise be much larger than the model's output limit.

## Failures

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

## Related Code

- Compaction policy resolution: `src/sessions/compaction-policy.ts`
- Session-open policy recording: `src/sessions/open.ts`
- Shrimpy compaction hook: `extensions/compaction-bias.ts`
- Provider-aware compaction runner: `src/sessions/compaction-runner.ts`
- Compaction prompt text: `src/context/system/compaction.ts`
- Regression coverage: `test/compaction-runner.test.ts`
