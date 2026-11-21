import { randomInt } from "node:crypto";
import { nameKey } from "../../contracts/gateway/index.ts";

/** How long an invitation is good for. */
const INVITATION_MS = 15 * 60_000;

/** What a code is made of: digits and capitals that can't be mistaken for one another, so no 0, 1, I, L, O or U. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 8;

/**
 * What asking whether a code is good came to. A good code comes with `name`
 * (the spelling the invitation was made for), `member` (the existing agent's
 * member ID when the invitation replaces its token, or null for a new agent),
 * and `spend`, which uses it up once the member has joined or been given its
 * new token. `unknown` is a code that the gateway never made, that ran out or
 * that is for someone else.
 */
export type Checked = { ok: true; name: string; member: string | null; spend(): void } | { ok: false; why: "unknown" | "used" };

/** What asking about a code for a device came to: as `Checked`, with the person the device is let in as. */
export type CheckedForDevice = { ok: true; person: string; spend(): void } | { ok: false; why: "unknown" | "used" };

/** A new code, and when it stops being good in milliseconds since the epoch. */
export interface Issued {
  /** Written like `K7Q2-9FXD`. */
  code: string;
  expires: number;
}

/**
 * The invitations in flight: a code that lets one agent in from apart (as a new
 * agent for one name, or to replace an existing agent's token), or one device
 * of yours, for you. A code is good once and for a short time, and only for
 * what it was made for, so whoever holds one can't take another. They are kept
 * in memory only, so a gateway that restarts forgets them, and whoever held one
 * asks for another.
 */
export interface Invitations {
  /** A new code for an agent called `name`, replacing `member`'s token when non-null or making a new agent when null. */
  issue(name: string, member?: string | null): Issued;
  /** A new code for a device of the person `memberId`, who is who the device is from then on. */
  issueForDevice(memberId: string): Issued;
  /** Whether `code` is good for an agent called `name` now (case-insensitively). Nothing is spent. */
  check(code: unknown, name: unknown): Checked;
  /** Whether `code` is good for a device now, read as `check` reads it, and nothing is spent. */
  checkForDevice(code: unknown): CheckedForDevice;
  /** Drop any unspent invitations targeting the existing agent `memberId`, as when that agent is removed. */
  forgetMember(memberId: string): void;
}

export interface InvitationsOptions {
  /** The clock, in milliseconds. Tests move it. */
  now?: () => number;
  ttlMs?: number;
}

/** Who a code lets in: an agent by its name (and existing member ID when replacing a token), or a device of the person. */
type Whom = { agent: string; member: string | null } | { person: string };

interface Entry {
  whom: Whom;
  expires: number;
  used: boolean;
}

export function createInvitations(options: InvitationsOptions = {}): Invitations {
  const now = options.now ?? (() => Date.now());
  const ttl = options.ttlMs ?? INVITATION_MS;
  // Kept by the code in capitals with no hyphen.
  const issued = new Map<string, Entry>();

  const forgetWhatRanOut = (): void => {
    for (const [key, each] of issued) if (each.expires <= now()) issued.delete(key);
  };

  const make = (whom: Whom): Issued => {
    forgetWhatRanOut();
    let key = newKey();
    while (issued.has(key)) key = newKey();
    const expires = now() + ttl;
    issued.set(key, { whom, expires, used: false });
    return { code: `${key.slice(0, 4)}-${key.slice(4)}`, expires };
  };

  const find = (code: unknown): Entry | undefined => {
    forgetWhatRanOut();
    return typeof code === "string" ? issued.get(code.replace(/[\s-]/g, "").toUpperCase()) : undefined;
  };

  return {
    issue: (name, member = null) => make({ agent: name, member }),
    issueForDevice: (memberId) => make({ person: memberId }),
    check(code, name) {
      const found = find(code);
      if (
        found === undefined ||
        !("agent" in found.whom) ||
        typeof name !== "string" ||
        nameKey(found.whom.agent) !== nameKey(name)
      ) {
        return { ok: false, why: "unknown" };
      }
      if (found.used) return { ok: false, why: "used" };
      return {
        ok: true,
        name: found.whom.agent,
        member: found.whom.member,
        spend() {
          found.used = true;
        },
      };
    },
    checkForDevice(code) {
      const found = find(code);
      if (found === undefined || !("person" in found.whom)) return { ok: false, why: "unknown" };
      if (found.used) return { ok: false, why: "used" };
      return {
        ok: true,
        person: found.whom.person,
        spend() {
          found.used = true;
        },
      };
    },
    forgetMember(memberId) {
      for (const [key, entry] of issued) {
        if ("agent" in entry.whom && entry.whom.member === memberId && !entry.used) issued.delete(key);
      }
    },
  };
}

function newKey(): string {
  return Array.from({ length: LENGTH }, () => ALPHABET.charAt(randomInt(ALPHABET.length))).join("");
}
