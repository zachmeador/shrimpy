import { stat } from "node:fs/promises";
import { refuse } from "../lib/refusal/index.ts";
import { homePaths, type LeftOut, leftOutSentence, removeBreadcrumb, shownIn, writeBreadcrumb } from "./home/index.ts";

/** How often the agent looks at its files, in milliseconds. A test gives a shorter time. */
export const LOOK_EVERY_MS = 2_000;

export interface FollowOptions<T> {
  /** The time between two looks. */
  everyMs: number;
  /** A look at the files: the same text for as long as none of them changes. */
  look(): Promise<string>;
  /** Read the files again, all of them. */
  read(): Promise<T>;
  /** Told when a look or a reading fails, once for each way it fails, since the next look tries again. */
  onError(error: Error): void;
}

/** An agent keeping up with its own files. */
export interface Following<T> {
  /**
   * Read the files again now, after a reading that is under way. It counts as the
   * last reading, so a look that comes after it finds nothing new in what it read.
   */
  reload(): Promise<T>;
  /** Stop looking, and wait for the reading under way. */
  close(): Promise<void>;
}

/**
 * Keep up with files by looking at them every `everyMs`, and reading them again
 * when what the look shows has changed and is the same at the look after, so
 * that a file that is being written is not read half-way. It looks and does not
 * watch: file-system events are not delivered for a folder that another machine
 * shares. Until the first reading nothing is known of the files, so whoever
 * starts this asks for that reading once it has read them itself, and a file that
 * changed meanwhile is read then. A look and a reading never overlap another, and
 * a failure is tried again at the next look.
 */
export function follow<T>(options: FollowOptions<T>): Following<T> {
  /** What the files looked like just before they were last read. */
  let read: string | undefined;
  /** What the last look showed, when that differed from `read`. */
  let pending: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let looking: Promise<void> | undefined;
  let closed = false;
  let failure: string | undefined;

  // Looked at before it is read, so that a file that changes while it is read is seen to have changed.
  const reading = async (): Promise<T> => {
    const looked = await options.look();
    const result = await options.read();
    read = looked;
    pending = undefined;
    return result;
  };

  const reload = (): Promise<T> => {
    const turn = queue.then(reading);
    queue = turn.catch(() => undefined);
    return turn;
  };

  const lookOnce = async (): Promise<void> => {
    const seen = await options.look();
    if (seen === read) {
      pending = undefined;
    } else if (seen !== pending) {
      pending = seen;
    } else {
      await reload();
    }
  };

  const tick = (): void => {
    if (closed || looking !== undefined) return;
    looking = lookOnce()
      .then(() => {
        failure = undefined;
      })
      .catch((error: unknown) => {
        const cause = error instanceof Error ? error : new Error(String(error));
        if (cause.message === failure) return;
        failure = cause.message;
        options.onError(cause);
      })
      .finally(() => {
        looking = undefined;
      });
  };

  const timer = setInterval(tick, options.everyMs);
  timer.unref();

  return {
    reload,
    async close() {
      closed = true;
      clearInterval(timer);
      await looking;
      await queue;
    },
  };
}

/**
 * Fail, with one sentence that says so, when `file` can't be seen. It is the file
 * that makes a folder a home, `agent.json`, so a home that lacks it is not there:
 * the share it is on is not mounted for a moment, say. Reading such a home would
 * find no triggers, which would end them all, and no instructions. So nothing is
 * read, the agent keeps what it has, and the next look tries again. It is a
 * refusal, so whoever asks for a reading is told in the same words.
 */
export async function requireSeen(home: string, file: string): Promise<void> {
  const seen = await stat(file).then((info) => info.isFile(), () => false);
  if (seen) return;
  refuse(`The home at ${home} can't be read for now, because ${shownIn(home, file)} can't be seen, so the agent keeps what it has.`, "service_not_allowed");
}

/**
 * What the breadcrumb about files left out is called. A trigger's name can't start
 * with an underscore, so a trigger that notes its news never writes over it.
 */
export const LEFT_OUT_BREADCRUMB = "_left-out";

const breadcrumbAbout = (leftOut: readonly LeftOut[]): string =>
  `${["Files in your home that can't be used, and why:", ...leftOut.map(leftOutSentence)].join("\n")}\n`;

/**
 * What the agent does with the files it left out, after every reading of the
 * home: says each on standard error, once, and not again while it stays the same
 * file with the same reason, and keeps one breadcrumb in the home that tells the
 * agent which and why, as a fact and not an instruction. The breadcrumb is
 * written when the list changes and deleted when the list is empty. That is
 * checked at the first reading too, so a breadcrumb left by an earlier run does not
 * outlive the problem. The breadcrumb is in a folder the agent does not look at, so
 * writing it is no change to what it reads.
 */
export function keepLeftOut(options: {
  home: string;
  report(error: Error): void;
}): (leftOut: readonly LeftOut[]) => Promise<void> {
  const paths = homePaths(options.home);
  let said = new Set<string>();
  /** The breadcrumb's text as it was last written, undefined for none, and null before the first reading. */
  let written: string | undefined | null = null;

  return async (leftOut) => {
    const now = leftOut.map(leftOutSentence);
    for (const sentence of now) if (!said.has(sentence)) options.report(new Error(sentence));
    said = new Set(now);

    const text = leftOut.length === 0 ? undefined : breadcrumbAbout(leftOut);
    if (text === written) return;
    try {
      if (text === undefined) await removeBreadcrumb(paths, LEFT_OUT_BREADCRUMB);
      else await writeBreadcrumb(paths, LEFT_OUT_BREADCRUMB, text);
      written = text;
    } catch (error) {
      const what = text === undefined ? "removed" : "written";
      options.report(new Error(`The breadcrumb about files left out could not be ${what}: ${error instanceof Error ? error.message : String(error)}`));
    }
  };
}
