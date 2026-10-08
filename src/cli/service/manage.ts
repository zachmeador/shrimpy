import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Account } from "./account.ts";
import * as launchd from "./launchd.ts";
import type { Program, Service, State } from "./service.ts";
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
    writeFileSync(service.file, systemd.unit(service, program));
    await systemd.start(account, service);
  } else {
    mkdirSync(dirname(service.log), { recursive: true });
    writeFileSync(service.file, launchd.plist(service, program));
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
