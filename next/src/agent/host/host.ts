import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
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
import { takeOwnerLock } from "./owner-lock.ts";

export interface HostOptions {
  home: string;
  /** The model runtime, with its providers and credentials already set up. */
  models: Models;
  /** The model the main session starts with. */
  model: ModelRef;
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
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

export async function openHost(options: HostOptions): Promise<Host> {
  const { home } = options;
  const lock = takeOwnerLock(home);
  try {
    mkdirSync(join(home, "state"), { recursive: true });
    const registry = createRegistry();
    registry.install(CodingTools);
    const harness = await Harness.open(
      await openNodeSqliteStorage(join(home, "state", "agent.sqlite")),
      {
        models: options.models,
        registry,
        env: () => new NodeExecutionEnv({ cwd: home }),
        onReport: options.onReport ?? reportToStderr,
      },
      context,
    );
    const main = await harness.root(context, {
      agent: { model: options.model, cwd: home, instructions: options.instructions },
    });
    harness.resume();
    return {
      home,
      harness,
      main,
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
