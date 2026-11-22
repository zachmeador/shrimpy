import { gatewaySocket } from "../../contracts/gateway/node.ts";
import type { DialPlace } from "../../lib/link/node.ts";
import { dialAt } from "../network/node.ts";
import { createClientState, type HomeLookup } from "../state/index.ts";
import { farewellLine } from "../view/index.ts";
import { type ConsoleTerminal, type Screen, startDrawing } from "./draw/index.ts";

/** Where the console says what it has to say once it is left, and hears that it is asked to stop. */
export interface ConsoleIo {
  /** Print a line to standard output. */
  out(line: string): void;
  /** Call `listener` each time the process is asked to stop. Returns a function that stops listening. */
  onStop(listener: () => void): () => void;
}

export interface ConsoleOptions {
  io: ConsoleIo;
  /** Where the gateway is: its own socket on this machine by default, or its entry, with the fingerprint of its key. */
  place?: DialPlace;
  /**
   * The token the console shows the gateway: a device's, as on a machine of the
   * person's own that joined, or none, which on the gateway's own socket is you.
   */
  token?: string | null;
  /** The terminal to draw on. The person's by default. */
  terminal?: ConsoleTerminal;
  /** Told each screen as it is drawn: what it shows and what its keys do, for a test that waits until one is. */
  onDraw?: (screen: Screen) => void;
  /** How long a notice stays, in milliseconds. */
  noticeMs?: number;
  /** How long after Ctrl+C another press still quits, in milliseconds. */
  quitWindowMs?: number;
  /** The moment it is, for saying when things happened. */
  now?: () => number;
  /**
   * Whether this machine has a home for an agent, so that what is said of an
   * agent that is not running tells where to start it: here, or where it
   * lives. Without it the console says to start it here.
   */
  homes?: HomeLookup;
}

/**
 * Open the console on the person's terminal, and keep it open until they leave.
 * It links to the gateway and holds what it shows through that link. Leaving
 * lets go of everything held and stops no work; if an agent is still working,
 * one line says so and how to stop it. The result is the exit code.
 */
export async function openConsole(options: ConsoleOptions): Promise<number> {
  const state = await createClientState({
    dial: dialAt(options.place ?? { path: gatewaySocket() }),
    token: options.token ?? null,
    ...(options.noticeMs === undefined ? {} : { noticeMs: options.noticeMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.homes === undefined ? {} : { homes: options.homes }),
  });
  try {
    const drawing = startDrawing({
      state,
      terminal: options.terminal,
      now: options.now,
      quitWindowMs: options.quitWindowMs,
      onDraw: options.onDraw,
    });
    const stopListening = options.io.onStop(() => drawing.leave());
    try {
      await drawing.left;
    } finally {
      stopListening();
      await drawing.stop();
    }
    const working = state.farewell();
    if (working !== undefined) options.io.out(farewellLine(working.agent, working.thread));
    return 0;
  } finally {
    await state.close();
  }
}
