import { createInterface } from "node:readline";
import { Writable } from "node:stream";

/** How a question is asked. */
export interface AskOptions {
  /** The answer is not shown as it is typed, when a person is at a terminal. */
  readonly secret?: boolean;
  /** Stops the wait: the question is let go of, and the answer is a rejection. */
  readonly signal?: AbortSignal;
}

/** Where a command prints, listens and asks, so tests can stand in for the terminal and for signals. */
export interface Io {
  /** Print a line to standard output. */
  out(line: string): void;
  /** Print a line to standard error. */
  err(line: string): void;
  /**
   * Print `question`, wait for one line and return it without its line break.
   * The line may be empty. Rejects when `signal` aborts, with the question let
   * go of so that the next one works, and when the input ends before a line
   * comes.
   */
  ask(question: string, options?: AskOptions): Promise<string>;
  /**
   * Call `listener` each time the process is asked to stop, as SIGTERM and
   * Ctrl+C do. Returns a function that stops listening.
   */
  onStop(listener: () => void): () => void;
  /** Whether a person is at a terminal: input and output are both one. */
  readonly terminal: boolean;
}

const INPUT_ENDED = "The input ended before the question was answered.";

export function processIo(): Io {
  const terminal = process.stdin.isTTY && process.stdout.isTTY;
  let lines: Lines | undefined;
  return {
    out: (line) => void process.stdout.write(`${line}\n`),
    err: (line) => void process.stderr.write(`${line}\n`),
    ask(question, options = {}) {
      if (terminal) return askPerson(question, options);
      lines ??= readLines(process.stdin);
      return askInput(lines, question, options.signal);
    },
    onStop(listener) {
      process.on("SIGTERM", listener);
      process.on("SIGINT", listener);
      return () => {
        process.off("SIGTERM", listener);
        process.off("SIGINT", listener);
      };
    },
    terminal,
  };
}

/** Why a question stopped being asked: what the signal says, which is an error unless someone aborted it with something else. */
function stopped(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error("The question was stopped.");
}

/**
 * Ask a person at a terminal. readline takes the keyboard for this question
 * alone and gives it back when the line comes, the signal aborts or the input
 * ends, so the next question, and the end of the command, find it free. It
 * reads the line itself, which a terminal left to do it would cut at a limit
 * that a pasted link can pass.
 */
function askPerson(question: string, { secret = false, signal }: AskOptions): Promise<string> {
  if (signal?.aborted) return Promise.reject(stopped(signal));
  return new Promise((resolve, reject) => {
    let shown = true;
    // What a person types is echoed through the output, so a secret has an output that shows nothing once it is asked.
    const output = secret
      ? new Writable({
          write(chunk: Buffer | string, encoding, done) {
            if (shown) process.stdout.write(chunk, encoding);
            done();
          },
        })
      : process.stdout;
    const reader = createInterface({ input: process.stdin, output, terminal: true });
    let finished = false;
    const finish = (settle: () => void): void => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      reader.close();
      settle();
    };
    const onAbort = (): void => {
      process.stdout.write("\n");
      finish(() => reject(stopped(signal)));
    };
    reader.on("line", (line) => {
      if (secret) process.stdout.write("\n");
      finish(() => resolve(line));
    });
    reader.on("close", () => {
      if (finished) return;
      process.stdout.write("\n");
      finish(() => reject(new Error(INPUT_ENDED)));
    });
    reader.on("SIGINT", () => {
      // Here Ctrl+C is a key, not a signal. Send the signal it stands for, which the command listens for to stop,
      // and which then aborts this question. The keyboard stays taken until then: with nothing else to wait for, the
      // process would end before the signal reached it.
      process.kill(process.pid, "SIGINT");
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (secret) {
      process.stdout.write(question);
      shown = false;
    } else {
      reader.setPrompt(question);
      reader.prompt();
    }
  });
}

interface Waiter {
  resolve(line: string): void;
  reject(error: Error): void;
}

interface Lines {
  /** The next line, waiting for it if it hasn't come. */
  next(signal: AbortSignal | undefined): Promise<string>;
}

/**
 * The lines of standard input when nobody is at a terminal. They are read ahead
 * and kept, so that answering one question never loses the lines after it, and
 * the input is paused whenever nobody is waiting, so that it doesn't hold the
 * process open.
 */
function readLines(input: NodeJS.ReadableStream): Lines {
  const reader = createInterface({ input, terminal: false, crlfDelay: Infinity });
  reader.pause();
  const queued: string[] = [];
  const waiting: Waiter[] = [];
  let ended = false;
  reader.on("line", (line) => {
    const waiter = waiting.shift();
    if (waiter === undefined) queued.push(line);
    else waiter.resolve(line);
    if (waiting.length === 0) reader.pause();
  });
  reader.on("close", () => {
    ended = true;
    for (const waiter of waiting.splice(0)) waiter.reject(new Error(INPUT_ENDED));
  });
  return {
    next(signal) {
      const line = queued.shift();
      if (line !== undefined) return Promise.resolve(line);
      if (ended) return Promise.reject(new Error(INPUT_ENDED));
      if (signal?.aborted) return Promise.reject(stopped(signal));
      return new Promise((resolve, reject) => {
        const forget = (): void => signal?.removeEventListener("abort", onAbort);
        const waiter: Waiter = {
          resolve: (answer) => {
            forget();
            resolve(answer);
          },
          reject: (error) => {
            forget();
            reject(error);
          },
        };
        const onAbort = (): void => {
          waiting.splice(waiting.indexOf(waiter), 1);
          if (waiting.length === 0) reader.pause();
          forget();
          reject(stopped(signal));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        waiting.push(waiter);
        reader.resume();
      });
    },
  };
}

async function askInput(lines: Lines, question: string, signal: AbortSignal | undefined): Promise<string> {
  process.stdout.write(question);
  try {
    return await lines.next(signal);
  } finally {
    // The answer isn't echoed here, so what comes next starts on a line of its own.
    process.stdout.write("\n");
  }
}
