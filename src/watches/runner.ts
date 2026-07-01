import type { ChannelBus } from "../channels/bus.js";
import {
  textContent,
  type ChannelMessage,
  type MessageWatchProvenance,
} from "../channels/index.js";
import {
  clip,
  renderCommandEmitText,
  runCommandWatchAction,
  summarizeCommandResult,
  type CommandWatchResult,
} from "./actions.js";
import {
  appendWatchRunRecord,
  clearWatchRunActive,
  createSkippedWatchRunRecord,
  latestWatchOutputHash,
  loadActiveWatchRuns,
  markWatchRunActive,
  type WatchRunObservation,
  type WatchRunRecord,
} from "./run-store.js";
import type {
  ResolvedAgentWatchDefinition,
  WatchEmitConfig,
  WatchRunDue,
} from "./schema.js";
import { watchTriggerMetadata } from "./schema.js";

interface RunWatchDueOptions {
  run: WatchRunDue;
  channelBus: ChannelBus;
  runStoreRoot: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  logger?: Pick<Console, "warn" | "error">;
}

export async function runWatchDue(
  opts: RunWatchDueOptions,
): Promise<WatchRunRecord> {
  const now = opts.now ?? (() => Date.now());
  const watch = opts.run.watch;
  const concurrencyPolicy = watch.concurrencyPolicy ?? "forbid";
  const active = loadActiveWatchRuns(opts.runStoreRoot, watch.ownerAgentId)[watch.id];

  if (concurrencyPolicy === "forbid" && active) {
    const skipped = createSkippedWatchRunRecord({
      ownerAgentId: watch.ownerAgentId,
      localId: watch.localId,
      watchId: watch.id,
      runId: opts.run.runId,
      trigger: watch.trigger,
      actionKind: watch.action.kind,
      concurrencyPolicy,
      activeRun: active,
      nowMs: now(),
    });
    appendWatchRunRecord(opts.runStoreRoot, skipped);
    return skipped;
  }

  const startedAtMs = now();
  markWatchRunActive(opts.runStoreRoot, {
    ownerAgentId: watch.ownerAgentId,
    localId: watch.localId,
    watchId: watch.id,
    runId: opts.run.runId,
    startedAtMs,
  });

  try {
    const result = await runWatchAction({
      watch,
      run: opts.run,
      channelBus: opts.channelBus,
      runStoreRoot: opts.runStoreRoot,
      env: opts.env,
    });
    const finishedAtMs = now();
    const record = finishedRecord({
      watch,
      run: opts.run,
      startedAtMs,
      finishedAtMs,
      status: result.ok ? "success" : "failure",
      concurrencyPolicy,
      observation: result.observation,
      emittedMessages: result.emittedMessages,
      error: result.error,
    });
    appendWatchRunRecord(opts.runStoreRoot, record);
    return record;
  } catch (err) {
    const finishedAtMs = now();
    const error = err instanceof Error ? err.message : String(err);
    opts.logger?.error(`[watch] ${watch.id} failed:`, err);
    const record = finishedRecord({
      watch,
      run: opts.run,
      startedAtMs,
      finishedAtMs,
      status: "failure",
      concurrencyPolicy,
      observation: {
        kind: "failed",
        summary: error,
      },
      emittedMessages: [],
      error,
    });
    appendWatchRunRecord(opts.runStoreRoot, record);
    return record;
  } finally {
    clearWatchRunActive(
      opts.runStoreRoot,
      watch.ownerAgentId,
      watch.id,
      opts.run.runId,
    );
  }
}

function finishedRecord(input: {
  watch: ResolvedAgentWatchDefinition;
  run: WatchRunDue;
  startedAtMs: number;
  finishedAtMs: number;
  status: "success" | "failure";
  concurrencyPolicy: NonNullable<ResolvedAgentWatchDefinition["concurrencyPolicy"]>;
  observation: WatchRunObservation;
  emittedMessages: ChannelMessage[];
  error?: string;
}): WatchRunRecord {
  return {
    ownerAgentId: input.watch.ownerAgentId,
    localId: input.watch.localId,
    watchId: input.watch.id,
    runId: input.run.runId,
    trigger: input.watch.trigger,
    actionKind: input.watch.action.kind,
    startedAtMs: input.startedAtMs,
    startedAtIso: new Date(input.startedAtMs).toISOString(),
    finishedAtMs: input.finishedAtMs,
    finishedAtIso: new Date(input.finishedAtMs).toISOString(),
    status: input.status,
    attempts: 1,
    concurrencyPolicy: input.concurrencyPolicy,
    observation: input.observation,
    emittedChannelMessageIds: input.emittedMessages.map((message) => message.id),
    ...(input.error ? { error: input.error } : {}),
  };
}

