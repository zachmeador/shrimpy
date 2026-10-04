import type { Transports } from "../../contracts/gateway/index.ts";
import { localTransports } from "../../contracts/gateway/node.ts";
import { type ConsoleTerminal, startDrawing } from "./draw/index.ts";
import { farewellLine } from "./screen/index.ts";
import { createConsoleState } from "./state/index.ts";

/** Where the console says what it has to say once it is left, and hears that it is asked to stop. */
export interface ConsoleIo {
  /** Print a line to standard output. */
  out(line: string): void;
  /** Call `listener` each time the process is asked to stop. Returns a function that stops listening. */
  onStop(listener: () => void): () => void;
}

export interface ConsoleOptions {
  io: ConsoleIo;
  /** How to reach the gateway, and the programs registered with it by their names. This machine's sockets by default. */
  transports?: Transports;
  /** The terminal to draw on. The person's by default. */
  terminal?: ConsoleTerminal;
  /** How often what has no subscription is asked for again, in milliseconds. 2 seconds by default. */
  pollMs?: number;
  /** How long a notice stays, in milliseconds. */
  noticeMs?: number;
  /** How long after Ctrl+C another press still quits, in milliseconds. */
  quitWindowMs?: number;
  /** The moment it is, for saying when things happened. */
  now?: () => number;
}

/**
 * Open the console on the person's terminal, and keep it open until they leave.
 * It finds the chat server and the agents through the gateway, and reaches them
 * over the transports it is handed. Leaving lets go of every connection and
 * stops no work; if an agent is still working, one line says so and how to stop
 * it. The result is the exit code.
 */
export async function openConsole(options: ConsoleOptions): Promise<number> {
  const state = createConsoleState({
    transports: options.transports ?? localTransports(),
    pollMs: options.pollMs,
    noticeMs: options.noticeMs,
  });
  try {
    const drawing = startDrawing({
      state,
      terminal: options.terminal,
      now: options.now,
      quitWindowMs: options.quitWindowMs,
    });
    const stopListening = options.io.onStop(() => drawing.leave());
    try {
      await drawing.left;
    } finally {
      stopListening();
      await drawing.stop();
    }
    const working = await state.farewell();
    if (working !== undefined) options.io.out(farewellLine(working.agent, working.thread));
    return 0;
  } finally {
    await state.close();
  }
}
