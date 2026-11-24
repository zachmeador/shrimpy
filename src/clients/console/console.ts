import { hostname } from "node:os";
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
  /** Told the level in front each time the screen is drawn: what it shows and what its keys do, for a test that waits until one is. */
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
  /** Open a new thread with the only agent there is when the console is taken to it, as it is after setting up. */
  startOnLanding?: boolean;
  /**
   * Put the gateway's version, `version`, on this machine and open the
   * terminal again, once the console has left the screen, for `/update` and
   * for what the first screen offers while the gateway turns the console away
   * for the release it runs. The result is the exit code. Without it the
   * console offers neither.
   */
  update?: (version: string) => Promise<number>;
}

/**
 * Open the console on the person's terminal, and keep it open until they leave.
 * It links to the gateway and holds what it shows through that link. Leaving
 * lets go of everything held and stops no work; if an agent is still working,
 * one line says so and how to stop it. Updating this machine leaves the same
 * way first. The result is the exit code.
 */
export async function openConsole(options: ConsoleOptions): Promise<number> {
  const { update } = options;
  let updateTo: string | undefined;
  let leave = (): void => undefined;
  const updating =
    update === undefined
      ? {}
      : {
          update(version: string) {
            updateTo = version;
            leave();
          },
        };
  const state = await createClientState({
    dial: dialAt(options.place ?? { path: gatewaySocket() }),
    token: options.token ?? null,
    ...(options.noticeMs === undefined ? {} : { noticeMs: options.noticeMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.homes === undefined ? {} : { homes: options.homes }),
    ...(options.startOnLanding === undefined ? {} : { startOnLanding: options.startOnLanding }),
    ...updating,
  });
  try {
    const drawing = startDrawing({
      state,
      terminal: options.terminal,
      now: options.now,
      quitWindowMs: options.quitWindowMs,
      onDraw: options.onDraw,
      machine: hostname(),
      ...updating,
    });
    leave = () => drawing.leave();
    const stopListening = options.io.onStop(() => drawing.leave());
    try {
      await drawing.left;
    } finally {
      stopListening();
      await drawing.stop();
    }
    const working = state.farewell();
    if (working !== undefined) options.io.out(farewellLine(working.agent, working.thread));
  } finally {
    await state.close();
  }
  return update === undefined || updateTo === undefined ? 0 : update(updateTo);
}
