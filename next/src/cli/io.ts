/** Where a command prints and listens, so tests can stand in for the terminal and for signals. */
export interface Io {
  /** Print a line to standard output. */
  out(line: string): void;
  /** Print a line to standard error. */
  err(line: string): void;
  /** Call `listener` each time the process is asked to stop, as SIGTERM and Ctrl+C do. Returns a function that stops listening. */
  onStop(listener: () => void): () => void;
}

export function processIo(): Io {
  return {
    out: (line) => void process.stdout.write(`${line}\n`),
    err: (line) => void process.stderr.write(`${line}\n`),
    onStop(listener) {
      process.on("SIGTERM", listener);
      process.on("SIGINT", listener);
      return () => {
        process.off("SIGTERM", listener);
        process.off("SIGINT", listener);
      };
    },
  };
}
