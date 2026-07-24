import { parseChannelName } from "../channels/names.js";
import { parsePositiveInt } from "../util/parse.js";
import { parseDurationMs } from "../util/time-format.js";
import type {
  WatchConcurrencyPolicy,
  WatchDefinition,
  WatchEmitPolicy,
} from "./schema.js";

export function buildWatchDefinition(
  id: string,
  values: Record<string, unknown>,
): WatchDefinition {
  const trigger = buildTrigger(values);
  const action = buildAction(values);
  const emit = buildEmit(values);
  const concurrencyPolicy = buildConcurrencyPolicy(values);
  return {
    id,
    ...(typeof values.name === "string" ? { name: values.name } : {}),
    ...(values.disabled === true ? { enabled: false } : {}),
    trigger,
    action,
    ...(emit ? { emit } : {}),
    ...(concurrencyPolicy ? { concurrencyPolicy } : {}),
  };
}

function buildTrigger(values: Record<string, unknown>): WatchDefinition["trigger"] {
  const cron = stringValue(values.cron);
  const every = stringValue(values.every);
  const everyMs = stringValue(values["every-ms"]);
  const count = [cron, every, everyMs].filter(Boolean).length;
  if (count !== 1) {
    throw new Error("provide exactly one of --cron, --every, or --every-ms");
  }

  if (cron) {
    return {
      kind: "time",
      cron,
    };
  }

  const parsedEveryMs = every
    ? parseDurationMs(every)
    : parsePositiveInt(everyMs!, "--every-ms");
  return {
    kind: "time",
    everyMs: parsedEveryMs,
  };
}

function buildAction(values: Record<string, unknown>): WatchDefinition["action"] {
  const command = stringValue(values.command);
  const message = stringValue(values.message);
  const channel = stringValue(values.channel);
  if (command && message) {
    throw new Error("provide either --message or --command, not both");
  }

  if (command) {
    return {
      kind: "command",
      command,
      ...(typeof values.cwd === "string" ? { cwd: values.cwd } : {}),
      ...(typeof values["timeout-ms"] === "string"
        ? { timeoutMs: parsePositiveInt(values["timeout-ms"], "--timeout-ms") }
        : {}),
    };
  }

  if (!message) throw new Error("--message is required unless --command is provided");
  if (!channel) throw new Error("--channel is required for message watches");
  return {
    kind: "message",
    channel: parseChannelName(channel),
    text: message,
    ...(typeof values.addressed === "string"
      ? { addressedAgentId: values.addressed }
      : {}),
  };
}

function buildEmit(values: Record<string, unknown>): WatchDefinition["emit"] {
  const policy = stringValue(values["emit-policy"]);
  const channel = stringValue(values["emit-channel"]);
  const template = stringValue(values["emit-template"]);
  if (!policy && !channel && !template) return undefined;
  const emitPolicy = policy ?? "on_output";
  if (!isWatchEmitPolicy(emitPolicy)) {
    throw new Error("--emit-policy must be never, always, on_output, on_change, or on_failure");
  }
  return {
    policy: emitPolicy,
    ...(channel ? { channel: parseChannelName(channel) } : {}),
    ...(template ? { template } : {}),
  };
}

function buildConcurrencyPolicy(
  values: Record<string, unknown>,
): WatchConcurrencyPolicy | undefined {
  const policy = stringValue(values["concurrency-policy"]);
  if (!policy) return undefined;
  if (!isWatchConcurrencyPolicy(policy)) {
    throw new Error("--concurrency-policy must be forbid or allow");
  }
  return policy;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isWatchConcurrencyPolicy(value: string): value is WatchConcurrencyPolicy {
  return value === "forbid" || value === "allow";
}

function isWatchEmitPolicy(value: string): value is WatchEmitPolicy {
  return value === "never" ||
    value === "always" ||
    value === "on_output" ||
    value === "on_change" ||
    value === "on_failure";
}
