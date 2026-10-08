import { setTimeout as delay } from "node:timers/promises";
import { FOLDER_VARIABLE } from "../folder/index.ts";
import { type Account, runChecked } from "./account.ts";
import { type LaunchdService, type Program, STOP_SECONDS, type State } from "./service.ts";

const xml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * The LaunchAgent that runs the program for the folder, as soon as it is loaded. launchd starts it again when it
 * exits with a failure, and leaves it alone when it exits with success, which is what a stop and a run that found
 * everything running already end with. What it prints goes to a file.
 */
export function plist(service: LaunchdService, { argv, path }: Program): string {
  const variables: [string, string][] = [];
  if (path !== undefined && path !== "") variables.push(["PATH", path]);
  if (!service.plain) variables.push([FOLDER_VARIABLE, service.folder]);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    "<!-- Written by shrimpy gateway install. Running it again writes this file again. -->",
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${xml(service.name)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...argv.map((arg) => `    <string>${xml(arg)}</string>`),
    "  </array>",
    ...(variables.length === 0
      ? []
      : [
          "  <key>EnvironmentVariables</key>",
          "  <dict>",
          ...variables.flatMap(([name, value]) => [`    <key>${xml(name)}</key>`, `    <string>${xml(value)}</string>`]),
          "  </dict>",
        ]),
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
  const how = /^\s*state = (\S+)/m.exec(said)?.[1] ?? "loaded";
  return { running: how === "running", detail: how };
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

/** Load the LaunchAgent, which starts the program. One that is loaded is stopped and loaded again, so that it runs the file as it is now. */
export async function start(account: Account, service: LaunchdService): Promise<void> {
  await stop(account, service);
  await runChecked(account, "launchctl", ["bootstrap", domain(account), service.file]);
}
