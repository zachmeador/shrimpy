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
 * is for another name.
 */
export type Checked = { ok: true; spend(): void } | { ok: false; why: "unknown" | "used" };

/**
 * The invitations in flight: a code for one name that lets one agent in from
 * apart. A code is good once, for a short time and for that name only. They are
 * kept in memory only, so a gateway that restarts forgets them, and whoever
 * held one asks for another.
 */
export interface Invitations {
  /** A new code for `name`, written like `K7Q2-9FXD`, and when it stops being good in milliseconds since the epoch. */
  issue(name: string): { code: string; expires: number };
  /** Whether `code` is good for `name` now. It is read without regard to case or the hyphen, and nothing is spent. */
  check(code: unknown, name: unknown): Checked;
}

export interface InvitationsOptions {
  /** The clock, in milliseconds. Tests move it. */
  now?: () => number;
  ttlMs?: number;
}

interface Issued {
  name: string;
  expires: number;
  used: boolean;
}

export function createInvitations(options: InvitationsOptions = {}): Invitations {
  const now = options.now ?? (() => Date.now());
  const ttl = options.ttlMs ?? INVITATION_MS;
  // Kept by the code in capitals with no hyphen.
  const issued = new Map<string, Issued>();

  const forgetWhatRanOut = (): void => {
    for (const [key, each] of issued) if (each.expires <= now()) issued.delete(key);
  };

  return {
    issue(name) {
      forgetWhatRanOut();
      let key = newKey();
      while (issued.has(key)) key = newKey();
      const expires = now() + ttl;
      issued.set(key, { name, expires, used: false });
      return { code: `${key.slice(0, 4)}-${key.slice(4)}`, expires };
    },
    check(code, name) {
      forgetWhatRanOut();
      const found = typeof code === "string" ? issued.get(code.replace(/[\s-]/g, "").toUpperCase()) : undefined;
      if (found === undefined || found.name !== name) return { ok: false, why: "unknown" };
      if (found.used) return { ok: false, why: "used" };
      return {
        ok: true,
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
