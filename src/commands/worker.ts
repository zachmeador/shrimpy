import { existsSync, readFileSync } from "node:fs";
import { amendWorker, cancelWorker, closeWorker, listWorkerRecords, readWorkerRecord, startWorker, waitForWorker } from "../workers/lifecycle.js";
import { readWorkerBackendAvailability, refreshWorkerBackendAvailability, type WorkerBackendAvailabilityState } from "../workers/availability.js";
import type { WorkerBackendKind, WorkerRecord, WorkerTurn } from "../workers/types.js";
import { accent, dim, label } from "../util/style.js";
import {
  createCommandGroup,
  parseCommandArgs,
  requireArg,
  usage,
  type CommandHandler,
} from "./framework.js";
import { renderGroupUsage, renderCommandUsage } from "./catalog.js";

const USAGE = renderGroupUsage("worker");

export const cmdWorker: CommandHandler = createCommandGroup({
  name: "worker",
  usage: USAGE,
  commands: {
    backends: ({ argv, config }) => {
      const refreshSubcommand = argv[0] === "refresh";
      const parseArgv = refreshSubcommand ? argv.slice(1) : argv;
      const { values } = parseCommandArgs({
        args: parseArgv,
        options: {
          refresh: { type: "boolean" },
          json: { type: "boolean" },
        },
        allowPositionals: false,
        strict: true,
        usage: renderCommandUsage(refreshSubcommand
          ? ["worker", "backends", "refresh"]
          : ["worker", "backends"]),
      });
      const state = refreshSubcommand || values.refresh
        ? refreshWorkerBackendAvailability(config.workspace)
        : readWorkerBackendAvailability(config.workspace);
      printBackendAvailability(state, Boolean(values.json));
      return 0;
    },
    start: async ({ argv, config }) => {
      const { values, positionals } = parseCommandArgs({
        args: argv,
        options: {
          agent: { type: "string", short: "a" },
          backend: { type: "string" },
          cwd: { type: "string" },
          goal: { type: "string" },
          "timeout-ms": { type: "string" },
          channel: { type: "string" },
          "parent-session": { type: "string" },
          "parent-kind": { type: "string" },
          json: { type: "boolean" },
        },
        allowPositionals: true,
        strict: true,
        usage: renderCommandUsage(["worker", "start"]),
      });
      const spec = positionals.join(" ").trim();
      if (!spec) usage(renderCommandUsage(["worker", "start"]), "spec required");
      const worker = await startWorker({
        config,
        ownerAgent: values.agent,
        backend: parseBackend(values.backend),
        cwd: values.cwd,
        goal: values.goal,
        spec,
        timeoutMs: parsePositiveInteger(values["timeout-ms"], renderCommandUsage(["worker", "start"]), "--timeout-ms"),
        parentSession: values["parent-session"],
        parentKind: values["parent-kind"],
        relatedChannel: values.channel,
      });
      printWorker(worker, Boolean(values.json), "summary");
      return 0;
    },
    list: ({ argv, config }) => {
      const { values } = parseCommandArgs({
        args: argv,
        options: {
          json: { type: "boolean" },
          all: { type: "boolean" },
        },
        allowPositionals: false,
        strict: true,
        usage: renderCommandUsage(["worker", "list"]),
      });
      const workers = listWorkerRecords(config)
        .filter((worker) => values.all || worker.status !== "closed");
      if (values.json) {
        console.log(JSON.stringify(workers, null, 2));
      } else {
        printWorkerList(workers);
      }
      return 0;
    },
    status: ({ argv, config }) => {
      const { values, positionals } = parseCommandArgs({
        args: argv,
        options: { json: { type: "boolean" } },
        allowPositionals: true,
        strict: true,
        usage: renderCommandUsage(["worker", "status"]),
      });
      const id = requireArg(positionals[0], renderCommandUsage(["worker", "status"]), "worker id");
      printWorker(readWorkerRecord(config, id), Boolean(values.json), "status");
      return 0;
    },
    read: ({ argv, config }) => {
      const { values, positionals } = parseCommandArgs({
        args: argv,
        options: { json: { type: "boolean" } },
        allowPositionals: true,
        strict: true,
        usage: renderCommandUsage(["worker", "read"]),
      });
      const id = requireArg(positionals[0], renderCommandUsage(["worker", "read"]), "worker id");
      printWorker(readWorkerRecord(config, id), Boolean(values.json), "read");
      return 0;
    },
    send: async ({ argv, config }) => {
      const { values, positionals } = parseCommandArgs({
        args: argv,
        options: {
          "timeout-ms": { type: "string" },
          json: { type: "boolean" },
        },
        allowPositionals: true,
        strict: true,
        usage: renderCommandUsage(["worker", "send"]),
      });
      const id = requireArg(positionals[0], renderCommandUsage(["worker", "send"]), "worker id");
      const prompt = positionals.slice(1).join(" ").trim();
      if (!prompt) usage(renderCommandUsage(["worker", "send"]), "prompt required");
      printWorker(await amendWorker({
        config,
        id,
        prompt,
        timeoutMs: parsePositiveInteger(values["timeout-ms"], renderCommandUsage(["worker", "send"]), "--timeout-ms"),
      }), Boolean(values.json), "summary");
      return 0;
    },
    tail: async ({ argv, config }) => {
      const { values, positionals } = parseCommandArgs({
        args: argv,
        options: {
          lines: { type: "string", short: "n" },
          follow: { type: "boolean", short: "f" },
        },
        allowPositionals: true,
        strict: true,
        usage: renderCommandUsage(["worker", "tail"]),
      });
      const id = requireArg(positionals[0], renderCommandUsage(["worker", "tail"]), "worker id");
      const lines = parsePositiveInteger(values.lines, renderCommandUsage(["worker", "tail"]), "--lines") ?? 40;
      await tailWorker(config, id, { lines, follow: Boolean(values.follow) });
      return 0;
    },
    wait: async ({ argv, config }) => {
      const { values, positionals } = parseCommandArgs({
        args: argv,
        options: {
          "timeout-ms": { type: "string" },
          json: { type: "boolean" },
        },
        allowPositionals: true,
        strict: true,
        usage: renderCommandUsage(["worker", "wait"]),
      });
      const id = requireArg(positionals[0], renderCommandUsage(["worker", "wait"]), "worker id");
      const worker = await waitForWorker(config, id, {
        timeoutMs: values["timeout-ms"] ? Number(values["timeout-ms"]) : undefined,
      });
      printWorker(worker, Boolean(values.json), "status");
      return worker.status === "running" ? 2 : 0;
    },
    cancel: ({ argv, config }) => {
      const { values, positionals } = parseCommandArgs({
        args: argv,
        options: { json: { type: "boolean" } },
        allowPositionals: true,
        strict: true,
        usage: renderCommandUsage(["worker", "cancel"]),
      });
      const id = requireArg(positionals[0], renderCommandUsage(["worker", "cancel"]), "worker id");
      printWorker(cancelWorker(config, id), Boolean(values.json), "status");
      return 0;
    },
    close: ({ argv, config }) => {
      const { values, positionals } = parseCommandArgs({
        args: argv,
        options: { json: { type: "boolean" } },
        allowPositionals: true,
        strict: true,
        usage: renderCommandUsage(["worker", "close"]),
      });
      const id = requireArg(positionals[0], renderCommandUsage(["worker", "close"]), "worker id");
      printWorker(closeWorker(config, id), Boolean(values.json), "status");
      return 0;
    },
  },
});

