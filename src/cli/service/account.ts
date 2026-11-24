import { execFile, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname } from "node:path";

/** How a command of the service manager ended. */
export interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * The account that a service is for: where its files go, what runs a command of the service manager and what starts
 * a process apart from the service, which a test hands in so that nothing reaches the real ones, and the facts about
 * the account and the shell the command runs in that a service is made from.
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
  /** The LANG of the shell that runs the command, which a LaunchAgent is given. */
  readonly lang: string | undefined;
  /**
   * Run a command of the service manager, as the account, and say how it ended. A command that ends with a failure
   * is an answer. One that can't be run at all rejects.
   */
  run(command: string, args: string[]): Promise<Ran>;
  /**
   * Start a command in a session of its own, with `variables` added to this process's environment, printing to the
   * file `log`, and don't wait for it. It rejects when the command can't be started.
   */
  detach(command: string, args: string[], variables: Record<string, string>, log: string): Promise<void>;
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

function detach(command: string, args: string[], variables: Record<string, string>, log: string): Promise<void> {
  mkdirSync(dirname(log), { recursive: true });
  const output = openSync(log, "a");
  try {
    const child = spawn(command, args, { detached: true, stdio: ["ignore", output, output], env: { ...process.env, ...variables } });
    return new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  } finally {
    // The child has its own copy of the file by now.
    closeSync(output);
  }
}

/** The account that runs this command, with the machine's own service manager. */
export function thisAccount(): Account {
  const { username, uid } = userInfo();
  const { PATH: path, LANG: lang } = process.env;
  return { platform: process.platform, home: homedir(), user: username, uid, path, lang, run: execute, detach };
}

/** Run a command of the service manager, and fail with what it said when it did not end well. */
export async function runChecked(account: Account, command: string, args: string[]): Promise<Ran> {
  return checked(command, args, await account.run(command, args));
}

/** How a command of the service manager ended, or an error with what it said when it did not end well. */
export function checked(command: string, args: string[], answer: Ran): Ran {
  if (answer.code === 0) return answer;
  const said = answer.stderr.trim() || answer.stdout.trim();
  const typed = [command, ...args].join(" ");
  throw new Error(`${typed} failed${said === "" ? ` (exit code ${String(answer.code)})` : `: ${said}`}`);
}
