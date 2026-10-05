import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { isName } from "./agent-config.ts";
import { compare, readText, replaceFile } from "./files.ts";
import type { HomePaths } from "./layout.ts";
import { loadHome } from "./load.ts";
import {
  checkTriggerName,
  parseTrigger,
  readTriggers,
  type TriggerCheck,
  type TriggerDefinition,
  TriggerFileError,
} from "./triggers.ts";

/** What it takes to make a trigger, as someone typed it: the values of its file's keys, and its prompt. */
export interface NewTrigger {
  every?: string;
  cron?: string;
  timezone?: string;
  thread?: string;
  overlap?: string;
  check?: string;
  when?: string;
  then?: string;
  timeout?: string;
  prompt: string;
}

/** A trigger's file as it would be written, once it has been checked the way the agent checks one it reads. */
export interface TriggerDraft {
  name: string;
  text: string;
  definition: TriggerDefinition;
}

/** The home has no trigger of this name. `known` are the names it does have, in order. */
export class NoTriggerError extends Error {
  readonly triggerName: string;
  readonly known: string[];

  constructor(name: string, known: string[]) {
    super(`The home has no trigger called ${name}.`);
    this.name = "NoTriggerError";
    this.triggerName = name;
    this.known = known;
  }
}

const PLAIN = /^[A-Za-z0-9][A-Za-z0-9_./+-]*$/;

/** A value as the front matter writes it: as it is when that is safe, and quoted when it is not, so nothing typed can add a key. */
const scalar = (value: string): string => (PLAIN.test(value) ? value : JSON.stringify(value));

/**
 * The file for a new trigger, checked by `parseTrigger`, which is the check the
 * agent makes when it reads the file, so a schedule that is wrong is refused here
 * with the reason the agent would give. Nothing is written. Throws a
 * `TriggerFileError` that says which key is wrong and what it may be.
 */
export function draftTrigger(name: string, parts: NewTrigger, check?: TriggerCheck): TriggerDraft {
  checkTriggerName(name);
  // A front matter value is one line, so a command with a line break in it would come back as another command.
  if (parts.check !== undefined && /[\r\n]/.test(parts.check)) {
    throw new TriggerFileError("check is one line: put a longer script in a file in the home, and run that file");
  }
  const keys = [
    ["every", parts.every],
    ["cron", parts.cron],
    ["timezone", parts.timezone],
    ["thread", parts.thread],
    ["overlap", parts.overlap],
    ["check", parts.check],
    ["when", parts.when],
    ["then", parts.then],
    ["timeout", parts.timeout],
  ] as const;
  const lines = keys.flatMap(([key, value]) => (value === undefined ? [] : [`${key}: ${scalar(value)}`]));
  const text = ["---", ...lines, "---", parts.prompt.trim(), ""].join("\n");
  return { name, text, definition: parseTrigger(name, text, check) };
}

/**
 * Write a checked draft as the home's `triggers/<name>.md`, replacing the file
 * of that name if there is one. The home has to be an agent's. Nobody reading
 * the folder at the same moment sees half a file.
 */
export async function saveTrigger(home: string, draft: TriggerDraft): Promise<{ file: string; replaced: boolean }> {
  checkTriggerName(draft.name);
  const { paths } = loadHome(home);
  const file = triggerFile(paths, draft.name);
  const replaced = existsSync(file);
  await mkdir(paths.triggers, { recursive: true });
  await replaceFile(file, draft.text);
  return { file, replaced };
}

/**
 * Turn the trigger of this name on or off in its file, and leave the rest of the
 * file as it is. The file has to check out as it is and again as it will be
 * written, and if it does not, nothing is written and the error says what is
 * wrong. `changed` says whether the file had to be written: one that already
 * says what was asked is left alone.
 */
export async function switchTrigger(
  home: string,
  name: string,
  enabled: boolean,
): Promise<{ file: string; definition: TriggerDefinition; changed: boolean }> {
  const { paths } = loadHome(home);
  if (!isName(name)) throw await noTrigger(paths, name);
  const file = triggerFile(paths, name);
  const read = await readText(file);
  if (read.kind === "missing") throw await noTrigger(paths, name);
  if (read.kind === "unreadable") throw new Error(`triggers/${name}.md could not be read: ${read.reason}.`);

  const before = parseTrigger(name, read.text);
  if (before.enabled === enabled) return { file, definition: before, changed: false };
  const text = withEnabled(read.text, enabled);
  const definition = parseTrigger(name, text);
  if (definition.enabled !== enabled) {
    throw new TriggerFileError("it has an enabled line that cannot be changed here: edit the file by hand");
  }
  await replaceFile(file, text);
  return { file, definition, changed: true };
}

/** Delete the file of the trigger of this name. */
export async function removeTrigger(home: string, name: string): Promise<{ file: string }> {
  const { paths } = loadHome(home);
  if (!isName(name)) throw await noTrigger(paths, name);
  const file = triggerFile(paths, name);
  if (!existsSync(file)) throw await noTrigger(paths, name);
  await rm(file);
  return { file };
}

const triggerFile = (paths: HomePaths, name: string): string => join(paths.triggers, `${name}.md`);

/** The error for a name the home has no trigger of, with the names it has. */
async function noTrigger(paths: HomePaths, name: string): Promise<NoTriggerError> {
  const { triggers, problems } = await readTriggers(paths);
  const known = [...triggers.map((trigger) => trigger.name), ...problems.flatMap((problem) => (problem.name === null ? [] : [problem.name]))];
  return new NoTriggerError(name, known.sort(compare));
}

/**
 * The text of a trigger's file with `enabled` set. Turning a trigger on takes
 * the line away, since that is what a file without it says; turning it off
 * puts the line in, in place of the one that was there or just before the
 * closing line of the front matter.
 */
function withEnabled(text: string, enabled: boolean): string {
  const lines = text.split("\n");
  const close = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  const at = lines.findIndex((line, index) => index > 0 && index < close && line.startsWith("enabled:"));
  if (enabled) {
    if (at !== -1) lines.splice(at, 1);
  } else if (at !== -1) {
    lines[at] = "enabled: false";
  } else {
    lines.splice(close, 0, "enabled: false");
  }
  return lines.join("\n");
}
