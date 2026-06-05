import { existsSync, readFileSync } from "node:fs";
import { createAppRuntime } from "../app/index.js";
import { timeSince } from "../channels/format.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
  parseWatchDefinitions,
  inspectWatch,
  inspectWatchHistory,
  inspectWatches,
  runWatchNow,
  watchTriggerMetadata,
  type WatchDefinition,
  type WatchConcurrencyPolicy,
  type WatchInspection,
  type WatchRunRecord,
  type WatchWakeExpectation,
  type WatchEmitPolicy,
} from "../watches/index.js";
import { writeJsonFileAtomic } from "../util/json-file.js";
import {
  formatFutureOrPast,
  parseDurationMs,
} from "../util/time-format.js";
import {
  parseCommandArgs,
  requireArg,
  usage as printUsage,
  type CommandHandler,
} from "./framework.js";
import { renderGroupUsage } from "./catalog.js";

const USAGE = renderGroupUsage("watches");

export const cmdWatches: CommandHandler = async (argv, config) => {
  const action = argv[0];
  if (!action || action.startsWith("-")) {
    return cmdWatchesList(argv, config, USAGE);
  }
  if (action === "list") {
    return cmdWatchesList(argv.slice(1), config, USAGE);
  }
  if (action === "show") {
    return cmdWatchesShow(argv.slice(1), config, USAGE);
  }
  if (action === "add") {
    return cmdWatchesAdd(argv.slice(1), config, USAGE);
  }
  if (action === "history") {
    return cmdWatchesHistory(argv.slice(1), config, USAGE);
  }
  if (action === "run") {
    return cmdWatchesRun(argv.slice(1), config, USAGE);
  }
  printUsage(USAGE, `unknown subcommand: ${action}`);
};

async function cmdWatchesList(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string" },
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage,
  });
  const runtime = createAppRuntime(config);
  const watches = inspectWatches(runtime, {
    agentId: values.agent,
  });

  if (values.json) {
    console.log(JSON.stringify({ watches: watches.map(publicWatchInspection) }, null, 2));
    return 0;
  }

  printWatchList(watches);
  return 0;
}

async function cmdWatchesShow(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const watchId = requireArg(positionals[0], usage, "watch id");
  const runtime = createAppRuntime(config);
  const watch = inspectWatch(runtime, watchId);

  if (values.json) {
    console.log(JSON.stringify(publicWatchInspection(watch), null, 2));
    return 0;
  }

  printWatchDetail(watch);
  return 0;
}

async function cmdWatchesAdd(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string" },
      name: { type: "string" },
      cron: { type: "string" },
      every: { type: "string" },
      "every-ms": { type: "string" },
      channel: { type: "string" },
      message: { type: "string" },
      addressed: { type: "string" },
      command: { type: "string" },
      cwd: { type: "string" },
      "timeout-ms": { type: "string" },
      "emit-policy": { type: "string" },
      "emit-channel": { type: "string" },
      "emit-template": { type: "string" },
      "concurrency-policy": { type: "string" },
      disabled: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const localId = requireArg(positionals[0], usage, "watch id");
  assertCliStructuralString(localId, "watch id");
  if (typeof values.agent === "string") {
    assertCliStructuralString(values.agent, "--agent");
  }
  if (localId.includes("/")) {
    throw new Error("watch id must be local to the agent and must not contain '/'");
  }

  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(values.agent);
  const path = runtime.getAgentPaths(agent.id).watchesPath;
  const watches = loadAgentWatchFile(path);
  if (watches.some((watch) => watch.id === localId)) {
    throw new Error(`watch already exists: ${agent.id}/${localId}`);
  }

  const watch = buildWatchFromAddArgs(localId, values);
  const next = [...watches, watch];
  parseWatchDefinitions(next);
  writeJsonFileAtomic(path, next);

  const created = inspectWatch(createAppRuntime(config), `${agent.id}/${localId}`);
  if (values.json) {
    console.log(JSON.stringify(publicWatchInspection(created), null, 2));
    return 0;
  }

  console.log(`watch added: ${created.id}`);
  console.log(`source: ${created.source.path}`);
  console.log(`trigger: ${created.triggerText}`);
  console.log(`action: ${created.actionKind}`);
  console.log(`target_channels: ${created.targetChannels.join(",") || "(none)"}`);
  for (const diagnostic of created.diagnostics) {
    console.log(`warning: ${diagnostic}`);
  }
  return 0;
}

