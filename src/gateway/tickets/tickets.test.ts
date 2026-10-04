import assert from "node:assert/strict";
import { test } from "node:test";
import { createTickets } from "./index.ts";

const chat = { kind: "chat", name: "chat" } as const;

test("a ticket stops being good after its time", () => {
  let now = 1_000;
  const tickets = createTickets({ now: () => now, ttlMs: 500 });
  const ticket = tickets.issue("mem_a", chat);
  const late = tickets.issue("mem_b", chat);

  now += 499;
  assert.deepEqual(tickets.redeem(ticket, chat), { ok: true, memberId: "mem_a" });
  now += 1;
  assert.deepEqual(tickets.redeem(late, chat), { ok: false, why: "invalid" });
});
