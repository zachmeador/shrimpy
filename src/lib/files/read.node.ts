import { readFile } from "node:fs/promises";
import { codeOf, why } from "./files.ts";

/** What reading a text file found. A file that is not there is not a problem; one that cannot be used is. */
export type Read =
  | { kind: "text"; text: string }
  | { kind: "missing" }
  | { kind: "unreadable"; reason: string };

/** Read `path` as text. A file with a NUL in it is not text. */
export async function readText(path: string): Promise<Read> {
  try {
    const text = await readFile(path, "utf8");
    return text.includes("\0") ? { kind: "unreadable", reason: "it is not text" } : { kind: "text", text };
  } catch (error) {
    return codeOf(error) === "ENOENT" ? { kind: "missing" } : { kind: "unreadable", reason: why(error) };
  }
}
