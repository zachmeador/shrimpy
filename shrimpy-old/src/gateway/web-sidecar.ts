import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import type { Readable } from "node:stream";

export type WebSidecarStatus =
  | "disabled"
  | "starting"
  | "running"
  | "restarting"
  | "failed"
  | "stopped";

export interface WebSidecarHealth {
  enabled: boolean;
  status: WebSidecarStatus;
  url: string;
  port: number;
  pid?: number;
  restartCount: number;
  lastError?: string;
}

interface WebSidecarOptions {
  enabled: boolean;
  port: number;
  workspace: string;
  scriptPath: string;
}

interface WebSidecarDependencies {
  spawn: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}

const DEFAULT_DEPS: WebSidecarDependencies = {
  spawn: (command, args, options) => spawn(command, args, options),
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
};

export class WebSidecarManager {
  private child: ChildProcess | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private stopping = false;
  private restartCount = 0;
  private status: WebSidecarStatus;
  private lastError: string | undefined;

  constructor(
    private readonly options: WebSidecarOptions,
    private readonly dependencies: WebSidecarDependencies = DEFAULT_DEPS,
  ) {
    this.status = options.enabled ? "stopped" : "disabled";
  }

  start(): void {
    if (!this.options.enabled || this.child || this.restartTimer) return;
    this.stopping = false;
    this.spawnChild();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      this.dependencies.clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      await terminate(child);
    }
    this.status = this.options.enabled ? "stopped" : "disabled";
  }

  health(): WebSidecarHealth {
    return {
      enabled: this.options.enabled,
      status: this.status,
      url: `http://127.0.0.1:${this.options.port}`,
      port: this.options.port,
      ...(this.child?.pid ? { pid: this.child.pid } : {}),
      restartCount: this.restartCount,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  private spawnChild(): void {
    this.status = this.restartCount > 0 ? "restarting" : "starting";
    let child: ChildProcess;
    try {
      child = this.dependencies.spawn(
        process.execPath,
        [
          this.options.scriptPath,
          "--workspace",
          this.options.workspace,
          "--host",
          "127.0.0.1",
          "--port",
          String(this.options.port),
        ],
        { stdio: ["ignore", "pipe", "pipe"], env: process.env },
      );
    } catch (error) {
      this.recordFailure(error);
      return;
    }
    this.child = child;
    forwardOutput(child.stdout, "log");
    forwardOutput(child.stderr, "error");
    let settled = false;
    child.once("spawn", () => {
      if (this.child !== child || this.stopping) return;
      this.status = "running";
      this.lastError = undefined;
      console.log(
        `[gateway] web inspector available at http://127.0.0.1:${this.options.port}`,
      );
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      if (this.child === child) this.child = undefined;
      if (!this.stopping) this.recordFailure(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      if (this.child === child) this.child = undefined;
      if (this.stopping) return;
      this.recordFailure(
        new Error(`web inspector exited (${signal ?? `code ${code ?? 1}`})`),
      );
    });
  }

  private recordFailure(error: unknown): void {
    if (this.stopping) return;
    this.restartCount++;
    this.status = "failed";
    this.lastError = sanitizeError(error);
    const delay = Math.min(
      30_000,
      500 * (2 ** Math.min(this.restartCount - 1, 6)),
    );
    console.error(
      `[gateway] web inspector failed: ${this.lastError}; retrying in ${delay}ms`,
    );
    if (this.restartTimer) this.dependencies.clearTimeout(this.restartTimer);
    this.restartTimer = this.dependencies.setTimeout(() => {
      this.restartTimer = undefined;
      this.spawnChild();
    }, delay);
    this.restartTimer.unref();
  }
}

function forwardOutput(
  stream: Readable | null,
  level: "log" | "error",
): void {
  stream?.setEncoding("utf8");
  stream?.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line) console[level](`[web] ${line}`);
    }
  });
}

function sanitizeError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error))
    .replaceAll(/\s+/g, " ")
    .trim();
  return message.slice(0, 300) || "unknown error";
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      finish();
    }, 2_000);
    timer.unref();
    child.once("exit", finish);
    child.kill("SIGTERM");
  });
}
