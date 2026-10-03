import type { Io } from "../io/index.ts";

/**
 * Run a program in the foreground until it is told to stop, then close it. The
 * result is the exit code, 0 for a program that stopped as asked. The listener
 * for stop requests comes first: whoever reads the "listening" line may signal
 * at once. A program that cannot start, because another is already running,
 * fails with its own message.
 */
export async function serveUntilStopped<T extends { close(): Promise<void> }>(
  io: Io,
  start: () => Promise<T>,
  announce: (program: T) => object,
): Promise<number> {
  let requestStop = (): void => undefined;
  const stopRequested = new Promise<void>((resolve) => {
    requestStop = resolve;
  });
  const stopListening = io.onStop(requestStop);
  try {
    const program = await start();
    io.out(JSON.stringify(announce(program)));
    await stopRequested;
    await program.close();
    return 0;
  } finally {
    stopListening();
  }
}
