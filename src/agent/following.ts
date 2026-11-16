import { stat } from "node:fs/promises";
import type { Reloaded } from "../contracts/agent/index.ts";
import { readWake } from "../contracts/agent/node.ts";
import { asError } from "../lib/errors/index.ts";
import type { LeftOut } from "../lib/files/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import type { Wakes } from "./chat/index.ts";
import type { HomeContext } from "./context/durable.ts";
import { homePaths, leftOutSentence, removeBreadcrumb, shownIn, writeBreadcrumb } from "./home/index.ts";
import type { ModelReload } from "./host/durable.ts";
import type { Sessions } from "./sessions/durable.ts";
import type { Triggers } from "./triggers/durable.ts";

/** How often the agent looks at its files, in milliseconds. A test gives a shorter time. */
export const LOOK_EVERY_MS = 2_000;

/** The most times one reading reads the files while they move under it. */
const READS = 3;

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
 * shares. Nothing is known of the files until whoever starts this asks for the
 * first reading. A reading looks at the files before and after it reads them, and
 * reads them again when they moved meanwhile, so what is kept of them is what was
 * read. A look and a reading never overlap another, and a failure is tried again
 * at the next look.
 */
export function follow<T>(options: FollowOptions<T>): Following<T> {
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
async function requireSeen(home: string, file: string): Promise<void> {
  const seen = await stat(file).then((info) => info.isFile(), () => false);
  if (seen) return;
  refuse(`The home at ${home} can't be read for now, because ${shownIn(home, file)} can't be seen, so the agent keeps what it has.`);
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
function keepLeftOut(options: {
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

/** What reading the home reads into. */
export interface HomeParts {
  home: string;
  /** The file that makes the folder a home, which `requireSeen` asks for. Without it, whatever is there is read. */
  homeFile?: string;
  context: Pick<HomeContext, "reload">;
  triggers: Pick<Triggers, "reload">;
  wakes: Pick<Wakes, "replace">;
  sessions: Pick<Sessions, "defaults" | "followModel">;
  /** Read again the model the home starts with and the model servers its files declare. Without it, both stay as they are. */
  reloadModels?: () => Promise<ModelReload>;
  /** Told of the files that can't be used, as `keepLeftOut` says. */
  report: (error: Error) => void;
}

/**
 * Reading the home: its instructions, context files and skills, its triggers,
 * its wake file and its model, and the files it could not use, which are said.
 * When the home names another model, every session follows it from its next
 * request. A model that can't be used is named, and the sessions keep the one
 * they follow.
 */
export function homeReader(parts: HomeParts): () => Promise<Reloaded> {
  const paths = homePaths(parts.home);
  const told = keepLeftOut({ home: parts.home, report: parts.report });
  return async () => {
    if (parts.homeFile !== undefined) await requireSeen(parts.home, parts.homeFile);
    const read = await parts.context.reload();
    const followed = await parts.triggers.reload();
    const model = await followModel(parts);
    const wake = await readWake(paths);
    if (wake.kind === "settings") parts.wakes.replace(wake.settings);
    const leftOut = [...read.leftOut, ...followed.leftOut, ...(wake.kind === "left out" ? [wake.leftOut] : []), ...model.leftOut];
    await told(leftOut);
    const now = parts.sessions.defaults.model;
    return { ...read, triggers: followed.count, model: { provider: now.provider, id: now.modelId }, changedFrom: model.changedFrom, leftOut };
  };
}

/** Read the model the home names again, and have every session follow it when it is another. */
async function followModel(parts: HomeParts): Promise<{ changedFrom: Reloaded["changedFrom"]; leftOut: LeftOut[] }> {
  const found = await parts.reloadModels?.();
  if (found === undefined) return { changedFrom: null, leftOut: [] };
  const leftOut = found.leftOut.map(({ file, reason }) => ({ file: shownIn(parts.home, file), reason }));
  const before = parts.sessions.defaults.model;
  if (found.model === undefined || (found.model.provider === before.provider && found.model.modelId === before.modelId)) {
    return { changedFrom: null, leftOut };
  }
  await parts.sessions.followModel(found.model);
  return { changedFrom: { provider: before.provider, id: before.modelId }, leftOut };
}
