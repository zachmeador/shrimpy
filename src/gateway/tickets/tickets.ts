import { randomBytes } from "node:crypto";
import type { ProgramName } from "../../contracts/gateway/index.ts";

/** How long a ticket is good for. A client hands it to the program at once. */
export const TICKET_MS = 30_000;

/** What redeeming a ticket came to. */
export type Redeemed =
  | { ok: true; memberId: string }
  /** `invalid` is a ticket that was never made, was used already, or has expired. */
  | { ok: false; why: "invalid" | "elsewhere" };

/**
 * Tickets in flight: what a client gets to hand to a program, so that the
 * program can ask who the client is. A ticket is good for one member, one
 * program, one use and a short time. They are kept in memory only, so a
 * gateway that restarts forgets them, and whoever held one asks again.
 */
export interface Tickets {
  /** A new ticket that says `memberId`, for `program` only. */
  issue(memberId: string, program: ProgramName): string;
  /**
   * Spend a ticket on behalf of `program`. A program the ticket is not for
   * does not spend it: the one it is for still can.
   */
  redeem(ticket: string, program: ProgramName): Redeemed;
  /** Whether a ticket is good for `program` now. Nothing is spent: the program spends it when the client hands it over. */
  check(ticket: string, program: ProgramName): boolean;
}

export interface TicketsOptions {
  /** The clock, in milliseconds. Tests move it. */
  now?: () => number;
  ttlMs?: number;
}

interface Issued {
  memberId: string;
  program: ProgramName;
  expires: number;
}

export function createTickets(options: TicketsOptions = {}): Tickets {
  const now = options.now ?? (() => Date.now());
  const ttl = options.ttlMs ?? TICKET_MS;
  const issued = new Map<string, Issued>();

  return {
    issue(memberId, program) {
      // Whatever nobody redeemed in time is forgotten as new tickets come.
      for (const [ticket, each] of issued) if (each.expires <= now()) issued.delete(ticket);
      const ticket = randomBytes(24).toString("base64url");
      issued.set(ticket, { memberId, program: { kind: program.kind, name: program.name }, expires: now() + ttl });
      return ticket;
    },
    redeem(ticket, program) {
      const found = issued.get(ticket);
      if (found === undefined || found.expires <= now()) {
        issued.delete(ticket);
        return { ok: false, why: "invalid" };
      }
      if (found.program.kind !== program.kind || found.program.name !== program.name) {
        return { ok: false, why: "elsewhere" };
      }
      issued.delete(ticket);
      return { ok: true, memberId: found.memberId };
    },
    check(ticket, program) {
      const found = issued.get(ticket);
      return (
        found !== undefined &&
        found.expires > now() &&
        found.program.kind === program.kind &&
        found.program.name === program.name
      );
    },
  };
}
