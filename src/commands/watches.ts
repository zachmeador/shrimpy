import { existsSync, readFileSync } from "node:fs";
import { createAppRuntime } from "../app/runtime.js";
import { timeSince } from "../channels/format.js";
import type { ShrimpyConfig } from "../config/load.js";
import { parseWatchDefinitions, assertNoStructuralInvisibleCharacters, watchTriggerMetadata, type WatchDefinition } from "../watches/schema.js";
import { buildWatchDefinition } from "../watches/build.js";
import { inspectWatch, inspectWatchHistory, inspectWatches, runWatchNow, type WatchInspection, type WatchWakeExpectation } from "../watches/inspection.js";
import type { WatchRunRecord } from "../watches/runs.js";
import { writeJsonFileAtomic } from "../util/json-file.js";
import { parsePositiveInt } from "../util/parse.js";
import {
  formatFutureOrPast,
} from "../util/time-format.js";
import {
  createCommandGroup,
  parseCommandArgs,
  requireArg,
  type CommandHandler,
} from "./framework.js";
import { renderGroupUsage } from "./catalog.js";

const USAGE = renderGroupUsage("watches");

export const cmdWatches: CommandHandler = createCommandGroup({
  name: "watches",
  usage: USAGE,
  default: ({ argv, config, usage }) => cmdWatchesList(argv, config, usage),
  commands: {
    list: ({ argv, config, usage }) => cmdWatchesList(argv, config, usage),
    show: ({ argv, config, usage }) => cmdWatchesShow(argv, config, usage),
    add: ({ argv, config, usage }) => cmdWatchesAdd(argv, config, usage),
    enable: ({ argv, config, usage }) => cmdWatchesSetEnabled(argv, config, usage, true),
    disable: ({ argv, config, usage }) => cmdWatchesSetEnabled(argv, config, usage, false),
    history: ({ argv, config, usage }) => cmdWatchesHistory(argv, config, usage),
    run: ({ argv, config, usage }) => cmdWatchesRun(argv, config, usage),
  },
});

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
  assertNoStructuralInvisibleCharacters(localId, "watch id");
  if (typeof values.agent === "string") {
    assertNoStructuralInvisibleCharacters(values.agent, "--agent");
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

  const watch = buildWatchDefinition(localId, values);
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

async function cmdWatchesSetEnabled(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
  enabled: boolean,
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
  const watches = loadAgentWatchFile(watch.source.path);
  const index = watches.findIndex((candidate) => candidate.id === watch.localId);
  if (index < 0) throw new Error(`watch not found in source file: ${watch.id}`);

  watches[index] = {
    ...watches[index],
    enabled,
  };
  parseWatchDefinitions(watches);
  writeJsonFileAtomic(watch.source.path, watches);

  const updated = inspectWatch(createAppRuntime(config), watch.id);
  if (values.json) {
    console.log(JSON.stringify(publicWatchInspection(updated), null, 2));
    return 0;
  }

  console.log(`watch ${enabled ? "enabled" : "disabled"}: ${updated.id}`);
  console.log(`source: ${updated.source.path}`);
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
  const limit = parsePositiveInt(String(values.limit), "--limit");
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

function loadAgentWatchFile(path: string): WatchDefinition[] {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  parseWatchDefinitions(raw);
  return raw as WatchDefinition[];
}
