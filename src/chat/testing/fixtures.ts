import type { Member, Receipt } from "../../contracts/chat/index.ts";

/** `person("Zach")` is `person:zach`. */
export const person = (name: string): Member => ({
  id: `person:${name.toLowerCase()}`,
  kind: "person",
  name,
});

/** `agent("Shrimpy")` is `agent:shrimpy`. */
export const agent = (name: string): Member => ({
  id: `agent:${name.toLowerCase()}`,
  kind: "agent",
  name,
});

/** What an agent gives `leaveReceipt`: `outcome("answered", { reply: message.id })`. */
export const outcome = (
  status: Receipt["status"],
  given: { reply?: string; detail?: string } = {},
): Omit<Receipt, "memberId"> => ({ status, reply: given.reply ?? null, detail: given.detail ?? null });

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
