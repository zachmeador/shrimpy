import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Member } from "../../contracts/gateway/index.ts";
import type { ConfigObject } from "../../lib/json-config/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";

/**
 * A machine of a person's own, which keeps a token and shows it to be that
 * person. Only a hash of the token is kept.
 */
export interface MachineRecord {
  tokenHash: string;
}

/**
 * How a member is recognized. A person is the operating system user of the
 * gateway's own socket, and also each of the person's machines that shows the
 * token it keeps, if the person has any: a file written before there were
 * machines has none, and that is all it means. An agent is whoever presents its
 * token. Only a hash of a token is kept: the token itself is shown to the
 * gateway and never stored.
 */
export type Recognition = { osUser: string; machines?: MachineRecord[] } | { tokenHash: string };

/**
 * A member as the roster keeps it. Every person is an admin and the file does
 * not say so, so only an agent's record has `admin`. A file written before the
 * role existed has none, and every agent in it is not an admin.
 */
export interface MemberRecord extends Omit<Member, "admin"> {
  recognizedBy: Recognition;
  admin?: boolean;
}

/** The file's format. A roster of any other version is refused, never changed. */
const VERSION = 1;

/** Where the roster is kept inside the gateway's data directory. */
export const rosterFile = (dataDir: string): string => join(dataDir, "state", "roster.json");

/** The members in the file, oldest first, or none when there is no file yet. */
export function readRoster(file: string): MemberRecord[] {
  const root = readConfig(file);
  if (root === undefined) return [];
  const version = root.number("version");
  if (version !== VERSION) {
    throw new Error(`${file} is version ${String(version)}, and this gateway reads version ${String(VERSION)}.`);
  }
  const members = root.objects("members").map(parseMember);
  root.done();
  return members;
}

function parseMember(entry: ConfigObject): MemberRecord {
  const id = entry.string("id");
  const kind = entry.choice("kind", ["person", "agent"] as const);
  const name = entry.string("name");
  const admin = kind === "agent" ? (entry.optionalBoolean("admin") ?? false) : undefined;
  const by = entry.object("recognizedBy");
  const osUser = by.optionalString("osUser");
  const tokenHash = by.optionalString("tokenHash");
  const machines = by.optionalObjects("machines")?.map(parseMachine);
  by.done();
  entry.done();
  if (kind === "person" && osUser !== undefined && tokenHash === undefined) {
    return { id, kind, name, recognizedBy: { osUser, ...(machines === undefined ? {} : { machines }) } };
  }
  if (kind === "agent" && tokenHash !== undefined && osUser === undefined && machines === undefined) {
    return { id, kind, name, admin: admin === true, recognizedBy: { tokenHash } };
  }
  throw entry.problem(
    "recognizedBy",
    `must be an osUser, with machines if it has any, for a person and a tokenHash for an agent, and this is the ${kind} ${name}`,
  );
}

function parseMachine(entry: ConfigObject): MachineRecord {
  const tokenHash = entry.string("tokenHash");
  entry.done();
  return { tokenHash };
}

/**
 * Write the roster whole or not at all, so nobody reads half of it, and only
 * its owner can read it. The file is flushed before it takes its place, so a
 * power cut leaves the old roster or the new one.
 */
export function writeRoster(file: string, members: readonly MemberRecord[]): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const unfinished = `${file}.${String(process.pid)}`;
  const descriptor = openSync(unfinished, "w", 0o600);
  try {
    writeSync(descriptor, `${JSON.stringify({ version: VERSION, members }, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(unfinished, file);
}
