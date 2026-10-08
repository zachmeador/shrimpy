import { FOLDER_VARIABLE } from "../folder/index.ts";
import { type Account, type Ran, runChecked } from "./account.ts";
import { type Program, STOP_SECONDS, type State, type SystemdService } from "./service.ts";

/** `text` in double quotes as systemd reads them: with `\` and `"` escaped, and `%` written twice since it starts a specifier even there. */
const quoted = (text: string): string =>
  `"${text.replace(/[\\"]/g, (char) => `\\${char}`).replace(/\n/g, "\\n").replace(/\r/g, "\\r").replaceAll("%", "%%")}"`;

/** One word of a command line in a unit: as it is when systemd reads nothing in it, and quoted when it does. A `$` there starts a variable, so it is written twice. */
const word = (text: string): string =>
  /^[A-Za-z0-9_@+=:,./-]+$/.test(text) ? text : quoted(text.replaceAll("$", () => "$$"));

/**
 * The user unit that runs the program for the folder.
 *
 * It starts again five seconds after the program fails, which also covers a gateway whose address its network has
 * not brought up yet. `KillMode=mixed` sends the stop signal to `up` alone, so that `up` stops its agents, then the
 * chat server, then the gateway, one after another: by default every one of them would be told at once. Whatever
 * is left when the time to stop runs out is ended by force.
 */
export function unit(service: SystemdService, { argv, path }: Program): string {
  const variables: [string, string][] = [];
  if (path !== undefined && path !== "") variables.push(["PATH", path]);
  if (!service.plain) variables.push([FOLDER_VARIABLE, service.folder]);
  return [
    "# Written by shrimpy gateway install. Running it again writes this file again.",
    "[Unit]",
    `Description=Shrimpy for ${service.folder.replace(/[\r\n]+/g, " ").replaceAll("%", "%%")}`,
    "",
    "[Service]",
    `ExecStart=${argv.map(word).join(" ")}`,
    ...variables.map(([name, value]) => `Environment=${quoted(`${name}=${value}`)}`),
    "Restart=on-failure",
    "RestartSec=5",
    "KillMode=mixed",
    `TimeoutStopSec=${String(STOP_SECONDS)}`,
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

/** `message`, with where the account's own systemd is when what it says is that systemd could not be reached. */
function withWhereSystemdIs(message: string): string {
  return /Failed to connect to .*bus|XDG_RUNTIME_DIR/.test(message)
    ? `${message}\nsystemctl --user talks to the account's own systemd, which a login of the account has: run this in one, such as an ssh session.`
    : message;
}

/** `systemctl --user` with `args`, failing with what it said. */
async function systemctl(account: Account, ...args: string[]): Promise<Ran> {
  try {
    return await runChecked(account, "systemctl", ["--user", ...args]);
  } catch (error) {
    if (error instanceof Error) throw new Error(withWhereSystemdIs(error.message), { cause: error });
    throw error;
  }
}

/** Whether systemd has the service running. It can't say when it can't be asked. */
export async function state(account: Account, service: SystemdService): Promise<State> {
  const answer = await account.run("systemctl", ["--user", "is-active", service.name]);
  const said = answer.stdout.trim();
  if (said === "") {
    const why = answer.stderr.trim() || `exit code ${String(answer.code)}`;
    throw new Error(withWhereSystemdIs(`systemctl --user could not say: ${why}`));
  }
  return { running: answer.code === 0, detail: said };
}

/** Have systemd read the unit, start it at the account's login, and start it now, or restart it if it runs. */
export async function start(account: Account, service: SystemdService): Promise<void> {
  await systemctl(account, "daemon-reload");
  await systemctl(account, "enable", service.name);
  await systemctl(account, "restart", service.name);
}

/** Stop the service and have it not start at the account's login. */
export async function stop(account: Account, service: SystemdService): Promise<void> {
  await systemctl(account, "disable", "--now", service.name);
}

/** Have systemd forget a unit whose file has been removed. */
export async function forget(account: Account): Promise<void> {
  await systemctl(account, "daemon-reload");
}

/** Whether the account lingers: its systemd keeps running when nobody is logged in. */
export async function lingers(account: Account): Promise<boolean> {
  try {
    const answer = await account.run("loginctl", ["show-user", account.user, "--property=Linger"]);
    return answer.code === 0 && /^Linger=yes$/m.test(answer.stdout);
  } catch {
    // It can't be asked, so it isn't known to be on.
    return false;
  }
}

/** What was done about lingering. */
export type Lingering = { state: "was on" } | { state: "turned on" } | { state: "refused"; why: string };

/** Turn lingering on for the account unless it is on, without asking anyone for a password. */
export async function keepLingering(account: Account): Promise<Lingering> {
  if (await lingers(account)) return { state: "was on" };
  try {
    const answer = await account.run("loginctl", ["--no-ask-password", "enable-linger", account.user]);
    if (answer.code === 0) return { state: "turned on" };
    return { state: "refused", why: answer.stderr.trim() || answer.stdout.trim() || `exit code ${String(answer.code)}` };
  } catch (error) {
    return { state: "refused", why: error instanceof Error ? error.message : String(error) };
  }
}

/** The command that turns lingering on, for someone with administrator rights. */
export const enableLingering = (account: Account): string => `sudo loginctl enable-linger ${account.user}`;

/** The command that turns lingering off, for someone with administrator rights. */
export const disableLingering = (account: Account): string => `sudo loginctl disable-linger ${account.user}`;
