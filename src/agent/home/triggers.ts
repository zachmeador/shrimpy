import type { Dirent, Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Check, TriggerSchedule } from "../../contracts/agent/index.ts";
import { isName, NAME_RULE } from "./agent-config.ts";
import { codeOf, compare, readText, why } from "./files.ts";
import { frontmatterAndBody } from "./frontmatter.ts";
import type { HomePaths } from "./layout.ts";
import {
  cronFields,
  delayMs,
  delayText,
  isTimezone,
  machineTimezone,
  nextOccurrence,
  normalizeDelay,
  SHORTEST_EVERY_MS,
} from "./schedule.ts";

/**
 * A standing trigger, as its file says it: when it fires, where its
 * occurrences go, what they are told to do and whether a check decides that
 * there is anything to do. It is plain JSON, because the agent keeps the last
 * valid one in its records.
 */
export type TriggerDefinition = {
  /** The file's name without `.md`, which follows the rule for agent names. */
  name: string;
  schedule: TriggerSchedule;
  /** The thread its occurrences go to, or null for a session of the trigger's own. */
  thread: string | null;
  /** Whether it fires. A file that says `enabled: false` is a trigger that is off. */
  enabled: boolean;
  /** `skip` skips an occurrence while the last one is still going, and `allow` hands it over behind the running one. */
  overlap: "skip" | "allow";
  /** The body of the file: what an occurrence is told to do. */
  prompt: string;
  /** What runs at each occurrence to decide whether there is news. A trigger with none has no occurrence that is quiet. */
  check?: Check;
};

/** What checking a trigger's file can be told. */
export interface TriggerCheck {
  /** The shortest interval a trigger may repeat at, in milliseconds. A minute unless given: tests shorten it. */
  shortestEveryMs?: number;
  /** The time the next occurrence of a cron schedule is looked for after, to see that it ever comes. Now, unless given. */
  now?: number;
}

/**
 * A trigger's file that does not check out. The message finishes "<file> was
 * left out: " and says which key is wrong and what it may be, so a person or a
 * model can fix the file from it.
 */
export class TriggerFileError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "TriggerFileError";
  }
}

const KEYS = ["every", "cron", "timezone", "thread", "enabled", "overlap", "check", "when", "then", "timeout"] as const;
const THREAD = /^th_[0-9a-z]{12}$/;
const EXAMPLE_THREAD = "th_4k9x2m7q0b3d";
/** How long a check may run when its file says nothing, and the shortest and longest it may be given. */
const DEFAULT_TIMEOUT = "1m";
const SHORTEST_TIMEOUT_MS = 1_000;
const LONGEST_TIMEOUT_MS = 600_000;

/** For a trigger's name that comes from outside a file, such as a command line. It follows the rule for agents' names. */
export function checkTriggerName(name: string): void {
  if (!isName(name)) throw new TriggerFileError(`the trigger name "${name}" ${NAME_RULE}`);
}

/**
 * Read and check one trigger's file. `name` is the file's name without `.md`,
 * and `text` is everything in it: front matter with the schedule, then the
 * prompt. Anything wrong throws a `TriggerFileError` that says which key and
 * what is allowed. This reads no file and starts nothing, so whatever writes a
 * trigger can check what it is about to write the same way the agent does when
 * it reads one.
 *
 * - `every` is a delay such as 15m, 1h or 1d, at least a minute, counted from
 *   the last occurrence; `cron` has five fields and may come with `timezone`,
 *   the machine's when left out. Exactly one of `every` and `cron`.
 * - `thread` is the ID of a thread. `enabled: false` turns the trigger off.
 *   `overlap: allow` hands an occurrence that is due while the last one is still
 *   going over behind it, where the default skips it.
 * - `check` is a command line that runs at each occurrence and decides whether
 *   there is news. `when` says what news is: `changed`, the default, `output` or
 *   `always`. `then` says what news does, and `timeout` is a delay, a minute
 *   unless given and at most ten, after which the check is stopped. All three
 *   go with a check.
 */
