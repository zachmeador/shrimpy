import { ConfigError } from "../../lib/json-config/index.ts";
import { type LeftOut, readText, replaceFile } from "./files.node.ts";
import type { HomePaths } from "./layout.node.ts";
import { loadHome } from "./load.node.ts";
import { parseWake, type WakePolicy, type WakeSettings } from "./wake.ts";

/** What the wake file is called, as a message about it says. */
const FILE = "wake.json";

/** The settings of a home that has a wake file that checks out, or a home that has none; or the file, left out, and why. */
export type WakeRead = { kind: "settings"; settings: WakeSettings } | { kind: "left out"; leftOut: LeftOut };

/** Read the home's wake file. A home with none sets nothing, and a file that cannot be used is left out and named. */
export async function readWake(paths: HomePaths): Promise<WakeRead> {
  const read = await readText(paths.wake);
  if (read.kind === "missing") return { kind: "settings", settings: {} };
  if (read.kind === "unreadable") return { kind: "left out", leftOut: { file: FILE, reason: read.reason } };
  try {
    return { kind: "settings", settings: parseWake(read.text, paths.wake) };
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // The message names the file and ends with a full stop; a left-out file's reason finishes "<file> was left out: ".
    return { kind: "left out", leftOut: { file: FILE, reason: error.message.replace(`${paths.wake}: `, "").replace(/\.$/, "") } };
  }
}

/**
 * Set the policy of a room in the home's wake file, in place of any it had,
 * written whole so that nobody reading it at the same moment sees half of it.
 * A file that does not check out is not written over: the error says why, and
 * the file is for a person to fix. Gives the settings as they are now.
 */
export async function saveWake(home: string, room: string, policy: WakePolicy): Promise<{ file: string; settings: WakeSettings }> {
  const { paths } = loadHome(home);
  const read = await readWake(paths);
  if (read.kind === "left out") {
    throw new Error(`${FILE} was not changed, because it does not check out: ${read.leftOut.reason}. Fix it by hand, or delete it.`);
  }
  const wanted = room.toLowerCase();
  const others = Object.entries(read.settings).filter(([name]) => name.toLowerCase() !== wanted);
  const settings: WakeSettings = { ...Object.fromEntries(others), [room]: policy };
  await replaceFile(paths.wake, `${JSON.stringify({ rooms: settings }, null, 2)}\n`);
  return { file: paths.wake, settings };
}
