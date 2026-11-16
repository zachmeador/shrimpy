import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { saveFile } from "../../lib/files/node.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import type { Entry } from "../gateway/index.ts";
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
  const entry = root.optionalObject("gateway");
  let gateway: Entry | undefined;
  if (entry !== undefined) {
    const host = entry.string("host");
    const port = entry.number("port");
    const fingerprint = entry.string("fingerprint");
    entry.done();
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw entry.problem("port", "must be a port number from 1 to 65535");
    }
    gateway = { host, port, fingerprint };
  }
  root.done();
  return {
    token,
    ...(memberId === undefined ? {} : { memberId }),
    ...(gateway === undefined ? {} : { gateway }),
  };
}

/** Keep the membership in the home, whole or not at all, readable only by its owner. */
export function saveMembership(home: string, membership: Membership): void {
  const file = membershipFile(home);
  mkdirSync(dirname(file), { recursive: true });
  saveFile(file, `${JSON.stringify(membership, null, 2)}\n`, { mode: 0o600 });
}