async function runWatchAction(input: {
  watch: ResolvedAgentWatchDefinition;
  run: WatchRunDue;
  channelBus: ChannelBus;
  runStoreRoot: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  ok: boolean;
  observation: WatchRunObservation;
  emittedMessages: ChannelMessage[];
  error?: string;
}> {
  if (input.watch.action.kind === "message") {
    const message = publishWatchMessage(input.channelBus, {
      watch: input.watch,
      run: input.run,
      channel: input.watch.action.channel,
      text: input.watch.action.text,
      emit: input.watch.action,
    });
    return {
      ok: true,
      observation: {
        kind: "message",
        summary: `sent message to ${input.watch.action.channel}`,
      },
      emittedMessages: [message],
    };
  }

  const command = await runCommandWatchAction(input.watch.action, input.env);
  const previousHash = latestWatchOutputHash(
    input.runStoreRoot,
    input.watch.ownerAgentId,
    input.watch.id,
  );
  const summary = summarizeCommandResult(command);
  const changed = command.outputHash !== previousHash;
  const observation = commandObservation(command, previousHash);
  const emittedMessages = shouldEmitCommandResult(
    input.watch.emit,
    command,
    changed,
  )
    ? emitCommandResult(input, command, summary)
    : [];

  return {
    ok: command.ok,
    observation,
    emittedMessages,
    ...(command.error ? { error: command.error } : {}),
  };
}

function emitCommandResult(
  input: {
    watch: ResolvedAgentWatchDefinition;
    run: WatchRunDue;
    channelBus: ChannelBus;
  },
  command: CommandWatchResult,
  summary: string,
): ChannelMessage[] {
  const emit = input.watch.emit;
  if (!emit?.channel) return [];
  return [
    publishWatchMessage(input.channelBus, {
      watch: input.watch,
      run: input.run,
      channel: emit.channel,
      text: renderCommandEmitText({
        emit,
        watchId: input.watch.id,
        runId: input.run.runId,
        summary,
        result: command,
      }),
      emit,
    }),
  ];
}

function commandObservation(
  result: CommandWatchResult,
  previousHash: string | undefined,
): WatchRunObservation {
  if (!result.ok) {
    return {
      kind: "failed",
      summary: summarizeCommandResult(result),
      outputHash: result.outputHash,
      ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
      ...(result.stdout.trim() ? { stdoutPreview: clip(result.stdout) } : {}),
      ...(result.stderr.trim() ? { stderrPreview: clip(result.stderr) } : {}),
    };
  }

  const hasOutput = result.stdout.trim().length > 0 || result.stderr.trim().length > 0;
  if (!hasOutput) {
    return {
      kind: "no_output",
      summary: "command completed with no output",
      outputHash: result.outputHash,
    };
  }

  return {
    kind: previousHash === undefined
      ? "output"
      : result.outputHash === previousHash
        ? "unchanged"
        : "changed",
    summary: summarizeCommandResult(result),
    outputHash: result.outputHash,
    ...(result.stdout.trim() ? { stdoutPreview: clip(result.stdout) } : {}),
    ...(result.stderr.trim() ? { stderrPreview: clip(result.stderr) } : {}),
  };
}

function shouldEmitCommandResult(
  emit: WatchEmitConfig | undefined,
  result: CommandWatchResult,
  changed: boolean,
): boolean {
  const policy = emit?.policy ?? "never";
  if (policy === "never") return false;
  if (policy === "on_failure") return !result.ok;
  if (!result.ok) return false;
  if (policy === "always") return true;
  if (policy === "on_output") return result.stdout.trim().length > 0;
  if (policy === "on_change") return changed;
  return false;
}

function publishWatchMessage(
  channelBus: ChannelBus,
  input: {
    watch: ResolvedAgentWatchDefinition;
    run: WatchRunDue;
    channel: string;
    text: string;
    emit: {
      addressedAgentId?: string;
      senderKind?: "human" | "agent" | "system";
      senderActorId?: string;
      senderUserId?: string;
      senderDisplayName?: string;
    };
  },
): ChannelMessage {
  return channelBus.publish({
    channel: input.channel,
    sender: {
      kind: input.emit.senderKind ?? "system",
      actorId: input.emit.senderActorId ?? "system:watch-runner",
      ...(input.emit.senderUserId ? { userId: input.emit.senderUserId } : {}),
      ...(input.emit.senderDisplayName
        ? { displayName: input.emit.senderDisplayName }
        : {}),
    },
    origin: {
      transport: "watch",
      watchId: input.watch.id,
      runId: input.run.runId,
      sourceChannel: input.channel,
      addressedAgentId: input.emit.addressedAgentId,
      watch: watchProvenance(input.watch, input.channel),
    },
    content: textContent(input.text),
    timestamp: input.run.fireTimeMs,
  });
}

function watchProvenance(
  watch: ResolvedAgentWatchDefinition,
  targetChannel: string,
): MessageWatchProvenance {
  return {
    kind: "recurring",
    ownerAgentId: watch.ownerAgentId,
    localId: watch.localId,
    targetChannel,
    trigger: watchTriggerMetadata(watch.trigger, watch.timezone),
    actionKind: watch.action.kind,
    inspect: [
      `shrimpy watches show ${watch.id}`,
      `shrimpy watches history ${watch.id}`,
    ],
  };
}