function parseBackend(value: string | undefined): WorkerBackendKind | undefined {
  if (!value) return undefined;
  if (value === "codex" || value === "claude" || value === "pi") return value;
  usage(renderCommandUsage(["worker", "start"]), `unknown backend: ${value}`);
}

function parsePositiveInteger(value: string | undefined, usageText: string, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    usage(usageText, `${optionName} must be a positive integer`);
  }
  return parsed;
}

async function tailWorker(
  config: Parameters<typeof readWorkerRecord>[0],
  id: string,
  opts: { lines: number; follow: boolean },
): Promise<void> {
  let worker = readWorkerRecord(config, id);
  let turn = worker.turns.at(-1);
  if (!turn?.logPath) return;
  let offset = 0;
  const initial = readTextIfExists(turn.logPath);
  if (initial) {
    const lines = initial.split(/\r?\n/u);
    const selected = lines.slice(Math.max(0, lines.length - opts.lines - 1)).join("\n").trimEnd();
    if (selected) console.log(selected);
    offset = initial.length;
  }
  if (!opts.follow) return;
  while (worker.status === "running") {
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    worker = readWorkerRecord(config, id);
    turn = worker.turns.at(-1);
    if (!turn?.logPath) return;
    const text = readTextIfExists(turn.logPath);
    if (text.length > offset) {
      process.stdout.write(text.slice(offset));
      offset = text.length;
    }
  }
}

