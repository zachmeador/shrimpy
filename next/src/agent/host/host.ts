import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  type Conversation,
  createRegistry,
  Harness,
  type ModelRef,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { homePaths } from "../home/index.ts";
import { takeOwnerLock } from "./owner-lock.ts";

export interface HostOptions {
  home: string;
  /** The model runtime, with its providers and credentials already set up. */
  models: Models;
  /** The model the main session uses. It is set again at every start. */
  model: ModelRef;
  /** The main session's base instructions. They are set again at every start. */
  instructions?: string;
  /** Non-fatal failures the engine reports while it works. */
  onReport?: (error: unknown) => void;
}

/** The one process that owns a home: its lock, its storage and its engine. */
export interface Host {
  readonly home: string;
  readonly harness: Harness;
  /** The session every agent has. */
  readonly main: Conversation;
  /** Wait until no session has work running, or until `signal` aborts. Work still running then is left for `close()` to pause. */
  settle(signal: AbortSignal): Promise<void>;
  /** Pause whatever is running, in a way the next start resumes, and release the home. */
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

export async function openHost(options: HostOptions): Promise<Host> {
  const { home } = options;
  const { database } = homePaths(home);
  const lock = takeOwnerLock(home);
  try {
    mkdirSync(dirname(database), { recursive: true });
    const registry = createRegistry();
    registry.install(CodingTools);
    const harness = await Harness.open(
      await openNodeSqliteStorage(database),
      {
        models: options.models,
        registry,
        env: () => new NodeExecutionEnv({ cwd: home }),
        onReport: options.onReport ?? reportToStderr,
      },
      context,
    );
    const main = await harness.root(context);
    // The root keeps the choices it was made with, so every start sets them again from the home.
    await main.configure(
      { model: options.model, cwd: home, instructions: options.instructions ?? null },
      context,
    );
    harness.resume();
    return {
      home,
      harness,
      main,
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
