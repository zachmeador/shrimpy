import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { saveFile } from "../../lib/files/node.ts";
import { type ConfigObject, parseConfig } from "../../lib/json-config/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import { beforeOpening, type Step, type StoreFormat } from "../../lib/migration/node.ts";
import type { WebPushPlace } from "../push/index.ts";

/**
 * A device of yours, which keeps a token and shows it to be you, with its
 * label: the name of the machine it joined from, or what a browser called
 * itself. Only a hash of the token is kept. A browser that asked to be told
 * things keeps where it is told them.
 */
export interface DeviceRecord {
  tokenHash: string;
  label: string;
  webPush?: WebPushPlace;
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

/** A change to the file: what turns the file at the version before into one at `version`. */
export interface RosterStep extends Step {
  migrate(file: Record<string, unknown>): Record<string, unknown>;
}

/** This release's format of the file. */
export const ROSTER_FORMAT: StoreFormat<RosterStep> = { current: 3, oldest: 3, steps: [] };

/** Where the roster is kept inside the gateway's data directory. */
export const rosterFile = (dataDir: string): string => join(dataDir, "state", "roster.json");

/**
 * The roster in the gateway's data directory, or undefined when there is no
 * file yet. A file at an older version of `format` is copied aside, brought up
 * to date and saved before it is read.
 */
export function readRoster(dataDir: string, format = ROSTER_FORMAT): RosterFile | undefined {
  const file = rosterFile(dataDir);
  let root = readConfig(file);
  if (root === undefined) return undefined;
  const steps = beforeOpening(
    {
      file,
      what: `The roster in ${dataDir}`,
      program: "the gateway",
      startingOver: "Whatever joined with an invitation, an agent or a machine of yours, needs a new one.",
      found: root.number("version"),
      format,
    },
    (to) => copyFileSync(file, to),
  );
  if (steps.length > 0) {
    const stored = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const migrated = steps.reduce((json, step) => step.migrate(json), stored);
    const text = formatted({ ...migrated, version: format.current });
    saveFile(file, text, { mode: 0o600 });
    root = parseConfig(text, file);
    root.number("version");
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
  const place = entry.optionalObject("webPush");
  entry.done();
  if (place === undefined) return { tokenHash, label };
  const webPush = { endpoint: place.string("endpoint"), p256dh: place.string("p256dh"), auth: place.string("auth") };
  place.done();
  return { tokenHash, label, webPush };
}

/** Write the roster whole, so that nobody reads half of it and a power cut leaves the old one or the new, readable only by its owner. */
export function writeRoster(file: string, roster: RosterFile, version: number): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  saveFile(file, formatted({ version, id: roster.id, members: roster.members }), { mode: 0o600 });
}

const formatted = (json: object): string => `${JSON.stringify(json, null, 2)}\n`;

