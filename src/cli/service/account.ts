import { execFile } from "node:child_process";
import { homedir, userInfo } from "node:os";

/** How a command of the service manager ended. */
export interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * The account that a service is for: where its files go and what runs a command of the service manager, which a
 * test hands in so that nothing reaches the real ones, and the facts about the account and the shell the command
 * runs in that a service is made from.
 */
export interface Account {
  /** The operating system, as `process.platform` names it. */
  readonly platform: NodeJS.Platform;
  /** The account's own folder, which service files and logs are put under. */
  readonly home: string;
  /** The account's user name, which lingering is turned on for. */
  readonly user: string;
  /** The account's numeric user ID, which launchd names the account's domain by. */
  readonly uid: number;
  /** The PATH of the shell that runs the command, which the service is given. */
  readonly path: string | undefined;
  /**
   * Run a command of the service manager, as the account, and say how it ended. A command that ends with a failure
   * is an answer. One that can't be run at all rejects.
   */
  run(command: string, args: string[]): Promise<Ran>;
}

/** Longer than any command of the service manager should take, since a stop waits for the programs to stop. */
const LONGEST_MS = 60_000;

function execute(command: string, args: string[]): Promise<Ran> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", timeout: LONGEST_MS }, (error, stdout, stderr) => {
      if (error === null) return resolve({ code: 0, stdout, stderr });
      if (error.code === "ENOENT") {
        return reject(new Error(`${command} is not installed here, or is not on the PATH.`, { cause: error }));
      }
      if (error.killed) return reject(new Error(`${command} did not answer within a minute.`, { cause: error }));
      resolve({ code: typeof error.code === "number" ? error.code : 1, stdout, stderr });
    });
  });
}

/** The account that runs this command, with the machine's own service manager. */
export function thisAccount(): Account {
  const { username, uid } = userInfo();
  return { platform: process.platform, home: homedir(), user: username, uid, path: process.env.PATH, run: execute };
}

/** Run a command of the service manager, and fail with what it said when it did not end well. */
export async function runChecked(account: Account, command: string, args: string[]): Promise<Ran> {
  const answer = await account.run(command, args);
  if (answer.code === 0) return answer;
  const said = answer.stderr.trim() || answer.stdout.trim();
  const typed = [command, ...args].join(" ");
  throw new Error(`${typed} failed${said === "" ? ` (exit code ${String(answer.code)})` : `: ${said}`}`);
}
