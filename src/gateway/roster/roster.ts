import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { isToken, type Member, TURNED_AWAY } from "../../contracts/gateway/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { type Lock, takeLock } from "../../lib/lock/node.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { type MemberRecord, readRoster, rosterFile, writeRoster } from "./file.ts";

/** Another gateway is already using this data directory. */
export class RosterOwnedError extends Error {
  constructor(dataDir: string, options?: ErrorOptions) {
    super(
      `Another gateway is using the roster in ${dataDir}. Use that gateway, or stop it before starting another.`,
      options,
    );
    this.name = "RosterOwnedError";
  }
}

/** Characters in a member's name. */
const MAX_NAME = 200;

/**
 * Who is on the network: every member with its ID, its name, whether it is an
 * admin and how it is recognized, kept in one file that survives restarts.
 * Nothing here holds a connection. Anything a caller got wrong is refused with a
 * reason it can act on.
 */
export interface Roster {
  /** Everyone, oldest first. */
  members(): Member[];
  member(id: string): Member | undefined;
  /** The agent whose token this is. */
  memberWithToken(token: string): Member | undefined;
  /** The person who is the operating system user `osUser`. */
  person(osUser: string): Member | undefined;
  /** Make the person for `osUser` if there is none yet. */
  ensurePerson(osUser: string): Member;
  /**
   * Make a new agent called `name` that is recognized by `token`, which the
   * caller made. When the roster has the member that holds the token already,
   * that is the member, renamed to `name` if it is not called that.
   */
  join(name: string, token: string): Member;
  /** Give a member a new name. The name it has already, or a change of case in it, is fine. */
  rename(id: string, name: string): Member;
  /** The name as it would be kept, when no member has it. A name that is not fit to keep, or that a member has, is refused. */
  vacant(name: string): string;
  /** Make an agent an admin, or an ordinary agent again. Doing what is done already changes nothing. A person is always one and is refused. */
  setAdmin(id: string, admin: boolean): Member;
  /** Let go of the data directory. */
  close(): void;
}

/**
 * Open the roster in `dataDir`, taking the directory for this process alone. A
 * file that cannot be read stops the gateway: guessing at who is who would be
 * worse.
 */
export function openRoster(dataDir: string): Roster {
  const lock = takeOwnerLock(dataDir);
  try {
    return keep(rosterFile(dataDir), lock);
  } catch (error) {
    lock.release();
    throw error;
  }
}

function takeOwnerLock(dataDir: string): Lock {
  const runtime = join(dataDir, "runtime");
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  return takeLock(join(runtime, "owner.lock"), (cause) => new RosterOwnedError(dataDir, { cause }));
}

const fold = (name: string): string => name.toLowerCase();

const hashOf = (token: string): string => `sha256:${createHash("sha256").update(token).digest("hex")}`;

const publicly = ({ id, kind, name, admin }: MemberRecord): Member => ({ id, kind, name, admin: kind === "person" || admin === true });

function keep(file: string, lock: Lock): Roster {
  let records = readRoster(file);
  const seen = new Map<string, string>();
  for (const record of records) {
    const clash = seen.get(fold(record.name));
    if (clash !== undefined) {
      throw new Error(`${file} gives the name "${record.name}" to ${clash} and to ${record.id}. Names are unique, whatever the case.`);
    }
    seen.set(fold(record.name), record.id);
  }

  const save = (next: MemberRecord[]): void => {
    writeRoster(file, next);
    records = next;
  };

  /** A name that is fit to keep, or a refusal that says what is wrong with it. */
  const checked = (name: unknown): string => {
    const label = typeof name === "string" ? name.trim() : "";
    if (label === "" || label.length > MAX_NAME || /\p{Cc}/u.test(label)) {
      refuse(`A name must be 1 to ${String(MAX_NAME)} characters on one line.`);
    }
    return label;
  };

  /** Refuse a name that another member than `except` has. */
  const available = (name: string, except?: string): void => {
    const holder = records.find((record) => record.id !== except && fold(record.name) === fold(name));
    if (holder === undefined) return;
    refuse(
      `The name "${name}" is taken: it belongs to ${holder.kind === "agent" ? "the agent" : "the person"} "${holder.name}". ` +
        "Names are shared by people and agents, whatever the case. Choose another.",
      "service_invalid_value",
      TURNED_AWAY.nameTaken,
    );
  };

  const find = (matches: (record: MemberRecord) => boolean): Member | undefined => {
    const record = records.find(matches);
    return record === undefined ? undefined : publicly(record);
  };

  const person = (osUser: string): Member | undefined =>
    find((record) => "osUser" in record.recognizedBy && record.recognizedBy.osUser === osUser);

  const memberWithToken = (token: string): Member | undefined => {
    const hash = hashOf(token);
    return find((record) => "tokenHash" in record.recognizedBy && record.recognizedBy.tokenHash === hash);
  };

  const rename = (id: string, name: string): Member => {
    const label = checked(name);
    const current = records.find((record) => record.id === id);
    if (current === undefined) refuse(`There is no member ${id}.`);
    if (current.name === label) return publicly(current);
    available(label, id);
    const renamed = { ...current, name: label };
    save(records.map((record) => (record.id === id ? renamed : record)));
    return publicly(renamed);
  };

  return {
    members: () => records.map(publicly),
    member: (id) => find((record) => record.id === id),
    memberWithToken,
    person,
    ensurePerson(osUser) {
      const existing = person(osUser);
      if (existing !== undefined) return existing;
      available(osUser);
      const record: MemberRecord = { id: newId("mem"), kind: "person", name: osUser, recognizedBy: { osUser } };
      save([...records, record]);
      return publicly(record);
    },
    join(name, token) {
      if (!isToken(token)) {
        refuse("A token is 32 to 200 letters, digits, hyphens or underscores, such as 32 random bytes in base64url.");
      }
      const holder = memberWithToken(token);
      if (holder !== undefined) return rename(holder.id, name);
      const label = checked(name);
      available(label);
      const record: MemberRecord = {
        id: newId("mem"),
        kind: "agent",
        name: label,
        admin: false,
        recognizedBy: { tokenHash: hashOf(token) },
      };
      save([...records, record]);
      return publicly(record);
    },
    rename,
    vacant(name) {
      const label = checked(name);
      available(label);
      return label;
    },
    setAdmin(id, admin) {
      const current = records.find((record) => record.id === id);
      if (current === undefined) refuse(`There is no member ${id}.`);
      if (current.kind === "person") refuse(`${current.name} is a person, and every person is an admin.`);
      if ((current.admin === true) === admin) return publicly(current);
      const changed = { ...current, admin };
      save(records.map((record) => (record.id === id ? changed : record)));
      return publicly(changed);
    },
    close: () => lock.release(),
  };
}
