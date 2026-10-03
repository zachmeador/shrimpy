import type { Member } from "../../contracts/chat/index.ts";

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

/** A clock that only moves when told to, one second apart by default. */
export function fakeClock(start = 1_700_000_000_000): { now(): number; advance(ms?: number): void } {
  let time = start;
  return {
    now: () => time,
    advance(ms = 1000) {
      time += ms;
    },
  };
}
