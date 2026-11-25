import { arch, hostname, type, userInfo } from "node:os";
import type { Machine } from "./where.ts";

/** What people call each system Node names. */
const SYSTEMS: Readonly<Record<string, string>> = { Darwin: "macOS", Linux: "Linux", Windows_NT: "Windows" };

/** Where this program runs, as its hello says it. An account with no name, as in a container that runs a bare user ID, is that ID. */
export function thisMachine(): Machine {
  let account: string;
  try {
    account = userInfo().username;
  } catch {
    account = String(process.getuid?.() ?? "");
  }
  return { host: hostname(), system: `${SYSTEMS[type()] ?? type()} ${arch()}`, account };
}
