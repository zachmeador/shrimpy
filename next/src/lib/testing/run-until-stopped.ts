/**
 * The body of a test fixture that runs a program as a process of its own: it
 * listens for SIGTERM and SIGINT first, starts the program, prints
 * `announce(program)` as one JSON line, and closes the program once stopped.
 * Whoever reads the line may signal at once, so the handlers have to exist
 * before the line does.
 */
export async function runUntilStopped<T extends { close(): Promise<void> }>(
  start: () => Promise<T>,
  announce: (program: T) => object,
): Promise<void> {
  const stopped = new Promise<void>((resolve) => {
    process.once("SIGTERM", resolve);
    process.once("SIGINT", resolve);
  });
  // Signal handlers do not keep a process alive, and a program may hold nothing that does.
  const keepAlive = setInterval(() => undefined, 60_000);
  try {
    const program = await start();
    process.stdout.write(`${JSON.stringify(announce(program))}\n`);
    await stopped;
    await program.close();
  } finally {
    clearInterval(keepAlive);
  }
}
