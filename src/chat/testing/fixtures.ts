import type { Member, Receipt } from "../../contracts/chat/index.ts";
import { newId } from "../../lib/ids/index.ts";

const made = new Map<string, Member>();

/**
 * A member for a test that works on the store directly, with no gateway to say
 * who anyone is. Asking again for the same kind and name gives the same member,
 * with an ID of its own that means nothing, as a roster would mint.
 */
function member(kind: Member["kind"], name: string): Member {
  const key = `${kind} ${name}`;
  let found = made.get(key);
  if (found === undefined) {
    found = { id: newId("mem"), kind, name };
    made.set(key, found);
  }
  return found;
}

/** A person called `name`. */
export const person = (name: string): Member => member("person", name);

/** An agent called `name`. */
export const agent = (name: string): Member => member("agent", name);

/** What an agent gives `leaveReceipt`: `outcome("answered", { reply: message.id })`. */
export const outcome = (
  status: Receipt["status"],
  given: { reply?: string; detail?: string } = {},
): Omit<Receipt, "memberId" | "event"> => ({ status, reply: given.reply ?? null, detail: given.detail ?? null });

export interface Clock {
  readonly now: () => number;
  advance(ms?: number): void;
}

/** A clock that only moves when told to, one second apart by default. */
export function fakeClock(start = 1_700_000_000_000): Clock {
  let time = start;
  return {
    now: () => time,
    advance(ms = 1000) {
      time += ms;
    },
  };
}
