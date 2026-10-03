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

/** What `assert.throws` should find when the chat server refuses a call in this process, whose reason matches `message`. */
export const refused = (message: RegExp, code = "service_invalid_value") => ({
  name: "Refusal",
  code,
  message,
});

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
