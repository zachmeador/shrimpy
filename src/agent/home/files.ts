import { readFile } from "node:fs/promises";

/** A file the agent was not given, and why. */
export interface LeftOut {
  /** Where it is inside the home, with `/` between folders, or its absolute path when it is not in the home. */
  readonly file: string;
  /** Short, so that "<file> was left out: <reason>." reads as a sentence. */
  readonly reason: string;
}

/** What reading a text file found. A file that is not there is not a problem; one that cannot be used is. */
export type Read =
  | { kind: "text"; text: string }
  | { kind: "missing" }
  | { kind: "unreadable"; reason: string };

export async function readText(path: string): Promise<Read> {
  try {
    const text = await readFile(path, "utf8");
    return text.includes("\0") ? { kind: "unreadable", reason: "it is not text" } : { kind: "text", text };
  } catch (error) {
    return codeOf(error) === "ENOENT" ? { kind: "missing" } : { kind: "unreadable", reason: why(error) };
  }
}

/** Plain order of the characters, which does not change with the machine's language. */
export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
      return error instanceof Error ? error.message : String(error);
  }
}