export function parseTrigger(name: string, text: string, check: TriggerCheck = {}): TriggerDefinition {
  if (!isName(name)) throw new TriggerFileError(`its name ${NAME_RULE}`);
  const parts = frontmatterAndBody(text);
  if (parts === undefined) {
    throw new TriggerFileError("it does not start with a front matter block, between --- lines, with the schedule in it");
  }
  const { values, body } = parts;
  for (const [key, value] of values) {
    if (!(KEYS as readonly string[]).includes(key)) {
      throw new TriggerFileError(`${key} is not a key a trigger has. The keys are ${list(KEYS)}`);
    }
    if (value === "") throw new TriggerFileError(`${key} has no value`);
  }

  const schedule = scheduleOf(values, check);
  const thread = values.get("thread");
  if (thread !== undefined && !THREAD.test(thread)) {
    throw new TriggerFileError(`thread: ${thread} should be the ID of a thread, such as ${EXAMPLE_THREAD}`);
  }
  const checked = checkOf(values);
  const prompt = body.trim();
  if (prompt === "") throw new TriggerFileError("it has no prompt: write what the trigger is to do after the closing --- line");

  return {
    name,
    schedule,
    thread: thread ?? null,
    enabled: oneOf("enabled", values.get("enabled"), { true: true, false: false }, true),
    overlap: oneOf("overlap", values.get("overlap"), { skip: "skip", allow: "allow" } as const, "skip"),
    prompt,
    ...(checked === undefined ? {} : { check: checked }),
  };
}

/** The check the file asks for, or undefined when it asks for none. */
function checkOf(values: ReadonlyMap<string, string>): Check | undefined {
  const command = values.get("check");
  if (command === undefined) {
    const stray = ["when", "then", "timeout"].find((key) => values.has(key));
    if (stray !== undefined) {
      throw new TriggerFileError(`${stray} goes with check, and this file has no check: give check, a command run at each occurrence, such as check: cat status.txt`);
    }
    return undefined;
  }
  return {
    command,
    when: oneOf("when", values.get("when"), { changed: "changed", output: "output", always: "always" } as const, "changed"),
    then: thenOf(values.get("then")),
    timeout: timeoutOf(values.get("timeout")),
  };
}

function thenOf(given: string | undefined): "wake" {
  if (given?.toLowerCase() === "note") {
    throw new TriggerFileError("then: note is not built yet: for now news can only wake the agent, so leave then out or give then: wake");
  }
  return oneOf("then", given, { wake: "wake" } as const, "wake");
}

function timeoutOf(given: string | undefined): string {
  if (given === undefined) return DEFAULT_TIMEOUT;
  const normal = normalizeDelay(given);
  if (normal === undefined) {
    throw new TriggerFileError(`timeout: ${given} is not a delay: write a whole number and a unit, s or m, such as 30s or 2m`);
  }
  if (delayMs(normal) < SHORTEST_TIMEOUT_MS) {
    throw new TriggerFileError(`timeout: ${given} is shorter than ${delayText(SHORTEST_TIMEOUT_MS)}, the shortest a check may be given`);
  }
  if (delayMs(normal) > LONGEST_TIMEOUT_MS) {
    throw new TriggerFileError(`timeout: ${given} is longer than ${delayText(LONGEST_TIMEOUT_MS)}, the longest a check may run`);
  }
  return normal;
}