function readTextIfExists(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function printWorkerList(workers: WorkerRecord[]): void {
  if (workers.length === 0) {
    console.log(dim("(no workers)"));
    return;
  }
  for (const worker of workers) {
    console.log(`${accent(worker.id)} ${worker.status.padEnd(9)} ${worker.backend.padEnd(6)} ${worker.goal}`);
  }
}

function printBackendAvailability(state: WorkerBackendAvailabilityState, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log(`${label("checked:")} ${state.checkedAt}`);
  for (const backend of ["codex", "claude", "pi"] as const) {
    const item = state.backends[backend];
    const status = item.available ? accent("available") : "missing";
    const version = item.version ? ` ${dim(item.version)}` : "";
    const problem = item.problem && !item.available ? ` ${dim(`(${item.problem})`)}` : "";
    console.log(`${backend.padEnd(6)} ${status} auth=${item.authStatus}${version}${problem}`);
  }
}

function printWorker(worker: WorkerRecord, json: boolean, mode: "summary" | "status" | "read"): void {
  if (json) {
    console.log(JSON.stringify(presentWorkerJson(worker), null, 2));
    return;
  }
  if (mode === "read") {
    console.log(worker.summary);
    console.log("");
    console.log(label("turns:"));
    for (const turn of worker.turns) {
      const detail = turn.error ?? turn.output ?? "";
      console.log(`- ${turn.id} ${turn.kind} ${turn.status}`);
      if (detail) console.log(indent(detail.trim(), "  "));
    }
    return;
  }
  console.log(`${label("worker:")} ${accent(worker.id)}`);
  console.log(`${label("status:")} ${worker.status}`);
  console.log(`${label("backend:")} ${worker.backend}`);
  console.log(`${label("agent:")} ${worker.ownerAgent}`);
  console.log(`${label("cwd:")} ${worker.cwd}`);
  console.log(`${label("goal:")} ${worker.goal}`);
  if (mode === "summary") {
    console.log("");
    console.log(worker.summary);
  }
}

function presentWorkerJson(worker: WorkerRecord): WorkerRecord & {
  latestTurn: WorkerTurn | null;
  artifactPaths: {
    logPath?: string;
    outputPath?: string;
    errorPath?: string;
  };
  commands: {
    status: string;
    read: string;
    tail: string;
    wait: string;
    cancel: string;
    close: string;
  };
} {
  const latestTurn = worker.turns.at(-1) ?? null;
  return {
    ...worker,
    latestTurn,
    artifactPaths: {
      ...(latestTurn?.logPath ? { logPath: latestTurn.logPath } : {}),
      ...(latestTurn?.outputPath ? { outputPath: latestTurn.outputPath } : {}),
      ...(latestTurn?.errorPath ? { errorPath: latestTurn.errorPath } : {}),
    },
    commands: {
      status: `shrimpy worker status ${worker.id} --json`,
      read: `shrimpy worker read ${worker.id}`,
      tail: `shrimpy worker tail ${worker.id} --follow`,
      wait: `shrimpy worker wait ${worker.id}`,
      cancel: `shrimpy worker cancel ${worker.id}`,
      close: `shrimpy worker close ${worker.id}`,
    },
  };
}

function indent(value: string, prefix: string): string {
  return value.split(/\r?\n/u).map((line) => `${prefix}${line}`).join("\n");
}
