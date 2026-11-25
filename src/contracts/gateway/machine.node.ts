import { mkdirSync } from "node:fs";
import { saveFile } from "../../lib/files/node.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import { readEntry } from "./address.ts";
import { type MachineMembership, machineFile } from "./machine.ts";

/**
 * What the machine whose Shrimpy folder is `folder` keeps, or undefined if it
 * has kept nothing yet. A file that is there and cannot be used is an error
 * naming it, because making a new token would be a different machine.
 */
export function readMachine(folder: string): MachineMembership | undefined {
  const root = readConfig(machineFile(folder));
  if (root === undefined) return undefined;
  const token = root.string("token");
  const gateway = readEntry(root.object("gateway"));
  const who = root.optionalObject("member");
  let member: MachineMembership["member"];
  if (who !== undefined) {
    member = { id: who.string("id"), name: who.string("name") };
    who.done();
  }
  root.done();
  return { token, gateway, ...(member === undefined ? {} : { member }) };
}

/**
 * Keep what the machine knows in its Shrimpy folder, whole or not at all and
 * readable only by its owner, since the token in it is all that makes the
 * machine the person.
 */
export function saveMachine(folder: string, machine: MachineMembership): void {
  const file = machineFile(folder);
  mkdirSync(folder, { recursive: true });
  saveFile(file, `${JSON.stringify(machine, null, 2)}\n`, { mode: 0o600 });
}
