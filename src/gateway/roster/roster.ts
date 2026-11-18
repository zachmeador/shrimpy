import { createHash } from "node:crypto";
import {
  type Answer,
  done,
  fitName,
  isToken,
  type Member,
  NAME_RULE,
  nameKey,
  noMember,
  type Refused,
  refused,
  type Way,
  type WayIn,
} from "../../contracts/gateway/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { listed } from "../../lib/text/index.ts";
import { type DeviceRecord, type MemberRecord, readRoster, rosterFile, writeRoster } from "./file.ts";

const TOKEN_RULE = "A token is 32 to 200 letters, digits, hyphens or underscores, such as 32 random bytes in base64url.";

/** A member who showed a token, and the way in the token is. */
export interface Recognized {
  readonly member: Member;
  readonly way: Extract<Way, { kind: "device" | "token" }>;
}

/**
 * Who is on the network: every member with its ID, its name, whether it is an
 * admin and its ways in, kept in one file that survives restarts. Nothing here
 * holds a connection. What a caller got wrong is answered with a refusal.
 */
export interface Roster {
  /** Everyone, oldest first. */
  members(): Member[];
  member(id: string): Member | undefined;
  /** You: the one person there is. */
  you(): Member;
  /** Who shows `token`: an agent by its token, or you by a device's. */
  recognize(token: string): Recognized | undefined;
  /**
   * Make a new agent called `name` that is recognized by `token`, which the
   * caller made. The first agent a roster has is an admin from the moment it
   * joins, and any other is not. When the roster has the agent that holds the
   * token already, that is the agent, renamed to `name` if it is not called
   * that.
   */
  join(name: string, token: string): Answer<Member>;
  /**
   * Let a device of the person `id` in: keep the hash of the token it made,
   * with `label`. A device that is in already is the same device. A token is
   * one member's, so one that an agent has is refused.
   */
  addDevice(id: string, token: string, label: string): Answer<Member>;
  /** Give a member a new name. The name it has already, or a change of case in it, is fine. */
  rename(id: string, name: string): Answer<Member>;
  /** The name as it would be kept, when no member has it. */
  vacant(name: string): Answer<string>;
  /** Make an agent an admin, or an ordinary agent again. Doing what is done already changes nothing. A person is always one. */
  setAdmin(id: string, admin: boolean): Answer<Member>;
  /** Every way in a token opens, oldest member first. */
  ways(): WayIn[];
  /** Forget the token of the way `id`, so it opens nothing from now on. Says which way it was, or undefined for none. */
  takeBack(id: string): WayIn | undefined;
  /** Hear of every change, after it is written. */
  onChange(listener: () => void): () => void;
}

const hashOf = (token: string): string => `sha256:${createHash("sha256").update(token).digest("hex")}`;

/** A way's ID, from its token's hash: it means nothing, never changes and gives nothing of the token away. */
const wayId = (tokenHash: string): string => `way_${tokenHash.slice("sha256:".length, "sha256:".length + 12)}`;

const publicly = (record: MemberRecord): Member => ({
  id: record.id,
  kind: record.kind,
  name: record.name,
  admin: record.kind === "person" || record.admin,
});

/**
 * Open the roster in `dataDir`, which the gateway holds. A roster with nobody
 * for you yet, as when the gateway first makes its data, gets you, called
 * `firstName`. A file that cannot be read stops the gateway, and so does one
 * with a second person, or a first name another member has: guessing at who is
 * who would be worse.
 */
