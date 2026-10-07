import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createCalls } from "./index.ts";

/** A call that is made and not yet answered fails when it ends, and nobody is awaiting it yet: it is handled here, and asserted on later. */
function held<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

test("a call is told to its agent once and oldest first, answered once, and ends with its agent or with whoever asked", async () => {
  const calls = createCalls();
  const crab = {};
  const rex = {};
  const staying = new AbortController().signal;
  const first = held(calls.make(crab, staying));
  const second = held(calls.make(crab, staying));
  const forRex = held(calls.make(rex, staying));

  // Each agent is told of its own calls, in the order they were made.
  const [one, two, ...others] = await calls.next(crab);
  assert.ok(one !== undefined && two !== undefined && one !== two);
  assert.deepEqual(others, []);
  const [forRexId, ...rexOthers] = await calls.next(rex);
  assert.ok(forRexId !== undefined && forRexId !== one && forRexId !== two);
  assert.deepEqual(rexOthers, []);

  // What was told is not told again: the next ask waits for a call that is new.
  const asking = calls.next(crab);
  const third = held(calls.make(crab, staying));
  const [three, ...rest] = await asking;
  assert.ok(three !== undefined && three !== one && three !== two);
  assert.deepEqual(rest, []);

  // An ID is good once, and what answers is handed to whoever asked.
  const answering = calls.answer(one);
  assert.ok(answering);
  assert.equal(calls.answer(one), undefined);
  assert.equal(calls.answer("made-up"), undefined);
  const connection = new PassThrough();
  answering.arrive(connection);
  assert.equal(await first, connection);

  // A connection that did not open lets whoever asked go.
  calls.answer(two)?.abandon();
  await assert.rejects(second);

  // A call whose answer arrives after whoever asked has gone is closed on arrival, and the ID was spent.
  const left = new AbortController();
  const leaving = held(calls.make(crab, left.signal));
  const [leavingId = ""] = await calls.next(crab);
  const taken = calls.answer(leavingId);
  left.abort();
  const stray = new PassThrough();
  taken?.arrive(stray);
  await assert.rejects(leaving, { name: "AbortError" });
  assert.equal(stray.destroyed, true);

  // A call whose asker goes before it is taken is gone with it.
  const gone = new AbortController();
  const goneCall = held(calls.make(crab, gone.signal));
  const [goneId = ""] = await calls.next(crab);
  gone.abort();
  await assert.rejects(goneCall, { name: "AbortError" });
  assert.equal(calls.answer(goneId), undefined);

  // When the agent is gone, the calls waiting for it end, and so does an ask in progress. Others are not touched.
  const waitingRex = held(calls.next(rex));
  calls.end(rex);
  await assert.rejects(forRex);
  await assert.rejects(waitingRex);
  assert.equal(calls.answer(forRexId), undefined);
  const stillThere = calls.answer(three);
  assert.ok(stillThere, "crab's call is still there");
  const arrived = new PassThrough();
  stillThere.arrive(arrived);
  assert.equal(await third, arrived);

  // Closing ends everything, and nothing is made after it.
  const last = held(calls.make(crab, staying));
  const closing = held(calls.next({}));
  calls.close();
  await assert.rejects(last);
  await assert.rejects(closing);
  await assert.rejects(calls.make(crab, staying));
});

test("a call is told to nobody and answered by nobody once it has run out", async () => {
  const calls = createCalls({ ttlMs: 20 });
  const crab = {};
  const waiting = held(calls.make(crab, new AbortController().signal));
  const [call = ""] = await calls.next(crab);

  await assert.rejects(waiting);

  assert.equal(calls.answer(call), undefined);
  const staying = new AbortController();
  const asking = held(calls.next(crab, staying.signal));
  staying.abort();
  await assert.rejects(asking, { name: "AbortError" });
});
