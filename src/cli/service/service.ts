import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { defaultFolderPath } from "../folder/index.ts";
import type { Account } from "./account.ts";

/**
 * How long the manager gives a stop before it ends the program by force. `up` stops the agents first, and an agent
 * gives running turns up to five seconds to finish before it closes, then `up` stops the chat server and the gateway.
 */
export const STOP_SECONDS = 30;

/** What a service has whichever manager keeps it. */
interface Kept {
  /** What the manager calls it: `shrimpy.service` to systemd, and `shrimpy` to launchd. */
  readonly name: string;
  /** The unit or the LaunchAgent, in the account's own folder. */
  readonly file: string;
  /** The Shrimpy folder it runs `shrimpy up` for. */
  readonly folder: string;
  /** Whether that is the folder Shrimpy uses when `SHRIMPY_DIR` is not set, which has the plain name and needs no `SHRIMPY_DIR`. */
  readonly plain: boolean;
}

/** A systemd user unit, on Linux. systemd keeps what a service prints in its journal. */
export interface SystemdService extends Kept {
  readonly manager: "systemd";
  readonly log: undefined;
}

/** A LaunchAgent, on macOS, which launchd is told to print to a file. */
export interface LaunchdService extends Kept {
  readonly manager: "launchd";
  /** The file it prints to. */
  readonly log: string;
}

/** The service that keeps one Shrimpy folder running. */
export type Service = SystemdService | LaunchdService;

/** What a service runs. */
export interface Program {
  /** The command and its arguments. */
  readonly argv: string[];
  /** The PATH it runs with, when there is one to give it. */
  readonly path: string | undefined;
}

/** Whether the manager has the service running, and the word it used for how it is: `active`, `failed`, `not loaded`. */
export interface State {
  readonly running: boolean;
  readonly detail: string;
}

/**
 * The name of the service for `folder`, without the manager's suffix. The default folder's is the plain `shrimpy`.
 * Any other folder's is made from the folder: its last part, to be read, and a few characters of a hash of its whole
 * path, to tell two folders of one name apart. So two folders never share a service.
 */
function nameFor(folder: string, plain: boolean): string {
  if (plain) return "shrimpy";
  const last = basename(folder)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const hash = createHash("sha256").update(folder).digest("hex").slice(0, 8);
  return last === "" ? `shrimpy-${hash}` : `shrimpy-${last}-${hash}`;
}

/** The service for `folder` on this account, or undefined when its operating system has no manager Shrimpy knows. */
export function serviceFor(account: Account, folder: string): Service | undefined {
  const plain = folder === defaultFolderPath(account.home);
  const name = nameFor(folder, plain);
  if (account.platform === "linux") {
    const file = join(account.home, ".config", "systemd", "user", `${name}.service`);
    return { manager: "systemd", name: `${name}.service`, file, log: undefined, folder, plain };
  }
  if (account.platform === "darwin") {
    const file = join(account.home, "Library", "LaunchAgents", `${name}.plist`);
    return { manager: "launchd", name, file, log: join(account.home, "Library", "Logs", `${name}.log`), folder, plain };
  }
  return undefined;
}