export function openRoster(dataDir: string, firstName: string): Roster {
  const file = rosterFile(dataDir);
  let records = readRoster(dataDir);
  const seen = new Map<string, string>();
  for (const record of records) {
    const clash = seen.get(nameKey(record.name));
    if (clash !== undefined) {
      throw new Error(`${file} gives the name "${record.name}" to ${clash} and to ${record.id}. Names are unique, whatever the case.`);
    }
    seen.set(nameKey(record.name), record.id);
  }
  const people = records.filter((record) => record.kind === "person");
  if (people.length > 1) {
    const named = people.map((person) => `"${person.name}" (${person.id})`);
    throw new Error(
      `${file} has more than one person on it: ${listed(named)}. ` +
        "A gateway has one person, you: keep yours, take the others out of the file, and start the gateway again.",
    );
  }
  const listeners = new Set<() => void>();

  const save = (next: MemberRecord[]): void => {
    writeRoster(file, next);
    records = next;
    for (const listener of [...listeners]) listener();
  };

  const replace = (changed: MemberRecord): void => save(records.map((record) => (record.id === changed.id ? changed : record)));

  /** Why `name` can't be the name of a member other than `except`, if it can't. */
  const unavailable = (name: string, except?: string): Refused | undefined => {
    const holder = records.find((record) => record.id !== except && nameKey(record.name) === nameKey(name));
    if (holder === undefined) return undefined;
    return refused(
      `The name "${name}" is taken: it belongs to ${holder.kind === "agent" ? "the agent" : "the person"} "${holder.name}". ` +
        "Names are shared by people and agents, whatever the case. Choose another.",
      "name_taken",
    );
  };

  const badName = refused(`A name ${NAME_RULE}.`);

  // You are made with the roster, and found from then on as the one person there is, whoever the gateway runs as.
  if (people.length === 0) {
    const taken = unavailable(firstName);
    if (taken !== undefined) throw new Error(taken.words);
    save([...records, { id: newId("mem"), kind: "person", name: firstName, recognizedBy: {} }]);
  }
  // Nothing takes you off the roster.
  const you = (): Member => publicly(records.find((record) => record.kind === "person")!);

  const recognize = (token: string): Recognized | undefined => {
    const hash = hashOf(token);
    for (const record of records) {
      if (record.kind === "agent" && record.recognizedBy.tokenHash === hash) {
        return { member: publicly(record), way: { kind: "token", id: wayId(hash) } };
      }
      if (record.kind === "person" && (record.recognizedBy.machines ?? []).some((device) => device.tokenHash === hash)) {
        return { member: publicly(record), way: { kind: "device", id: wayId(hash) } };
      }
    }
    return undefined;
  };

  const rename = (id: string, name: string): Answer<Member> => {
    const label = fitName(name);
    if (label === undefined) return badName;
    const current = records.find((record) => record.id === id);
    if (current === undefined) return refused(noMember(id));
    if (current.name === label) return done(publicly(current));
    const taken = unavailable(label, id);
    if (taken !== undefined) return taken;
    const renamed = { ...current, name: label };
    replace(renamed);
    return done(publicly(renamed));
  };

  const ways = (): WayIn[] =>
    records.flatMap((record): WayIn[] => {
      if (record.kind === "agent") {
        const hash = record.recognizedBy.tokenHash;
        return hash === undefined ? [] : [{ id: wayId(hash), kind: "token", member: record.id, label: null }];
      }
      return (record.recognizedBy.machines ?? []).map((device) => ({
        id: wayId(device.tokenHash),
        kind: "device",
        member: record.id,
        label: device.label,
      }));
    });

  return {
    members: () => records.map(publicly),
    member(id) {
      const record = records.find((each) => each.id === id);
      return record === undefined ? undefined : publicly(record);
    },
    you,
    recognize,
    join(name, token) {
      if (!isToken(token)) return refused(TOKEN_RULE);
      const holder = recognize(token);
      if (holder?.way.kind === "token") return rename(holder.member.id, name);
      if (holder !== undefined) return refused("That token belongs to a device of yours, and a token belongs to one member.");
      const label = fitName(name);
      if (label === undefined) return badName;
      const taken = unavailable(label);
      if (taken !== undefined) return taken;
      const record: MemberRecord = {
        id: newId("mem"),
        kind: "agent",
        name: label,
        admin: !records.some((each) => each.kind === "agent"),
        recognizedBy: { tokenHash: hashOf(token) },
      };
      save([...records, record]);
      return done(publicly(record));
    },
    addDevice(id, token, label) {
      if (!isToken(token)) return refused(TOKEN_RULE);
      const current = records.find((record) => record.id === id);
      if (current?.kind !== "person") return refused(`There is no person ${id}.`);
      const holder = recognize(token);
      if (holder?.way.kind === "token") return refused("That token belongs to an agent, and a token belongs to one member.");
      if (holder !== undefined) return done(holder.member);
      const kept = fitName(label);
      if (kept === undefined) {
        return refused(`A device is labelled with the name of the machine it joins from, which ${NAME_RULE}.`);
      }
      const device: DeviceRecord = { tokenHash: hashOf(token), label: kept };
      const by = current.recognizedBy;
      replace({ ...current, recognizedBy: { ...by, machines: [...(by.machines ?? []), device] } });
      return done(publicly(current));
    },
    rename,
    vacant(name) {
      const label = fitName(name);
      if (label === undefined) return badName;
      return unavailable(label) ?? done(label);
    },
    setAdmin(id, admin) {
      const current = records.find((record) => record.id === id);
      if (current === undefined) return refused(noMember(id));
      if (current.kind === "person") return refused(`${current.name} is a person, and every person is an admin.`);
      if (current.admin === admin) return done(publicly(current));
      const changed = { ...current, admin };
      replace(changed);
      return done(publicly(changed));
    },
    ways,
    takeBack(id) {
      const way = ways().find((each) => each.id === id);
      if (way === undefined) return undefined;
      const current = records.find((record) => record.id === way.member);
      if (current?.kind === "agent") replace({ ...current, recognizedBy: {} });
      if (current?.kind === "person") {
        const by = current.recognizedBy;
        const machines = (by.machines ?? []).filter((device) => wayId(device.tokenHash) !== id);
        replace({ ...current, recognizedBy: { ...by, machines } });
      }
      return way;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
