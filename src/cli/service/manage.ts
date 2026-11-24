import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { saveFile } from "../../lib/files/node.ts";
import type { Account } from "./account.ts";
import * as launchd from "./launchd.ts";
import { filesOf, type Program, type Service, type State, WRITTEN } from "./service.ts";
import * as systemd from "./systemd.ts";

/** Whether the manager has the service running. It rejects when the manager can't be asked. */
export function stateOf(account: Account, service: Service): Promise<State> {
  return service.manager === "systemd" ? systemd.state(account, service) : launchd.state(account, service);
}

/**
 * Write the service's file, then have the manager start it, or start it again if it runs, so that it runs the file
 * as it is now. Says whether the file was there already, which makes this an update.
 */
export async function put(account: Account, service: Service, program: Program): Promise<{ updated: boolean }> {
  const updated = existsSync(service.file);
  mkdirSync(dirname(service.file), { recursive: true });
  if (service.manager === "systemd") {
    saveFile(service.file, systemd.unit(service, program));
    await systemd.start(account, service);
  } else {
    mkdirSync(dirname(service.log), { recursive: true });
    saveFile(service.file, launchd.plist(service, program));
    await launchd.start(account, service);
  }
  return { updated };
}

/** Stop the service, then remove its file. Nothing else is removed: not the log, and not lingering. */
export async function remove(account: Account, service: Service): Promise<void> {
  if (service.manager === "systemd") {
    await systemd.stop(account, service);
    rmSync(service.file);
    await systemd.forget(account);
  } else {
    await launchd.stop(account, service);
    rmSync(service.file);
  }
}

/** What each service that `shrimpy install` wrote on the account runs, by its file, whichever folder it is for. */
export function installedPrograms(account: Account): Map<string, Program> {
  const programs = new Map<string, Program>();
  const files = filesOf(account);
  if (files === undefined || !existsSync(files.folder)) return programs;
  for (const name of readdirSync(files.folder)) {
    if (!name.startsWith("shrimpy") || !name.endsWith(files.ending)) continue;
    const file = join(files.folder, name);
    const text = readFileSync(file, "utf8");
    if (!text.includes(WRITTEN)) continue;
    programs.set(file, account.platform === "linux" ? systemd.readUnit(text) : launchd.readPlist(text));
  }
  return programs;
}

/**
 * Start `program`, which restarts the service, apart from the service, so that it isn't stopped with the programs
 * the service runs, and don't wait for it. It runs with the service's variables. Says how to see what it prints.
 */
export function restartApart(account: Account, service: Service, program: Program): Promise<string> {
  return service.manager === "systemd" ? systemd.restartApart(account, service, program) : launchd.restartApart(account, service, program);
}
