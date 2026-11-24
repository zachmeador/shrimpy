import { asError } from "../errors/index.ts";

/** How often files are looked at, in milliseconds, unless whoever follows them says otherwise. */
const LOOK_EVERY_MS = 2_000;

/** The most times one reading reads the files while they move under it. */
const READS = 3;

export interface FollowFilesOptions<T> {
  /** The time between two looks, in milliseconds. Two seconds, if not given. */
  everyMs?: number;
  /** A look at the files: the same text for as long as none of them changes. */
  look(): Promise<string>;
  /** Read the files again, all of them. */
  read(): Promise<T>;
  /** Told when a look or a reading fails, once for each way it fails, since the next look tries again. */
  onError(error: Error): void;
}

/** Files being kept up with. */
export interface FollowingFiles<T> {
  /**
   * Read the files again now, after a reading that is under way. It counts as the
   * last reading, so a look that comes after it finds nothing new in what it read.
   */
  reload(): Promise<T>;
  /** Stop looking, and wait for the reading under way. */
  close(): Promise<void>;
}

/**
 * Keep up with files by looking at them every couple of seconds, and reading
 * them again when what the look shows has changed and is the same at the look
 * after, so that a file that is being written is not read half-way. It looks and does not
 * watch: file-system events are not delivered for a folder that another machine
 * shares. Nothing is known of the files until whoever starts this asks for the
 * first reading. A reading looks at the files before and after it reads them, and
 * reads them again when they moved meanwhile, so what is kept of them is what was
 * read. A look and a reading never overlap another, and a failure is tried again
 * at the next look.
 */
export function followFiles<T>(options: FollowFilesOptions<T>): FollowingFiles<T> {
  /** What the files looked like when they were last read. */
  let read: string | undefined;
  /** What the last look showed, when that differed from `read`. */
  let pending: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let looking: Promise<void> | undefined;
  let closed = false;
  let failure: string | undefined;

  // Files that moved while they were read may have been read half-way, so they are read again. Files that move at every
  // reading are kept as they looked before the last one, so the next looks find the change and read it once it settles.
  const reading = async (): Promise<T> => {
    let before = await options.look();
    for (let reads = 1; ; reads += 1) {
      const result = await options.read();
      const after = await options.look();
      if (after === before || reads === READS) {
        read = before;
        pending = undefined;
        return result;
      }
      before = after;
    }
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
        const cause = asError(error);
        if (cause.message === failure) return;
        failure = cause.message;
        options.onError(cause);
      })
      .finally(() => {
        looking = undefined;
      });
  };

  const timer = setInterval(tick, options.everyMs ?? LOOK_EVERY_MS);
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
