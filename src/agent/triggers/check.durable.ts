import { posix } from "node:path";
import type { Context } from "@earendil-works/chord";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";
import { AGENT_RUNTIME_DIR, type Check } from "../../contracts/agent/index.ts";
import { cutText, delayMs } from "../home/index.ts";

/** The most of what a check printed that is kept: more is cut. */
const OUTPUT_LIMIT = 2_000;

/** How much of what a check prints is held while it runs, since it may print without end until its timeout. */
const HELD = 100_000;

/** How much of the end of a check's standard error goes into the line about its failure. */
const ERROR_END = 300;

/** What an occurrence says when the agent ended while its check ran. */
export const interruptedWhile = (byHand: boolean): string =>
  `The agent stopped while the check was running, so the check was not run again for this occurrence. ${
    byHand ? "Fire the trigger again to run it." : "The next occurrence runs it."
  }`;

/**
 * Where a trigger's check writes what it prints on standard error, in the home's
 * runtime folder: a file for each trigger, which each run writes over, and one
 * for the runs by hand, so that a run by hand and a scheduled one that overlap
 * do not write to the same file.
 */
export const errorsOf = (trigger: string, byHand: boolean): string => `${AGENT_RUNTIME_DIR}/checks/${byHand ? "by-hand/" : ""}${trigger}.stderr`;

/**
 * Run a check in `env`, which is where the agent's shell tool runs, from the
 * home, and say what it found: what it printed on standard output, trimmed and
 * cut at `OUTPUT_LIMIT` characters, or one line that says it failed, with the end
 * of what it printed on standard error, when it exited with anything but 0, ran
 * past its timeout or could not be started. The environment hands over standard
 * output and standard error as one stream, so the command is told to write its
 * standard error to the file `errors` names, which is read when it ends. Rejects
 * when `context` is aborted, as it is when the agent stops: the command is
 * stopped with it, and the check has not found anything.
 */
export async function runCheck(env: ExecutionEnv | undefined, errors: string, check: Check, context: Context): Promise<string> {
  if (env === undefined) return failed("it could not be started: the agent has no shell to run it in");
  const made = await env.createDir(posix.dirname(errors), { recursive: true }, context);
  if (!made.ok) {
    context.abortSignal?.throwIfAborted();
    return failed(`it could not be started: ${made.error.message}`);
  }
  let printed = "";
  const ran = await env.exec(
    `exec 2>${quote(errors)}\n${check.command}`,
    {
      timeout: delayMs(check.timeout) / 1000,
      onOutput: (text) => {
        if (printed.length < HELD) printed += text;
      },
    },
    context,
  );
  context.abortSignal?.throwIfAborted();

  const printedOnError = async (): Promise<string> => {
    const read = await env.readTextFile(errors, context);
    return read.ok ? read.value : "";
  };
  if (!ran.ok) {
    if (ran.error.code === "timeout") return failed(`it did not finish in ${check.timeout}, so it was stopped`, await printedOnError());
    return failed(`it could not be started: ${ran.error.message}`);
  }
  if (ran.value.exitCode !== 0) return failed(`it exited with status ${String(ran.value.exitCode)}`, await printedOnError());
  return cutText(printed.trim(), OUTPUT_LIMIT);
}

/**
 * Whether what a check printed is news, by what the trigger's `when` says.
 * `last` is what the check printed at the last occurrence that was told of it or
 * noted. A trigger that has none has had no occurrence, and its first counts as
 * changed.
 */
export function isNews(when: Check["when"], output: string, last: string | undefined): boolean {
  if (when === "always") return true;
  if (when === "output") return output !== "";
  return output !== last;
}

/** What an occurrence says when its check found news, which it wrote to the trigger's breadcrumb. */
export const notedIn = (trigger: string): string => `Its check printed news, which it wrote to breadcrumbs/${trigger}.md.`;

/**
 * What a trigger's breadcrumb says: the trigger's prompt, when it has one, which
 * says what the fact is and how to look closer, above what its check printed.
 * Never the time, or every check would count as a change.
 */
export const noteOf = (prompt: string, output: string): string => `${prompt === "" ? "" : `${prompt}\n\n`}${output}\n`;

/** The line a failed check has for its output: what went wrong, and the end of what it printed on standard error. */
function failed(what: string, standardError = ""): string {
  const end = endOf(standardError);
  return `The check failed: ${what.replace(/[.\s]+$/, "")}.${end === "" ? "" : ` The end of what it printed on standard error: ${end}`}`;
}

/** The last `ERROR_END` characters of `text`, as one line. */
function endOf(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= ERROR_END) return line;
  const end = line.slice(-ERROR_END);
  const first = end.charCodeAt(0);
  return first >= 0xdc00 && first <= 0xdfff ? end.slice(1) : end;
}

/** One word for a POSIX shell, whatever is in it. */
const quote = (word: string): string => `'${word.replaceAll("'", "'\\''")}'`;
