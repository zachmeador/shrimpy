import type { TestContext } from "node:test";
import type { ConsoleOptions, ConsoleScreen } from "../../clients/console/index.ts";
import { type FakeTerminal, stopAfter, until } from "../../lib/testing/index.ts";
import { type Io, runCli } from "../index.ts";
import { type CapturedIo, captureIo } from "./io.ts";

/** How a bare `shrimpy` at a terminal opens the console, with what a test stands in for. */
export type ConsoleOpener = (io: Io, stand: Pick<ConsoleOptions, "terminal" | "onDraw">) => Promise<number>;

/** The console, opened from the command line on a terminal of the test's own. */
export interface OpenedConsole {
  /** What the command printed, and the stop request a signal would make. */
  readonly cli: CapturedIo;
  /** The command's exit code, once the console has been left. */
  readonly exited: Promise<number>;
  /** Wait until the screen the console shows is one that `done` accepts, and give it. */
  readonly untilScreen: (done: (screen: ConsoleScreen) => boolean, what: string) => Promise<ConsoleScreen>;
}

/**
 * Open the console the way a bare `shrimpy` at a terminal does, with `open`, on
 * `terminal`. A test that fails must not leave it open, so it is asked to stop
 * when the test ends.
 */
export function openConsoleOn(t: TestContext, terminal: FakeTerminal, open: ConsoleOpener): OpenedConsole {
  const cli = captureIo({ terminal: true });
  let latest: ConsoleScreen | undefined;
  const exited = runCli([], cli.io, { openConsole: (io) => open(io, { terminal, onDraw: (screen) => void (latest = screen) }) });
  stopAfter(t, async () => {
    cli.requestStop();
    await exited.catch(() => undefined);
  });
  return {
    cli,
    exited,
    untilScreen: async (done, what) => {
      await until(() => latest !== undefined && done(latest), `the console to show ${what}`, 30_000);
      return latest as ConsoleScreen;
    },
  };
}
