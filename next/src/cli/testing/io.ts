import type { Io } from "../io.ts";

/** An `Io` that records what is printed and lets a test send the stop request that a signal would. */
export interface CapturedIo {
  readonly io: Io;
  readonly out: string[];
  readonly err: string[];
  /** Resolves with the first printed line, from the start, that satisfies `matches`. */
  nextOut(matches: (line: string) => boolean): Promise<string>;
  /** What SIGTERM or Ctrl+C would do. */
  requestStop(): void;
}

export function captureIo(): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  const stops = new Set<() => void>();
  const watchers = new Set<(line: string) => void>();
  return {
    out,
    err,
    io: {
      out(line) {
        out.push(line);
        for (const watcher of watchers) watcher(line);
      },
      err: (line) => void err.push(line),
      onStop(listener) {
        stops.add(listener);
        return () => void stops.delete(listener);
      },
    },
    nextOut(matches) {
      return new Promise((resolve) => {
        const seen = out.find(matches);
        if (seen !== undefined) return resolve(seen);
        const watcher = (line: string): void => {
          if (!matches(line)) return;
          watchers.delete(watcher);
          resolve(line);
        };
        watchers.add(watcher);
      });
    },
    requestStop() {
      for (const listener of [...stops]) listener();
    },
  };
}