function scheduleOf(values: ReadonlyMap<string, string>, check: TriggerCheck): TriggerSchedule {
  const every = values.get("every");
  const cron = values.get("cron");
  const timezone = values.get("timezone");
  if (every !== undefined && cron !== undefined) throw new TriggerFileError("it has both every and cron: give one of them");
  if (every === undefined && cron === undefined) {
    throw new TriggerFileError(
      "it needs every, how often it repeats, such as every: 1h, or cron, when it fires, such as cron: 0 3 * * *",
    );
  }

  if (every !== undefined) {
    if (timezone !== undefined) {
      throw new TriggerFileError("timezone goes with cron: every counts from the last occurrence and has no time of day");
    }
    const normal = normalizeDelay(every);
    if (normal === undefined) {
      throw new TriggerFileError(`every: ${every} is not a delay: write a whole number and a unit, m, h or d, such as 15m, 1h or 1d`);
    }
    const shortest = check.shortestEveryMs ?? SHORTEST_EVERY_MS;
    if (delayMs(normal) < shortest) {
      throw new TriggerFileError(`every: ${every} is shorter than ${delayText(shortest)}, the shortest a trigger repeats at`);
    }
    return { every: normal };
  }

  const expression = cronFields(cron ?? "");
  if (expression === undefined) {
    throw new TriggerFileError(
      `cron: ${cron ?? ""} should have five fields: minute, hour, day of month, month and day of week, such as 0 3 * * *`,
    );
  }
  const zone = timezone ?? machineTimezone();
  if (!isTimezone(zone)) {
    throw new TriggerFileError(
      timezone === undefined
        ? `this machine's time zone, ${zone}, is not one cron can use: give timezone, an IANA name such as Europe/Berlin`
        : `timezone: ${timezone} is not a time zone: use an IANA name such as Europe/Berlin or America/New_York`,
    );
  }
  const schedule: TriggerSchedule = { cron: expression, timezone: zone };
  try {
    nextOccurrence(schedule, check.now ?? Date.now());
  } catch (error) {
    throw new TriggerFileError(`cron: ${expression} is not a schedule that comes: ${error instanceof Error ? error.message : String(error)}`);
  }
  return schedule;
}

/** A key whose value is one of a few words, or `fallback` when the key is left out. */
function oneOf<T>(key: string, given: string | undefined, allowed: Record<string, T>, fallback: T): T {
  if (given === undefined) return fallback;
  const found = Object.hasOwn(allowed, given.toLowerCase()) ? allowed[given.toLowerCase()] : undefined;
  if (found === undefined) throw new TriggerFileError(`${key}: ${given} should be ${list(Object.keys(allowed), "or")}`);
  return found;
}

/** Words as a sentence lists them: "a", "a and b", "a, b and c". */
function list(words: readonly string[], joiner = "and"): string {
  const last = words.at(-1);
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} ${joiner} ${last}`;
}

/** A file in `triggers/` that does not check out, and why. */
export interface TriggerProblem {
  /** The trigger the file would have been, or null when its name is not one. */
  name: string | null;
  /** Where the file is inside the home. */
  file: string;
  /** Finishes "<file> was left out: <reason>." */
  reason: string;
}

/** What `triggers/` holds: the triggers that check out, and the files that don't. */
export interface TriggerFiles {
  triggers: TriggerDefinition[];
  problems: TriggerProblem[];
}

/**
 * Read the `triggers/` folder: each Markdown file in it, hidden files and
 * folders aside, is a trigger named for the file. A file that does not check
 * out is named in `problems` and never stops the rest; a folder that is not
 * there holds none. This is the one place the home's trigger files are read.
 */
export async function readTriggers(paths: HomePaths, check: TriggerCheck = {}): Promise<TriggerFiles> {
  const found: TriggerFiles = { triggers: [], problems: [] };
  let entries: Dirent[];
  try {
    entries = await readdir(paths.triggers, { withFileTypes: true });
  } catch (error) {
    if (codeOf(error) !== "ENOENT") found.problems.push({ name: null, file: "triggers", reason: why(error) });
    return found;
  }
  for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
    if (entry.name.startsWith(".") || !entry.name.toLowerCase().endsWith(".md")) continue;
    const file = `triggers/${entry.name}`;
    const name = entry.name.slice(0, -".md".length);
    const known = isName(name) ? name : null;
    let info: Stats;
    try {
      info = await stat(join(paths.triggers, entry.name));
    } catch (error) {
      found.problems.push({ name: known, file, reason: codeOf(error) === "ENOENT" ? "it is a link to nothing" : why(error) });
      continue;
    }
    if (!info.isFile()) continue;
    const read = await readText(join(paths.triggers, entry.name));
    if (read.kind !== "text") {
      if (read.kind === "unreadable") found.problems.push({ name: known, file, reason: read.reason });
      continue;
    }
    try {
      found.triggers.push(parseTrigger(name, read.text, check));
    } catch (error) {
      if (!(error instanceof TriggerFileError)) throw error;
      found.problems.push({ name: known, file, reason: error.message });
    }
  }
  return found;
}
