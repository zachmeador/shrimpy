import type { Io } from "../io/index.ts";

/** An `Io` that records what is printed and asked, answers from a script, and lets a test send the stop request that a signal would. */
export interface CapturedIo {
  readonly io: Io;
  readonly out: string[];
  readonly err: string[];
  /** The questions asked so far, in order, and whether each was asked as a secret. */
  readonly asked: { question: string; secret: boolean }[];
  /** Resolves with the first printed line, from the start, that satisfies `matches`. */
  nextOut(matches: (line: string) => boolean): Promise<string>;
  /** What SIGTERM or Ctrl+C would do. */
  requestStop(): void;
}

/**
 * Capture what a command prints. It is not at a terminal unless `terminal`
 * says so. Its questions are answered with `answers`, in order, and one that
 * has no answer left fails the test.
 */
export function captureIo(options: { terminal?: boolean; answers?: readonly string[] } = {}): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  const asked: { question: string; secret: boolean }[] = [];
  const answers = [...(options.answers ?? [])];
  const stops = new Set<() => void>();
  const watchers = new Set<(line: string) => void>();
  return {
    out,
    err,
    asked,
    io: {
      out(line) {
        out.push(line);
        for (const watcher of watchers) watcher(line);
      },
      err: (line) => void err.push(line),
      ask(question, askOptions = {}) {
        asked.push({ question, secret: askOptions.secret === true });
        const answer = answers.shift();
        if (answer === undefined) return Promise.reject(new Error(`No answer was scripted for: ${question}`));
        return Promise.resolve(answer);
      },
      onStop(listener) {
        stops.add(listener);
        return () => void stops.delete(listener);
      },
      terminal: options.terminal === true,
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
