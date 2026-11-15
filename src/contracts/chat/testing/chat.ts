import type { TestContext } from "node:test";
import { type Child, type ChildOutput, startChild, tempDir, useRuntimeDir } from "../../../lib/testing/index.ts";
import { SHRIMPY_ENTRY } from "../../gateway/testing/index.ts";

/** The line the chat server prints when it begins listening. */
export interface ChatListening {
  event: string;
  dataDir: string;
  pid: number;
}

/** The real chat server, as the command starts it in a process of its own. */
export interface TestChat {
  /** Where its store is now. */
  readonly dataDir: string;
  /** What it printed when it last began listening. */
  readonly listening: ChatListening;
  /** What the process it last ran as has printed, and how it ended once it has. */
  output(): ChildOutput;
  /** Ask it to stop, as SIGTERM does unless another signal is given, and wait until it has ended. */
  stop(signal?: NodeJS.Signals): Promise<ChildOutput>;
  /** Kill it, like a chat server that went away. What was said stays in its data. */
  outage(): Promise<void>;
  /** Start it again, like a chat server that came back, on the same data unless `dataDir` says otherwise. */
  recover(options?: { dataDir?: string }): Promise<void>;
  /** Stop it without ending it, like a chat server that went dead: it takes what is sent and answers nothing. */
  freeze(): void;
  /** Let a chat server that was frozen run again. */
  thaw(): void;
}

/**
 * The real chat server, started through the command in a process of its own,
 * in the test's runtime directory, with a data directory of its own unless the
 * test gives one. It links to the test's gateway whenever there is one. It is
 * killed when the test ends if it is still running.
 */
export async function startTestChat(t: TestContext, options: { dataDir?: string } = {}): Promise<TestChat> {
  useRuntimeDir(t);
  let dataDir = options.dataDir ?? tempDir(t, "chat-data");
  let last: Child<ChatListening>;
  let running: Child<ChatListening> | undefined;
  const launch = async (): Promise<void> => {
    last = await startChild<ChatListening>(t, { file: SHRIMPY_ENTRY, args: ["chat", "serve", dataDir] });
    running = last;
  };
  const stop = async (signal: NodeJS.Signals = "SIGTERM"): Promise<ChildOutput> => {
    const stopping = running;
    running = undefined;
    return stopping === undefined ? last.output() : stopping.kill(signal);
  };
  await launch();
  return {
    get dataDir() {
      return dataDir;
    },
    get listening() {
      return last.line;
    },
    output: () => last.output(),
    stop,
    async outage() {
      await stop("SIGKILL");
    },
    async recover(given = {}) {
      if (running !== undefined) throw new Error("The chat server is running.");
      dataDir = given.dataDir ?? dataDir;
      await launch();
    },
    freeze() {
      if (running !== undefined) process.kill(running.pid, "SIGSTOP");
    },
    thaw() {
      if (running !== undefined) process.kill(running.pid, "SIGCONT");
    },
  };
}