async function cmdWatchesHistory(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      limit: { type: "string", default: "20" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const watchId = requireArg(positionals[0], usage, "watch id");
  const limit = parsePositiveInteger(String(values.limit), "--limit");
  const runtime = createAppRuntime(config);
  const runs = inspectWatchHistory(runtime, watchId, {
    limit,
  });

  if (values.json) {
    console.log(JSON.stringify({ watchId, runs }, null, 2));
    return 0;
  }

  printWatchHistory(runs);
  return 0;
}

async function cmdWatchesRun(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const watchId = requireArg(positionals[0], usage, "watch id");
  const runtime = createAppRuntime(config);
  const record = await runWatchNow(runtime, watchId);

  if (values.json) {
    console.log(JSON.stringify(record, null, 2));
    return 0;
  }

  console.log(`watch run: ${record.watchId}`);
  console.log(`run_id: ${record.runId}`);
  console.log(`status: ${record.status}`);
  console.log(`observation: ${record.observation.summary}`);
  if (record.emittedChannelMessageIds.length > 0) {
    console.log(`emitted_messages: ${record.emittedChannelMessageIds.join(",")}`);
  }
  return 0;
}

function printWatchList(watches: WatchInspection[]): void {
  if (watches.length === 0) {
    console.log("(no watches)");
    return;
  }

  for (const watch of watches) {
    const status = watch.enabled ? "enabled" : "disabled";
    const targets = watch.targetChannels.join(",") || "(none)";
    const next = watch.nextRunAtMs === undefined
      ? "next=unknown"
      : `next=${formatFutureOrPast(watch.nextRunAtMs)}`;
    const last = watch.lastRun
      ? `last=${timeSince(watch.lastRun.finishedAtMs)}`
      : "last=none";
    const issues = watch.diagnostics.length > 0
      ? ` diagnostics=${watch.diagnostics.length}`
      : "";
    console.log(
      `${watch.id}  ${status}  ${watch.triggerText}  action=${watch.actionKind}  target=${targets}  ${next}  ${last}${issues}`,
    );
  }
}

function publicWatchInspection(watch: WatchInspection): Omit<WatchInspection, "watch"> & {
  trigger: Record<string, unknown>;
} {
  const { watch: resolved, ...publicFields } = watch;
  return {
    ...publicFields,
    trigger: watchTriggerMetadata(resolved.trigger, resolved.timezone),
  };
}

function printWatchDetail(watch: WatchInspection): void {
  console.log(`watch: ${watch.id}`);
  if (watch.name) console.log(`name: ${watch.name}`);
  console.log(`source: ${watch.source.kind} ${watch.source.path}`);
  console.log(`owner_agent: ${watch.ownerAgentId}`);
  console.log(`local_id: ${watch.localId}`);
  console.log(`enabled: ${watch.enabled}`);
  console.log(`trigger: ${watch.triggerText}`);
  console.log(`concurrency: ${watch.concurrencyPolicy}`);
  console.log(`action: ${watch.actionKind}`);
  console.log(`emit_policy: ${watch.emitPolicy}`);
  console.log(`target_channels: ${watch.targetChannels.join(",") || "(none)"}`);
  console.log("expected_wake:");
  if (watch.expectedWake.length === 0) {
    console.log("- (none)");
  } else {
    for (const agent of watch.expectedWake) {
      console.log(`- ${formatWakeExpectation(agent)}`);
    }
  }
  console.log(
    `next_run: ${watch.nextRunAtMs === undefined
      ? "(unknown)"
      : `${new Date(watch.nextRunAtMs).toISOString()} (${formatFutureOrPast(watch.nextRunAtMs)})`}`,
  );
  console.log(
    `active_run: ${watch.activeRun
      ? `${watch.activeRun.runId} since ${watch.activeRun.startedAtIso}`
      : "(none)"}`,
  );
  console.log(
    `last_run: ${watch.lastRun
      ? `${watch.lastRun.finishedAtIso} ${watch.lastRun.status} ${watch.lastRun.runId}`
      : "(none)"}`,
  );
  console.log("inspect:");
  console.log(`- ${watch.inspectCommands.watch}`);
  console.log(`- ${watch.inspectCommands.history}`);
  console.log(`- ${watch.inspectCommands.run}`);
  for (const command of watch.inspectCommands.channels) {
    console.log(`- ${command}`);
  }
  for (const command of watch.inspectCommands.wake) {
    console.log(`- ${command}`);
  }
  if (watch.diagnostics.length > 0) {
    console.log("diagnostics:");
    for (const diagnostic of watch.diagnostics) {
      console.log(`- ${diagnostic}`);
    }
  }
}

function printWatchHistory(runs: WatchRunRecord[]): void {
  if (runs.length === 0) {
    console.log("(no watch runs)");
    return;
  }
  for (const run of runs) {
    const emitted = run.emittedChannelMessageIds.length > 0
      ? ` emitted=${run.emittedChannelMessageIds.join(",")}`
      : "";
    console.log(
      `${run.finishedAtIso}  ${run.status}  ${run.watchId}  run=${run.runId}  ${run.observation.summary}${emitted}`,
    );
  }
}

function formatWakeExpectation(
  expectation: WatchWakeExpectation,
): string {
  const status = expectation.action === "wake" ? "wakes" : "ignores";
  const member = expectation.member ? "member" : "not-member";
  return `${expectation.agentId}: ${status} in ${expectation.channel} (${member}) ${expectation.reason} policy_owner=${expectation.policyOwner} session=${expectation.sessionPath}`;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function loadAgentWatchFile(path: string): WatchDefinition[] {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  parseWatchDefinitions(raw);
  return raw as WatchDefinition[];
}

function buildWatchFromAddArgs(
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
    : parsePositiveInteger(everyMs!, "--every-ms");
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
        ? { timeoutMs: parsePositiveInteger(values["timeout-ms"], "--timeout-ms") }
        : {}),
    };
  }

  if (!message) throw new Error("--message is required unless --command is provided");
  if (!channel) throw new Error("--channel is required for message watches");
  return {
    kind: "message",
    channel,
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
    ...(channel ? { channel } : {}),
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

const STRUCTURAL_INVISIBLE_PATTERN = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/;

function assertCliStructuralString(value: string, label: string): void {
  if (STRUCTURAL_INVISIBLE_PATTERN.test(value)) {
    throw new Error(`${label} must not contain control or invisible characters`);
  }
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
