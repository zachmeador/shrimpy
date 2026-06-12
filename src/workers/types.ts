import type { WorkerBackend } from "./availability.js";

export type WorkerBackendKind = WorkerBackend;
export type WorkerStatus = "running" | "complete" | "blocked" | "failed" | "cancelled" | "closed";

export interface WorkerParentLineage {
  session?: string;
  kind?: string;
}

export interface WorkerTurn {
  id: string;
  kind: "start" | "amendment";
  prompt: string;
  status: WorkerStatus;
  startedAt: string;
  timeoutMs?: number;
  finishedAt?: string;
  output?: string;
  error?: string;
  pid?: number;
  logPath?: string;
  outputPath?: string;
  errorPath?: string;
  exitCode?: number | null;
  signal?: string | null;
}

export interface WorkerRecord {
  id: string;
  ownerAgent: string;
  backend: WorkerBackendKind;
  cwd: string;
  goal: string;
  spec: string;
  parent: WorkerParentLineage;
  relatedChannel?: string;
  status: WorkerStatus;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  backendSessionId?: string;
  turns: WorkerTurn[];
  summary: string;
}

export interface WorkersState {
  version: 1;
  workers: WorkerRecord[];
}
