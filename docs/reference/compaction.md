# Compaction

Shrimpy uses Pi's session compaction to keep long-running sessions usable while preserving channel logs and session files as the durable source of truth.

Compaction is working-context maintenance. It does not mutate channel history, and it is not long-term memory. When a session gets too large, older session entries are summarized into a `compaction` entry and recent entries remain in the active prompt context.

## Scope

Each Shrimpy session is a private Pi context for one agent and one session label, usually a channel name. Auto-compaction applies to that session file only.

Channel logs remain append-only JSONL under `channels/`. If a summary is too compressed, an agent can use channel and session inspection tools to go back to the original source material.

Compaction summaries may cover human-agent, agent-agent, scheduled, and system-originated turns. Prompt wording should describe participants and requests generically, not assume every transcript is a user talking to one coding assistant.

## Policy

Compaction policy is resolved when a session is opened. Shrimpy passes the effective values into Pi through an inline settings manager:

- `enabled` controls whether Pi auto-compaction runs.
- `reserveTokens` is the headroom Pi reserves before compacting.
- `keepRecentTokens` is the approximate amount of recent context Pi keeps after cutting old context away.
- `thresholdTokens` is Shrimpy syntax for "compact after roughly this many model-visible tokens." When a model context window is known, Shrimpy translates it to `reserveTokens = contextWindow - thresholdTokens`.
- `instructions` are additional summary instructions appended by Shrimpy's compaction extension.

Defaults are tuned for chat continuity:

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

The built-in `heartbeat` channel policy uses `thresholdTokens: 100000`, keeps about `30000` recent tokens, and asks the summary to preserve unresolved follow-ups, active or stale sessions, recent interactions, memory changes, and behavior-changing decisions.

Policy precedence is:

1. `runtime.compaction`
2. `runtime.compaction.agents.<agentId>`
3. `runtime.compaction.sessions.<sessionType>`
4. matching `runtime.compaction.channels.<pattern>`
5. `runtime.compaction.sessions.<sessionLabel>`

`sessionType` is a broad class such as `gateway` or `tui`. `sessionLabel` is the concrete session directory label, such as `heartbeat`.

## Recorded Policy

When a session opens, Shrimpy appends inspection-only custom entries to the active session JSONL:

- `shrimpy_session_metadata`, including agent, channel, env, effective compaction policy, and resolved model inference metadata.
- `shrimpy_compaction_policy`, storing the policy that was active when the session was opened.

Pi ignores these custom entries when building LLM context. Shrimpy uses them for inspection and for compaction request parity.

Policy changes do not rewrite already-open sessions. Running gateway sessions need to be reset/reopened or the gateway restarted before changed policy takes effect. Use:

```sh
shrimpy sessions compaction <channel> --agent <id> --json
```

The command reports the effective policy, selected model/inference metadata, the active session's recorded policy/runtime metadata when present, and whether a restart/reset is required.

## Runtime Flow

Pi decides whether to compact after an agent turn completes. It uses the selected model, current compaction settings, recent assistant usage, and the active session branch.

When compaction starts:

1. Pi prepares a cut plan: entries to summarize, entries to keep, optional split-turn prefix messages, previous compaction summary, token counts, and file operation details.
2. Shrimpy's `session_before_compact` extension handles the prepared plan.
3. The extension reads Shrimpy policy instructions and session inference metadata from the branch entries.
4. The extension calls Shrimpy's compaction runner with Pi's selected model, model-registry API key, headers, abort signal, and provider payload hook.
5. If the extension returns a compaction result, Pi persists it as a normal `compaction` entry with `fromHook: true`.
6. If the extension does not return a compaction result, Pi falls back to its built-in compaction path.

The compaction entry stores:

- `summary`
- `firstKeptEntryId`
- `tokensBefore`
- `details.readFiles`
- `details.modifiedFiles`

After the entry is appended, Pi rebuilds the session context. Future prompts see the compaction summary plus the kept recent entries.

## Summary Shape

Shrimpy keeps Pi's structured summary shape:

- Goal
- Constraints & Preferences
- Progress
- Key Decisions
- Next Steps
- Critical Context

When a compaction updates an earlier compaction, the summary prompt asks the model to preserve old useful context, add new progress and decisions, update next steps, and keep exact file paths, function names, and error messages.

Shrimpy also adds a default bias to preserve approximate time anchors for significant events, decisions, and topic shifts. This is deliberate: Shrimpy agents have tools to inspect original channel and session logs by date, so a rough timestamp can be more useful than an over-compressed timeless summary.

If Pi cuts in the middle of a large turn, Shrimpy generates two summaries:

- a history summary for older entries
- a turn-prefix summary for the prefix of the current turn

The final stored summary includes a `Turn Context (split turn)` section for that prefix. File operations are appended as `<read-files>` and `<modified-files>` tags.

## Provider Request Path

Compaction must use the same provider path as normal turns. Shrimpy's compaction runner calls `completeSimple` through the selected Pi model and passes:

- model-registry API key
- model-registry headers
- abort signal
- Shrimpy's model inference payload transform
- Pi-compatible reasoning options for reasoning-capable models

The payload transform reads the latest `shrimpy_session_metadata.inference` from the session branch and applies the same behavior used by normal turns:

- logical model id to backend `baseModel` alias mapping
- inference params such as `temperature`, `top_p`, `top_k`, `min_p`, `presence_penalty`, and `repeat_penalty`
- provider-specific thinking flags such as Qwen chat-template `enable_thinking`

This matters for local gateway setups where the user-facing model id is a Shrimpy alias and the backend only serves a healthier model alias such as `dense`.

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

- the request used a logical model id that the backend cannot serve
- the backend has no healthy worker for the mapped model alias
- provider headers or API key are wrong
- requested output limits exceed provider/model limits
- the provider is temporarily unavailable

Check these in order:

1. `shrimpy sessions compaction <channel> --agent <id> --json` to confirm effective and recorded policy.
2. The active session JSONL for `shrimpy_session_metadata.inference`.
3. The configured model entry in `state/pi/models.json`.
4. The gateway/provider model list and health status.
5. Recent `workspace/runtime/logs/gateway.log` lines around the failed compaction.

If the active session recorded stale policy or stale model metadata, reset/reopen that session or restart the gateway so the session records the current configuration.

## Related Code

- Compaction policy resolution: `src/sessions/compaction-policy.ts`
- Session-open policy recording: `src/sessions/open.ts`
- Shrimpy compaction hook: `extensions/compaction-bias.ts`
- Provider-aware compaction runner: `src/sessions/compaction-runner.ts`
- Compaction prompt text: `src/context/system/compaction.ts`
- Regression coverage: `test/compaction-runner.test.ts`
