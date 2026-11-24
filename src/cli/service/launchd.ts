import { setTimeout as delay } from "node:timers/promises";
import { shellWord } from "../../lib/text/index.ts";
import { type Account, checked, runChecked } from "./account.ts";
import { type LaunchdService, type Program, STOP_SECONDS, type State, variablesOf, WRITTEN } from "./service.ts";

const xml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const unxml = (text: string): string => text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

/**
 * The LaunchAgent that runs the program for the folder, as soon as it is loaded. launchd starts it again when it
 * exits with a failure, and leaves it alone when it exits with success, which is what a stop and a run that found
 * everything running already end with. What it prints goes to a file.
 */
export function plist(service: LaunchdService, program: Program): string {
  const variables = variablesOf(service, program);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    `<!-- ${WRITTEN} -->`,
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${xml(service.name)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...program.argv.map((arg) => `    <string>${xml(arg)}</string>`),
    "  </array>",
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    ...variables.flatMap(([name, value]) => [`    <key>${xml(name)}</key>`, `    <string>${xml(value)}</string>`]),
    "  </dict>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <dict>",
    "    <key>SuccessfulExit</key>",
    "    <false/>",
    "  </dict>",
    "  <key>ExitTimeOut</key>",
    `  <integer>${String(STOP_SECONDS)}</integer>`,
    "  <key>StandardOutPath</key>",
    `  <string>${xml(service.log)}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${xml(service.log)}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/** What a LaunchAgent that `plist` wrote runs. */
export function readPlist(text: string): Program {
  const strings = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(text)?.[1] ?? "";
  const variable = (name: string): string | undefined => {
    const value = new RegExp(`<key>${name}</key>\\s*<string>([\\s\\S]*?)</string>`).exec(text)?.[1];
    return value === undefined ? undefined : unxml(value);
  };
  return {
    argv: [...strings.matchAll(/<string>([\s\S]*?)<\/string>/g)].map(([, arg = ""]) => unxml(arg)),
    path: variable("PATH"),
    lang: variable("LANG"),
  };
}

/** The account's graphical domain, which LaunchAgents are loaded into. */
const domain = (account: Account): string => `gui/${String(account.uid)}`;

/** The service in that domain. */
const target = (account: Account, service: LaunchdService): string => `${domain(account)}/${service.name}`;

/** What launchd prints about the service, or undefined when it has not loaded it. */
async function printed(account: Account, service: LaunchdService): Promise<string | undefined> {
  const answer = await account.run("launchctl", ["print", target(account, service)]);
  return answer.code === 0 ? answer.stdout : undefined;
}

/** Whether launchd has the service running: loaded, and its state `running`. */
export async function state(account: Account, service: LaunchdService): Promise<State> {
  const said = await printed(account, service);
  if (said === undefined) return { running: false, detail: "not loaded" };
  const how = /^\s*state = (.+)$/m.exec(said)?.[1]?.trim();
  if (how === "running") return { running: true, detail: how };
  return { running: false, detail: how === "not running" ? undefined : how };
}

/** Stop the service and unload it, if launchd has it loaded. */
export async function stop(account: Account, service: LaunchdService): Promise<void> {
  if ((await printed(account, service)) === undefined) return;
  await runChecked(account, "launchctl", ["bootout", target(account, service)]);
  // `bootout` can answer while the program is still stopping, and loading again fails until it has stopped.
  const until = Date.now() + (STOP_SECONDS + 5) * 1000;
  while ((await printed(account, service)) !== undefined) {
    if (Date.now() > until) {
      throw new Error(`launchd still has ${service.name} loaded, ${String(STOP_SECONDS + 5)} seconds after it was told to stop it.`);
    }
    await delay(250);
  }
}

/**
 * launchd loads an account's LaunchAgents only while the account is logged in, and loads them by itself at its next
 * login. So the LaunchAgent is in place, and nothing runs until then.
 */
export class NotLoggedInError extends Error {
  constructor(account: Account, service: LaunchdService) {
    super(
      `${account.user} isn't logged in to this Mac's desktop, and a LaunchAgent runs only while its account is. ` +
        `${service.file} is in place, and launchd starts it when ${account.user} next logs in.`,
    );
    this.name = "NotLoggedInError";
  }
}

/** Load the LaunchAgent, which starts the program. One that is loaded is stopped and loaded again, so that it runs the file as it is now. */
export async function start(account: Account, service: LaunchdService): Promise<void> {
  await stop(account, service);
  const bootstrap = ["bootstrap", domain(account), service.file];
  const loaded = await account.run("launchctl", bootstrap);
  // The account's graphical domain exists only while it is logged in, and launchctl's own error doesn't say so.
  if (loaded.code !== 0 && (await account.run("launchctl", ["print", domain(account)])).code !== 0) {
    throw new NotLoggedInError(account, service);
  }
  checked("launchctl", bootstrap, loaded);
}

/**
 * Start `program` in a session of its own, which launchd doesn't stop with the service, since it stops only the
 * service's own group of processes. It prints to the service's log. Says how to see what it prints.
 */
export async function restartApart(account: Account, service: LaunchdService, program: Program): Promise<string> {
  const [command, ...args] = program.argv;
  if (command === undefined) throw new Error("There is no command to restart the service with.");
  await account.detach(command, args, Object.fromEntries(variablesOf(service, program)), service.log);
  return `tail -f ${shellWord(service.log)}`;
}
