import { asError } from "../errors/index.ts";

/** A file that a reader left out of what it read, and why. */
export interface LeftOut {
  /** Where the file is, as its reader names it to whoever it tells. */
  readonly file: string;
  /** Short, so that "<file> was left out: <reason>." reads as a sentence. */
  readonly reason: string;
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
