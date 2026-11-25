import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { saveFile } from "../../lib/files/node.ts";
import { type ConfigObject, parseConfig } from "../../lib/json-config/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import { beforeOpening, type Step, type StoreFormat } from "../../lib/migration/node.ts";
import type { Where } from "../../contracts/gateway/index.ts";
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
 * does not say so; an agent's record says whether it is one. An agent's record
 * keeps where its latest hello came from and when the gateway last saw it
 * linked, once it has linked.
 */
export type MemberRecord =
  | { id: string; kind: "person"; name: string; recognizedBy: { machines?: DeviceRecord[] } }
  | { id: string; kind: "agent"; name: string; admin: boolean; recognizedBy: { tokenHash?: string }; where?: Where; lastLinked?: number };

/**
 * An agent removed from the roster: its ID, which is never used again, the
 * name it had, which is free, the hash of the token it had then, if it had
 * one, so that a hello showing it is told the agent was removed, and when.
 */
export interface RemovedRecord {
  id: string;
  name: string;
  tokenHash?: string;
  removedAt: number;
}

/** The roster as kept in its file: its own ID, its members, oldest first, and the agents removed from it, in the order they were. */
export interface RosterFile {
  id: string;
  members: MemberRecord[];
  removed: RemovedRecord[];
}

/** A change to the file: what turns the file at the version before into one at `version`. */
export interface RosterStep extends Step {
  migrate(file: Record<string, unknown>): Record<string, unknown>;
}

/** 2.0.0 keeps the agents removed from the roster, and where each agent links from and when, which it says at its next hello. */
const TO_2_0: RosterStep = { version: 4, migrate: (file) => ({ ...file, removed: [] }) };

/** This release's format of the file. */
export const ROSTER_FORMAT: StoreFormat<RosterStep> = { current: 4, oldest: 3, steps: [TO_2_0] };

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
  const removed = root.objects("removed").map(parseRemoved);
  root.done();
  return { id, members, removed };
}

function parseRemoved(entry: ConfigObject): RemovedRecord {
  const id = entry.string("id");
  const name = entry.string("name");
  const tokenHash = entry.optionalString("tokenHash");
  const removedAt = entry.number("removedAt");
  entry.done();
  return { id, name, ...(tokenHash === undefined ? {} : { tokenHash }), removedAt };
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
  const where = kind === "agent" ? parseWhere(entry.optionalObject("where")) : undefined;
  const lastLinked = kind === "agent" ? entry.optionalNumber("lastLinked") : undefined;
  entry.done();
  if (kind === "person" && tokenHash === undefined) {
    return { id, kind, name, recognizedBy: machines === undefined ? {} : { machines } };
  }
  if (kind === "agent" && machines === undefined) {
    if (admin === undefined) throw entry.problem("admin", "is required for an agent");
    return {
      id,
      kind,
      name,
      admin,
      recognizedBy: tokenHash === undefined ? {} : { tokenHash },
      ...(where === undefined ? {} : { where }),
      ...(lastLinked === undefined ? {} : { lastLinked }),
    };
  }
  throw entry.problem(
    "recognizedBy",
    `must be machines or nothing for a person, and a tokenHash or nothing for an agent, and this is the ${kind} ${name}`,
  );
}

function parseWhere(entry: ConfigObject | undefined): Where | undefined {
  if (entry === undefined) return undefined;
  const at = entry.object("machine");
  const machine = { host: at.text("host"), system: at.text("system"), account: at.text("account") };
  at.done();
  const home = entry.string("home");
  entry.done();
  return { machine, home };
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
  saveFile(file, formatted({ version, id: roster.id, members: roster.members, removed: roster.removed }), { mode: 0o600 });
}

const formatted = (json: object): string => `${JSON.stringify(json, null, 2)}\n`;

