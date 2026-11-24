import { asError } from "../errors/index.ts";

/** A file that a reader left out of what it read, and why. */
export interface LeftOut {
  /** Where the file is, as its reader names it to whoever it tells. */
  readonly file: string;
  /** Short, so that "<file> was left out: <reason>." reads as a sentence. */
  readonly reason: string;
}

/** A left-out file as a sentence, which is how its reader says it to a person. */
export const leftOutSentence = ({ file, reason }: LeftOut): string => `${file} was left out: ${reason}.`;

/** A left-out file whose reader goes on with what it last read of it, saying so in its reason. */
export const stillKept = ({ file, reason }: LeftOut): LeftOut => ({ file, reason: `${reason}, so what was last read of it is kept` });

/** A Markdown file as a reader read it. */
export interface MarkdownFile {
  /** Where it is, as its reader names it, with `/` between folders. */
  readonly path: string;
  readonly text: string;
}

/** Whether the left-out `file` takes in `path`: it is that file, or a folder that holds it. */
export const takesIn = (file: string, path: string): boolean => path === file || path.startsWith(`${file}/`);

/**
 * The files of `previous` that `read` doesn't have and `leftOut` takes in, by
 * where `shown` says each is: what a reader goes on with when it can't read a
 * file it read before. A file that is gone isn't left out, and so isn't kept.
 */
export function stillHeld(
  previous: readonly MarkdownFile[],
  read: readonly MarkdownFile[],
  leftOut: readonly LeftOut[],
  shown: (path: string) => string = (path) => path,
): MarkdownFile[] {
  const have = new Set(read.map(({ path }) => path));
  return previous.filter(({ path }) => !have.has(path) && leftOut.some(({ file }) => takesIn(file, shown(path))));
}

/** Plain order of the characters, which does not change with the machine's language. */
export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Whether `name` is a Markdown file's: it ends in `.md`, whatever the case. */
export const isMarkdown = (name: string): boolean => name.toLowerCase().endsWith(".md");

/** The code a failure carries, such as `ENOENT`, or undefined when it has none. */
export function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Why an entry a folder lists could not be looked at, in a few words that
 * finish "<file> was left out: <reason>.": a link to nothing when what it names
 * is not there, and otherwise as `why` says.
 */
export function whyUnseen(error: unknown): string {
  return codeOf(error) === "ENOENT" ? "it is a link to nothing" : why(error);
}

/** Why a file could not be read, in a few words that finish "<file> was left out: <reason>." */
export function why(error: unknown): string {
  switch (codeOf(error)) {
    case "EACCES":
    case "EPERM":
      return "permission denied";
    case "EISDIR":
      return "it is a folder, not a file";
    case "ENOTDIR":
      return "it is not a folder";
    default:
      return asError(error).message;
  }
}
