import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import { createRegistry, defineExtension, type Extension, Harness } from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createEditTool, createReadTool, createWriteTool } from "@earendil-works/pi-durable/tools";
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
   * and the agent follows its gateway to a newer release by running `shrimpy update` with it.
   */
  shrimpy?: readonly string[];
  /** Non-fatal failures the engine reports while it works. */
  onReport?: (error: unknown) => void;
}

/** The one process that owns a home: its lock, its storage and its engine. */
export interface Host {
  readonly home: string;
  readonly harness: Harness;
  /** Environment additions for shell commands (such as PATH with the `shrimpy` launcher). */
  readonly shellEnv: NodeJS.ProcessEnv | undefined;
  /**
   * Install extensions in the engine's registry, after the ones it has, in
   * order; every session uses all of them. Nothing runs until `resume()`.
   */
  install(...extensions: readonly Extension[]): void;
  /** Continue the work a last run left unfinished, and let new work run. Call it once the sessions follow the home. */
  resume(): void;
  /** Wait until no session has work running, or until `signal` aborts. */
  settle(signal: AbortSignal): Promise<void>;
  /** Pause whatever is running, in a way the next start resumes, and release the home. */
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

/** Pi's stock file tools (`read`, `write`, `edit`), without Pi's built-in `bash` which Shrimpy replaces. */
const FileTools = defineExtension({
  name: "file-tools",
  tools: [createReadTool(), createWriteTool(), createEditTool()],
});

/**
 * Take ownership of a home and open its storage and engine, with Pi's file
 * tools (`read`, `write`, `edit`) installed.
 */
export async function openHost(options: HostOptions, storage: StoreFormat<StorageVersion> = AGENT_STORAGE): Promise<Host> {
  const { home } = options;
  const { database } = homePaths(home);
  const lock = takeOwnerLock(home);
  try {
    prepareStorage(database, storage);
    const shell = options.shrimpy === undefined ? undefined : shellWithShrimpy(home, options.shrimpy);
    const registry = createRegistry();
    registry.install(FileTools);
    const harness = await Harness.open(
      await openNodeSqliteStorage(database),
      {
        models: options.models,
        registry,
        settings: { followUpMode: "all", steeringMode: "all", afterFailedRun: "withdraw" },
        env: () => new NodeExecutionEnv({ cwd: home, shellEnv: shell }),
        onReport: options.onReport ?? reportToStderr,
      },
      context,
    );
    return {
      home,
      harness,
      shellEnv: shell,
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
