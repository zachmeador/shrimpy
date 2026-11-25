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
  type Where,
} from "../../contracts/gateway/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { listed } from "../../lib/text/index.ts";
import type { WebPushPlace } from "../push/index.ts";
import { type DeviceRecord, type MemberRecord, ROSTER_FORMAT, type RemovedRecord, readRoster, rosterFile, writeRoster } from "./file.ts";

const TOKEN_RULE = "A token is 32 to 200 letters, digits, hyphens or underscores, such as 32 random bytes in base64url.";

/** A member who showed a token, and the way in the token is. */
export interface Recognized {
  readonly member: Member;
  readonly way: Extract<Way, { kind: "device" | "token" }>;
}

/** An agent removed from the roster: its ID, the name it had, and when, in milliseconds since the epoch. */
export interface Removed {
  readonly id: string;
  readonly name: string;
  readonly removedAt: number;
}

/**
 * Who is on the network: every member with its ID, its name, whether it is an
 * admin and its ways in, kept in one file that survives restarts. Nothing here
 * holds a connection. What a caller got wrong is answered with a refusal.
 */
export interface Roster {
  /** The roster's ID, made with it and never changed. */
  readonly id: string;
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
   * token already, that is the agent, unchanged (the roster owns the name).
   */
  join(name: string, token: string): Answer<Member>;
  /**
   * Put `token` on the existing agent `id` in place of any token it had,
   * keeping its ID, name and admin role. Says which way was replaced, if any.
   */
  replaceToken(id: string, token: string): Answer<{ member: Member; replacedWay: string | undefined }>;
  /**
   * Let a device of the person `id` in: keep the hash of the token it made,
   * with `label`. A device that is in already is the same device. A token is
   * one member's, so one that an agent has is refused.
   */
  addDevice(id: string, token: string, label: string): Answer<Member>;
  /** Give a member a new name (used for your name from `settings.json`). The name it has already, or a change of case in it, is fine. */
  rename(id: string, name: string): Answer<Member>;
  /**
   * Remove an agent from the roster, ending its ways in and freeing its name;
   * a later agent taking the name gets a fresh ID. The roster keeps its ID,
   * the name it had, its token's hash and when. A person cannot be removed.
   */
  remove(id: string): Answer<Member>;
  /** The removed agent whose token was `token` when it was removed, if one was. */
  removedWith(token: string): Removed | undefined;
  /**
   * Who an invitation for `name` would let in: a new agent (`member: null`)
   * when nobody has the name, or an existing agent (`member: id`, with its
   * roster spelling) to replace its token. Naming a person is refused.
   */
  canInvite(name: string): Answer<{ name: string; member: string | null }>;
  /** Make an agent an admin, or an ordinary agent again. Doing what is done already changes nothing. A person is always one. */
  setAdmin(id: string, admin: boolean): Answer<Member>;
  /** Every way in a token opens, oldest member first. */
  ways(): WayIn[];
  /**
   * Forget the token of the way `id`, so it opens nothing from now on, and for
   * a device, where it is told things. Says which way it was, or undefined for
   * none.
   */
  takeBack(id: string): WayIn | undefined;
  /** Keep where the device of yours that shows `token` is told things, in place of where it was. False when no device of yours shows it. */
  keepWebPush(token: string, place: WebPushPlace): boolean;
  /** Where each device of yours that has such a place is told things, by its way in. */
  webPushPlaces(): { way: string; place: WebPushPlace }[];
  /** Forget where the device of the way `id` is told things, if it is still `endpoint`. */
  forgetWebPush(id: string, endpoint: string): void;
  /**
   * Keep where the agent `id` lives, as the hello of the link it began at `at`
   * said, so that an agent that is off still says where it lives.
   */
  linked(id: string, where: Where, at: number): void;
  /** The agent `id`'s link ended at `at`. */
  unlinked(id: string, at: number): void;
  /** Where the agent `id` lives and when it was last linked, as far as the roster knows: none of either for a person. */
  placeOf(id: string): { where: Where | null; lastLinked: number | null };
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
 * who would be worse. The file's format is this release's, unless a test gives
 * the next release's.
 */
export function openRoster(dataDir: string, firstName: string, format = ROSTER_FORMAT): Roster {
  const file = rosterFile(dataDir);
  const loaded = readRoster(dataDir, format);
  const rosterId = loaded?.id ?? newId("ros");
  let records = loaded?.members ?? [];
  let removed: RemovedRecord[] = loaded?.removed ?? [];
  // A removed agent's ID is never used again, and its name is free.
  const seenIds = new Set<string>();
  for (const { id } of [...records, ...removed]) {
    if (seenIds.has(id)) throw new Error(`${file} uses the member ID ${id} more than once. Member IDs are unique.`);
    seenIds.add(id);
  }
  const seenNames = new Map<string, string>();
  for (const record of records) {
    const clash = seenNames.get(nameKey(record.name));
    if (clash !== undefined) {
      throw new Error(`${file} gives the name "${record.name}" to ${clash} and to ${record.id}. Names are unique, whatever the case.`);
    }
    seenNames.set(nameKey(record.name), record.id);
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

  const save = (next: MemberRecord[], nextRemoved = removed): void => {
    writeRoster(file, { id: rosterId, members: next, removed: nextRemoved }, format.current);
    records = next;
    removed = nextRemoved;
    for (const listener of [...listeners]) listener();
  };

  const replace = (changed: MemberRecord): void => save(records.map((record) => (record.id === changed.id ? changed : record)));

  /** Mint a member ID that no member has, and no removed agent had. */
  const mintMemberId = (): string => {
    const used = (id: string): boolean => records.some((record) => record.id === id) || removed.some((record) => record.id === id);
    let id = newId("mem");
    while (used(id)) id = newId("mem");
    return id;
  };

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
    save([...records, { id: mintMemberId(), kind: "person", name: firstName, recognizedBy: {} }]);
  }
  /** Your record. Nothing takes you off the roster. */
  const yours = (): Extract<MemberRecord, { kind: "person" }> =>
    records.find((record): record is Extract<MemberRecord, { kind: "person" }> => record.kind === "person")!;
  const you = (): Member => publicly(yours());

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

  /** Change the device of yours whose way is `id`, keeping the change unless `change` gives the device back as it was. False when there is none. */
  const changeDevice = (id: string, change: (device: DeviceRecord) => DeviceRecord): boolean => {
    const person = yours();
    const devices = person.recognizedBy.machines ?? [];
    const device = devices.find((each) => wayId(each.tokenHash) === id);
    if (device === undefined) return false;
    const changed = change(device);
    if (changed === device) return true;
    replace({ ...person, recognizedBy: { ...person.recognizedBy, machines: devices.map((each) => (each === device ? changed : each)) } });
    return true;
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
    id: rosterId,
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
      if (holder?.way.kind === "token") return done(holder.member);
      if (holder !== undefined) return refused("That token belongs to a device of yours, and a token belongs to one member.");
      const label = fitName(name);
      if (label === undefined) return badName;
      const taken = unavailable(label);
      if (taken !== undefined) return taken;
      const record: MemberRecord = {
        id: mintMemberId(),
        kind: "agent",
        name: label,
        admin: !records.some((each) => each.kind === "agent"),
        recognizedBy: { tokenHash: hashOf(token) },
      };
      save([...records, record]);
      return done(publicly(record));
    },
    replaceToken(id, token) {
      if (!isToken(token)) return refused(TOKEN_RULE);
      const current = records.find((record) => record.id === id);
      if (current === undefined) return refused(noMember(id));
      if (current.kind !== "agent") return refused(`${current.name} is a person, not an agent.`);
      const holder = recognize(token);
      if (holder !== undefined) {
        if (holder.member.id === id) return done({ member: publicly(current), replacedWay: undefined });
        return refused("That token belongs to another member, and a token belongs to one member.");
      }
      const previous = current.recognizedBy.tokenHash;
      const replacedWay = previous === undefined ? undefined : wayId(previous);
      const updated: MemberRecord = { ...current, recognizedBy: { tokenHash: hashOf(token) } };
      replace(updated);
      return done({ member: publicly(updated), replacedWay });
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
    remove(id) {
      const current = records.find((record) => record.id === id);
      if (current === undefined) return refused(noMember(id));
      if (current.kind === "person") return refused(`${current.name} is a person, and a gateway always has its one person.`);
      const { tokenHash } = current.recognizedBy;
      const gone: RemovedRecord = { id, name: current.name, ...(tokenHash === undefined ? {} : { tokenHash }), removedAt: Date.now() };
      save(
        records.filter((record) => record.id !== id),
        [...removed, gone],
      );
      return done(publicly(current));
    },
    removedWith(token) {
      const hash = hashOf(token);
      const gone = removed.find((record) => record.tokenHash === hash);
      return gone === undefined ? undefined : { id: gone.id, name: gone.name, removedAt: gone.removedAt };
    },
    canInvite(name) {
      const label = fitName(name);
      if (label === undefined) return badName;
      const holder = records.find((record) => nameKey(record.name) === nameKey(label));
      if (holder === undefined) return done({ name: label, member: null });
      if (holder.kind === "person") return unavailable(label)!;
      return done({ name: holder.name, member: holder.id });
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
    keepWebPush(token, place) {
      const found = recognize(token);
      if (found?.way.kind !== "device") return false;
      return changeDevice(found.way.id, (device) => {
        const kept = device.webPush;
        const same = kept?.endpoint === place.endpoint && kept.p256dh === place.p256dh && kept.auth === place.auth;
        return same ? device : { ...device, webPush: place };
      });
    },
    webPushPlaces: () =>
      (yours().recognizedBy.machines ?? []).flatMap((device) =>
        device.webPush === undefined ? [] : [{ way: wayId(device.tokenHash), place: device.webPush }],
      ),
    forgetWebPush(id, endpoint) {
      changeDevice(id, (device) => {
        if (device.webPush?.endpoint !== endpoint) return device;
        const { webPush: _forgotten, ...rest } = device;
        return rest;
      });
    },
    linked(id, where, at) {
      const current = records.find((record) => record.id === id);
      if (current?.kind === "agent") replace({ ...current, where, lastLinked: at });
    },
    unlinked(id, at) {
      const current = records.find((record) => record.id === id);
      if (current?.kind === "agent") replace({ ...current, lastLinked: at });
    },
    placeOf(id) {
      const current = records.find((record) => record.id === id);
      if (current?.kind !== "agent") return { where: null, lastLinked: null };
      return { where: current.where ?? null, lastLinked: current.lastLinked ?? null };
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
