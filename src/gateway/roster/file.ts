import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { saveFile } from "../../lib/files/node.ts";
import type { ConfigObject } from "../../lib/json-config/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";

/**
 * A device of yours, which keeps a token and shows it to be you, with its
 * label: the name of the machine it joined from. Only a hash of the token is
 * kept.
 */
export interface DeviceRecord {
  tokenHash: string;
  label: string;
}

/**
 * A member as the roster keeps it. You are the one person: on the gateway's
 * own socket you show no token, and elsewhere you are recognized by each of
 * your devices' tokens. An agent is recognized by its token, until it is taken
 * back. Only a hash of a token is kept. Every person is an admin and the file
 * does not say so; an agent's record says whether it is one.
 */
export type MemberRecord =
  | { id: string; kind: "person"; name: string; recognizedBy: { machines?: DeviceRecord[] } }
  | { id: string; kind: "agent"; name: string; admin: boolean; recognizedBy: { tokenHash?: string } };

/** The roster as kept in its file: its own ID and active members, oldest first. */
export interface RosterFile {
  id: string;
  members: MemberRecord[];
}

/** The file's format. A roster of any other version is refused, never changed. */
const VERSION = 3;

/** Where the roster is kept inside the gateway's data directory. */
export const rosterFile = (dataDir: string): string => join(dataDir, "state", "roster.json");

/** The roster in the gateway's data directory, or undefined when there is no file yet. */
export function readRoster(dataDir: string): RosterFile | undefined {
  const root = readConfig(rosterFile(dataDir));
  if (root === undefined) return undefined;
  if (root.number("version") !== VERSION) {
    throw new Error(
      `The roster in ${dataDir} was written by another version of Shrimpy, and nothing converts it. ` +
        `Move ${dataDir} into an archive folder, and start the gateway again. ` +
        "Whatever joined with an invitation, an agent or a machine of yours, needs a new one.",
    );
  }
  const id = root.string("id");
  const members = root.objects("members").map(parseMember);
  root.done();
  return { id, members };
}

function parseMember(entry: ConfigObject): MemberRecord {
  const id = entry.string("id");
  const kind = entry.choice("kind", ["person", "agent"] as const);
  const name = entry.string("name");
  const admin = kind === "agent" ? entry.optionalBoolean("admin") : undefined;
  const by = entry.object("recognizedBy");
  const tokenHash = by.optionalString("tokenHash");
  const machines = by.optionalObjects("machines")?.map(parseDevice);
  by.done();
  entry.done();
  if (kind === "person" && tokenHash === undefined) {
    return { id, kind, name, recognizedBy: machines === undefined ? {} : { machines } };
  }
  if (kind === "agent" && machines === undefined) {
    if (admin === undefined) throw entry.problem("admin", "is required for an agent");
    return { id, kind, name, admin, recognizedBy: tokenHash === undefined ? {} : { tokenHash } };
  }
  throw entry.problem(
    "recognizedBy",
    `must be machines or nothing for a person, and a tokenHash or nothing for an agent, and this is the ${kind} ${name}`,
  );
}

function parseDevice(entry: ConfigObject): DeviceRecord {
  const tokenHash = entry.string("tokenHash");
  const label = entry.string("label");
  entry.done();
  return { tokenHash, label };
}

/** Write the roster whole, so that nobody reads half of it and a power cut leaves the old one or the new, readable only by its owner. */
export function writeRoster(file: string, roster: RosterFile): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  saveFile(file, `${JSON.stringify({ version: VERSION, id: roster.id, members: roster.members }, null, 2)}\n`, { mode: 0o600 });
}
