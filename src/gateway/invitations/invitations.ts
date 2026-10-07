import { randomInt } from "node:crypto";

/** How long an invitation is good for. */
export const INVITATION_MS = 15 * 60_000;

/** What a code is made of: digits and capitals that can't be mistaken for one another, so no 0, 1, I, L, O or U. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 8;

/**
 * What asking whether a code is good came to. A good code comes with `spend`,
 * which uses it up, for the caller to do once the member it lets in has been
 * made. `unknown` is a code that the gateway never made, that ran out or that
 * is for someone else.
 */
export type Checked = { ok: true; spend(): void } | { ok: false; why: "unknown" | "used" };

/** What asking about a code for a machine of a person's own came to: as `Checked`, with the person the machine is let in as. */
export type CheckedForMachine = { ok: true; person: string; spend(): void } | { ok: false; why: "unknown" | "used" };

/** A new code, and when it stops being good in milliseconds since the epoch. */
export interface Issued {
  /** Written like `K7Q2-9FXD`. */
  code: string;
  expires: number;
}

/**
 * The invitations in flight: a code that lets one agent in from apart, for one
 * name, or one machine of a person's own, for that person. A code is good once
 * and for a short time, and only for what it was made for, so whoever holds one
 * can't take another. They are kept in memory only, so a gateway that restarts
 * forgets them, and whoever held one asks for another.
 */
export interface Invitations {
  /** A new code for an agent called `name`. */
  issue(name: string): Issued;
  /** A new code for a machine of the person `memberId`, who is who the machine is from then on. */
  issueForMachine(memberId: string): Issued;
  /** Whether `code` is good for an agent called `name` now. It is read without regard to case or the hyphen, and nothing is spent. */
  check(code: unknown, name: unknown): Checked;
  /** Whether `code` is good for a machine of a person now, read as `check` reads it, and nothing is spent. */
  checkForMachine(code: unknown): CheckedForMachine;
}

export interface InvitationsOptions {
  /** The clock, in milliseconds. Tests move it. */
  now?: () => number;
  ttlMs?: number;
}

/** Who a code lets in: an agent by its name, or a machine of the person who has this member ID. */
type Whom = { agent: string } | { person: string };

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
    issue: (name) => make({ agent: name }),
    issueForMachine: (memberId) => make({ person: memberId }),
    check(code, name) {
      const found = find(code);
      if (found === undefined || !("agent" in found.whom) || found.whom.agent !== name) return { ok: false, why: "unknown" };
      if (found.used) return { ok: false, why: "used" };
      return {
        ok: true,
        spend() {
          found.used = true;
        },
      };
    },
    checkForMachine(code) {
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
  };
}

function newKey(): string {
  return Array.from({ length: LENGTH }, () => ALPHABET.charAt(randomInt(ALPHABET.length))).join("");
}
