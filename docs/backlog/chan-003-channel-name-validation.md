# 🦐 CHAN-003: Channel Name Validation At Boundaries

Status: review
Priority: P1
Area: Channels
Depends On: none

## Why
There is no channel name validation anywhere on the append path. `channelPath` in `src/channels/store.ts` does `join(channelsDir, channel + ".jsonl")` with whatever string arrives, and every producer reaches it unchecked: the agent-facing `send_message` tool, `shrimpy channels post`, watch targets, and surface bridges. `send_message(channel="../../something")` writes a JSONL file outside the channels directory. The stakes are local (it is the user's own workspace), but an agent can be confused into it, and malformed names also create files the rest of the CLI cannot address cleanly.

This is a small, self-contained fix worth doing before the larger channel work.

## Build
- Define one `ChannelName` parse/validate function: allowed charset covering existing conventions (`a-z0-9._-` segments plus `~` separators), no path separators, no traversal, sane length cap.
- Apply it at the boundaries: channel publisher/store append, CLI commands that take channel arguments, the `send_message` and `read_channel` tools, and watch target resolution.
- Make the tool-facing error message clear enough that an agent can self-correct (name the constraint, show the offending name).

## Boundaries
- Do not rename or migrate any existing channel. `home`, `telegram~main~123`, and `dm~a~b` must all validate as-is.
- Do not introduce a normalization layer that silently rewrites names; invalid input is an error, not a coercion.
- Do not block on CHAN-004; this is the safety slice that channel manifests later build on.

## Implementation Notes
- One helper module under `src/channels/`, called from `src/channels/store.ts` (or publisher) so no producer can bypass it, plus argument validation in `src/commands/channels*.ts` and `src/tools/daemon.ts` for better error locality.
- `sanitizeSessionSegment` in `src/sessions/spec.ts` stays as-is; it solves a different problem (filesystem-safe session dirs).
- Tests: traversal attempts fail with a clear error; every channel name currently produced by setup, surfaces, and DMs passes; the agent tool error is a tool failure, not a crash.

## Done
- A traversal or malformed channel name fails with a clear error at publish/read time from both CLI and agent tools.
- All existing channel naming conventions still validate.
- The validation lives in one place that all producers pass through.
