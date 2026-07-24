#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { loadConfigForWorkspace } from "../config/load.js";
import {
  finalizeWorkerTurn,
  readWorkerRecord,
  workerTurnArtifacts,
} from "./lifecycle.js";
import { runWorkerTurn } from "./runner.js";

interface SupervisorArgs {
  workspace: string;
  workerId: string;
  turnId: string;
}

export async function runWorkerSupervisor(args: SupervisorArgs): Promise<void> {
  const config = loadConfigForWorkspace(args.workspace);
  const worker = readWorkerRecord(config, args.workerId);
  const turn = worker.turns.find((candidate) => candidate.id === args.turnId);
  if (!turn) throw new Error(`unknown worker turn: ${args.workerId}/${args.turnId}`);
  const artifacts = workerTurnArtifacts(config, worker.id, turn.id);
  const result = await runWorkerTurn({
    config,
    workerId: worker.id,
    turnId: turn.id,
    ownerAgent: worker.ownerAgent,
    backend: worker.backend,
    cwd: worker.cwd,
    prompt: turn.prompt,
    timeoutMs: turn.timeoutMs,
    backendSessionId: worker.backendSessionId,
    logPath: artifacts.logPath,
    outputPath: artifacts.outputPath,
    errorPath: artifacts.errorPath,
  });
  finalizeWorkerTurn(config, worker.id, turn.id, result);
  if (result.timedOut) {
    process.exit(124);
  }
}

function parseArgs(argv: string[]): SupervisorArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    values.set(arg.slice(2), value);
    index += 1;
  }
  const workspace = values.get("workspace");
  const workerId = values.get("worker");
  const turnId = values.get("turn");
  if (!workspace || !workerId || !turnId) {
    throw new Error("usage: worker-supervisor --workspace <path> --worker <id> --turn <id>");
  }
  return { workspace, workerId, turnId };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runWorkerSupervisor(parseArgs(process.argv.slice(2))).catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
