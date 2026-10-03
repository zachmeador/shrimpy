import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkingMarks } from "./index.ts";

const connection = (): object => ({});

function hear(marks: ReturnType<typeof createWorkingMarks>): string[] {
  const heard: string[] = [];
  marks.subscribe((threadId) => heard.push(threadId));
  return heard;
}

test("working members are listed longest first, then by ID", () => {
  const marks = createWorkingMarks();
  const here = connection();
  marks.set(here, "agent:late", "th_1", true, 3000);
  marks.set(here, "agent:b", "th_1", true, 1000);
  marks.set(here, "agent:a", "th_1", true, 1000);
  marks.set(here, "agent:elsewhere", "th_2", true, 500);

  assert.deepEqual(marks.list("th_1"), [
    { memberId: "agent:a", since: 1000 },
    { memberId: "agent:b", since: 1000 },
    { memberId: "agent:late", since: 3000 },
  ]);
  assert.deepEqual(marks.list("th_2"), [{ memberId: "agent:elsewhere", since: 500 }]);
  assert.deepEqual(marks.list("th_none"), []);
});

test("marking and clearing change the list, and watchers hear of each change", () => {
  const marks = createWorkingMarks();
  const heard = hear(marks);
  const here = connection();

  marks.set(here, "agent:a", "th_1", true, 1000);
  marks.set(here, "agent:a", "th_1", false, 2000);

  assert.deepEqual(marks.list("th_1"), []);
  assert.deepEqual(heard, ["th_1", "th_1"]);
});

test("marking again keeps the first time and tells nobody", () => {
  const marks = createWorkingMarks();
  const here = connection();
  marks.set(here, "agent:a", "th_1", true, 1000);
  const heard = hear(marks);

  marks.set(here, "agent:a", "th_1", true, 9000);
  marks.set(connection(), "agent:a", "th_1", true, 9500);

  assert.deepEqual(marks.list("th_1"), [{ memberId: "agent:a", since: 1000 }]);
  assert.deepEqual(heard, []);
});

test("clearing a mark that was never set changes nothing", () => {
  const marks = createWorkingMarks();
  const heard = hear(marks);

  marks.set(connection(), "agent:a", "th_1", false, 1000);

  assert.deepEqual(marks.list("th_1"), []);
  assert.deepEqual(heard, []);
});

test("a member marked by two connections works until both have cleared or ended", () => {
  const marks = createWorkingMarks();
  const first = connection();
  const second = connection();
  marks.set(first, "agent:a", "th_1", true, 1000);
  marks.set(second, "agent:a", "th_1", true, 2000);
  const heard = hear(marks);

  marks.set(first, "agent:a", "th_1", false, 3000);
  assert.deepEqual(marks.list("th_1"), [{ memberId: "agent:a", since: 1000 }]);
  assert.deepEqual(heard, []);

  marks.end(second);
  assert.deepEqual(marks.list("th_1"), []);
  assert.deepEqual(heard, ["th_1"]);

  marks.set(first, "agent:a", "th_1", true, 4000);
  assert.deepEqual(marks.list("th_1"), [{ memberId: "agent:a", since: 4000 }]);
});

test("a connection that ends loses its marks, and watchers hear once for each thread", () => {
  const marks = createWorkingMarks();
  const gone = connection();
  const stays = connection();
  marks.set(gone, "agent:a", "th_1", true, 1000);
  marks.set(gone, "agent:a", "th_2", true, 1000);
  marks.set(gone, "agent:a", "th_3", true, 1000);
  marks.set(stays, "agent:a", "th_3", true, 2000);
  marks.set(stays, "agent:b", "th_1", true, 2000);
  const heard = hear(marks);

  marks.end(gone);

  assert.deepEqual(marks.list("th_1"), [{ memberId: "agent:b", since: 2000 }]);
  assert.deepEqual(marks.list("th_2"), []);
  assert.deepEqual(marks.list("th_3"), [{ memberId: "agent:a", since: 1000 }]);
  assert.deepEqual(heard.toSorted(), ["th_1", "th_2"]);

  marks.end(gone);
  assert.equal(heard.length, 2);
});

test("a watcher that fails is reported, and the others still hear", () => {
  const reported: string[] = [];
  const marks = createWorkingMarks({ onError: (error) => reported.push(error.message) });
  marks.subscribe(() => {
    throw new Error("a broken watcher");
  });
  const heard = hear(marks);

  marks.set(connection(), "agent:a", "th_1", true, 1000);

  assert.deepEqual(heard, ["th_1"]);
  assert.deepEqual(reported, ["a broken watcher"]);
});

test("a watcher that has stopped hears nothing", () => {
  const marks = createWorkingMarks();
  const heard: string[] = [];
  const stop = marks.subscribe((threadId) => heard.push(threadId));

  stop();
  marks.set(connection(), "agent:a", "th_1", true, 1000);

  assert.deepEqual(heard, []);
});
