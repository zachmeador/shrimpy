import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import { createRegistry, type Extension, Harness } from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { homePaths } from "../home/index.ts";
import { shellWithShrimpy } from "./launcher.ts";
import { takeOwnerLock } from "./owner-lock.ts";

export interface HostOptions {
  home: string;
  /** The model runtime, with its providers and credentials already set up. */
  models: Models;
  /**
   * The program and arguments that run Shrimpy, such as node and the path of the
   * command's entry point. With it, the agent's shell finds `shrimpy` and runs that.
   */
  shrimpy?: readonly string[];
  /** Non-fatal failures the engine reports while it works. */
  onReport?: (error: unknown) => void;
}

/** The one process that owns a home: its lock, its storage and its engine. */
export interface Host {
  readonly home: string;
  readonly harness: Harness;
  /**
   * Install extensions in the engine's registry, after the ones it has, in
   * order; every session uses all of them. Nothing runs until `resume()`, so
   * an extension can be made from what the opened storage says before it is
   * installed, and work that needs one waits for it.
   */
  install(...extensions: readonly Extension[]): void;
  /** Continue the work a last run left unfinished, and let new work run. Call it once the sessions follow the home. */
  resume(): void;
  /**
   * Wait until no session has work running, or until `signal` aborts. Work
   * still running then is left for `close()` to pause.
   */
  settle(signal: AbortSignal): Promise<void>;
  /** Pause whatever is running, in a way the next start resumes, and release the home. */
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

/** Take ownership of a home and open its storage and engine, with the stock coding tools installed. */
export async function openHost(options: HostOptions): Promise<Host> {
  const { home } = options;
  const { database } = homePaths(home);
  const lock = takeOwnerLock(home);
  try {
    mkdirSync(dirname(database), { recursive: true });
    const shell = options.shrimpy === undefined ? undefined : shellWithShrimpy(home, options.shrimpy);
    const registry = createRegistry();
    registry.install(CodingTools);
    const harness = await Harness.open(
      await openNodeSqliteStorage(database),
      {
        models: options.models,
        registry,
        // Messages that queued up while a session was busy are picked up together, so they get one answer. So are the
        // ones that join a turn that is running: a second mention in the same step is read at the same next step.
        settings: { followUpMode: "all", steeringMode: "all" },
        env: () => new NodeExecutionEnv({ cwd: home, shellEnv: shell }),
        onReport: options.onReport ?? reportToStderr,
      },
      context,
    );
    return {
      home,
      harness,
      install(...extensions) {
        for (const extension of extensions) registry.install(extension);
      },
      resume: () => harness.resume(),
      async settle(signal) {
        try {
          await harness.waitForIdle(withAbortSignal(signal, context));
        } catch (error) {
          if (!signal.aborted) throw error;
        }
      },
      async close() {
        await harness.close(context);
        lock.release();
      },
    };
  } catch (error) {
    lock.release();
    throw error;
  }
}

function reportToStderr(error: unknown): void {
  console.error("[agent]", error);
}
