import { parseSigil } from "../../contracts/agent/index.ts";
import type { LeftOut } from "../../lib/files/index.ts";
import { readText } from "../../lib/files/node.ts";
import { shownIn } from "./files.ts";
import type { HomePaths } from "./layout.ts";

/** Why a `sigil` file that can be read is no sigil, in words that finish "sigil was left out: <reason>." */
const NOT_A_SIGIL = "it isn't twelve lines of twelve # or . characters";

/**
 * The twelve lines of the home's `sigil` file, or null when it is missing or
 * isn't a sigil. A file that is there and can't be used is named in `leftOut`,
 * so the agent hears of it.
 */
export async function readSigil(paths: HomePaths): Promise<{ lines: string[] | null; leftOut: LeftOut[] }> {
  const file = shownIn(paths.root, paths.sigil);
  const read = await readText(paths.sigil);
  if (read.kind === "missing") return { lines: null, leftOut: [] };
  if (read.kind === "unreadable") return { lines: null, leftOut: [{ file, reason: read.reason }] };
  const lines = parseSigil(read.text);
  return lines === undefined ? { lines: null, leftOut: [{ file, reason: NOT_A_SIGIL }] } : { lines, leftOut: [] };
}
