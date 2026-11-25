import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { saveFile } from "../../lib/files/node.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import { readEntry } from "../gateway/index.ts";
import { type Membership, membershipFile } from "./membership.ts";

/**
 * The membership the agent of `home` keeps, or undefined if it has not made
 * one yet. A file that is there and cannot be used is an error naming it,
 * because starting again as a new member would be a different agent.
 */
export function readMembership(home: string): Membership | undefined {
  const file = membershipFile(home);
  const root = readConfig(file);
  if (root === undefined) return undefined;
  const token = root.string("token");
  const memberId = root.optionalString("memberId");
  const rosterId = root.optionalString("rosterId");
  const entry = root.optionalObject("gateway");
  const gateway = entry === undefined ? undefined : readEntry(entry);
  const pending = root.optionalObject("joining");
  let joining: Membership["joining"];
  if (pending !== undefined) {
    const pendingToken = pending.string("token");
    const pendingGateway = readEntry(pending.object("gateway"));
    pending.done();
    joining = { token: pendingToken, gateway: pendingGateway };
  }
  const gone = root.optionalObject("removed");
  let removed: Membership["removed"];
  if (gone !== undefined) {
    removed = { at: gone.number("at"), words: gone.text("words") };
    gone.done();
  }
  root.done();
  return {
    token,
    ...(memberId === undefined ? {} : { memberId }),
    ...(rosterId === undefined ? {} : { rosterId }),
    ...(gateway === undefined ? {} : { gateway }),
    ...(joining === undefined ? {} : { joining }),
    ...(removed === undefined ? {} : { removed }),
  };
}

/** Keep the membership in the home, whole or not at all, readable only by its owner. */
export function saveMembership(home: string, membership: Membership): void {
  const file = membershipFile(home);
  mkdirSync(dirname(file), { recursive: true });
  saveFile(file, `${JSON.stringify(membership, null, 2)}\n`, { mode: 0o600 });
}
