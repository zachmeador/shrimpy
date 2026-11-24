import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import { createRegistry, type Extension, Harness } from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import type { StoreFormat } from "../../lib/migration/node.ts";
import { homePaths } from "../home/index.ts";
import { shellWithShrimpy } from "./launcher.ts";
import { takeOwnerLock } from "./owner-lock.ts";
import { AGENT_STORAGE, prepareStorage, type StorageVersion } from "./storage.ts";

export interface HostOptions {
  home: string;
  /** The model runtime, with its providers and credentials already set up. */
  models: Models;
  /**
   * The program and arguments that run Shrimpy, such as node and the path of the
   * command's entry point. With it, the agent's shell finds `shrimpy` and runs that,
   * and an agent its gateway turns away for its release runs `shrimpy update` with it.
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

/**
 * Take ownership of a home and open its storage and engine, with the stock
 * coding tools installed. Before Pi opens the storage, storage at an older
 * version of `storage` is copied aside, and storage that a newer release wrote,
 * or that was written before the move to Pi 1.5.2, is refused. `storage` is
 * this release's format, unless a test gives the next release's.
 */
export async function openHost(options: HostOptions, storage: StoreFormat<StorageVersion> = AGENT_STORAGE): Promise<Host> {
  const { home } = options;
  const { database } = homePaths(home);
  const lock = takeOwnerLock(home);
  try {
    prepareStorage(database, storage);
    const shell = options.shrimpy === undefined ? undefined : shellWithShrimpy(home, options.shrimpy);
    const registry = createRegistry();
    registry.install(CodingTools);
    const harness = await Harness.open(
      await openNodeSqliteStorage(database),
      {
        models: options.models,
        registry,
        // Messages that queued up while a session was busy are picked up together, so they get one answer. So are the
        // ones that join a turn that is running: a second mention in the same step is read at the same next step. The
        // inputs waiting behind a turn that fails are taken back, as a stop does, and nothing runs them by themselves.
        settings: { followUpMode: "all", steeringMode: "all", afterFailedRun: "withdraw" },
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
  console.error(error);
}
