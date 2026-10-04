import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  agentMember,
  type Channel,
  type Message,
  personMember,
  type Receipt,
  type Thread,
} from "../../contracts/chat/index.ts";
import { formatTime, renderThread, renderThreads } from "./render-threads.ts";

const zach = personMember("zach");
const scout = agentMember("scout");
const channel: Channel = { id: "ch_1", kind: "dm", name: "scout", members: [scout, zach] };

// Times are shown in the local zone, so the tests choose one.
const savedZone = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "UTC";
});
afterEach(() => {
  if (savedZone === undefined) delete process.env.TZ;
  else process.env.TZ = savedZone;
});

const at = (hour: number, minute: number): number => Date.UTC(2026, 9, 3, hour, minute, 42);

function thread(fields: Partial<Thread> = {}): Thread {
  return {
    id: "th_one",
    channelId: channel.id,
    main: false,
    name: null,
    preview: null,
    archived: false,
    updatedAt: at(14, 5),
    working: [],
    ...fields,
  };
}

function message(id: string, author = zach, text = "hello", sentAt = at(14, 5), receipts: Receipt[] = []): Message {
  return { id, seq: 1, channelId: channel.id, threadId: "th_one", author, text, sentAt, addressed: [], receipts };
}

const failed = (detail: string): Receipt => ({ memberId: scout.id, status: "failed", reply: null, detail });
const bare = (status: "stopped" | "skipped" | "silent"): Receipt => ({
  memberId: scout.id,
  status,
  reply: null,
  detail: null,
});

test("a time is shown in the local zone, to the minute, with the date", () => {
  assert.equal(formatTime(at(9, 7)), "2026-10-03 09:07");
  process.env.TZ = "Asia/Tokyo";
  assert.equal(formatTime(at(9, 7)), "2026-10-03 18:07");
});

test("threads are a table of ID, last update, who is working, and name or preview", () => {
  const lines = renderThreads(
    [
      thread({ id: "th_aaa", preview: "what is in my inbox?", working: [{ memberId: scout.id, since: at(14, 6) }] }),
      thread({ id: "th_bbb", name: "Trip", preview: "plan the trip", updatedAt: at(13, 50), archived: true }),
      thread({ id: "th_ccc", main: true, updatedAt: at(9, 0) }),
    ],
    channel,
  );

  assert.deepEqual(lines, [
    "thread  updated           working  name",
    "th_aaa  2026-10-03 14:05  scout    what is in my inbox?",
    "th_bbb  2026-10-03 13:50           Trip [archived]",
    "th_ccc  2026-10-03 09:00           (no messages yet) [main]",
  ]);
});

test("a thread is read oldest first, each message under who wrote it and when", () => {
  const lines = renderThread(
    thread({ preview: "what is in my inbox?" }),
    [
      message("msg_1", zach, "what is in my inbox?", at(14, 5)),
      message("msg_2", scout, "Three emails.\nOne is urgent.\n", at(14, 6), [bare("silent")]),
    ],
    channel,
  );

  assert.deepEqual(lines, [
    "Thread th_one in your DM with scout: what is in my inbox?",
    "",
    "zach  2026-10-03 14:05",
    "  what is in my inbox?",
    "",
    "scout  2026-10-03 14:06",
    "  Three emails.",
    "  One is urgent.",
  ]);
});

test("a failed, stopped or skipped message says so below it, and an answer or a silence does not", () => {
  const lines = renderThread(
    thread({ name: "Mail" }),
    [
      message("msg_1", zach, "one", at(14, 5), [failed("the model refused:\n  bad request")]),
      message("msg_2", zach, "two", at(14, 6), [bare("stopped")]),
      message("msg_3", zach, "three", at(14, 7), [bare("skipped")]),
      message("msg_4", zach, "four", at(14, 8), [{ memberId: scout.id, status: "answered", reply: "msg_5", detail: null }]),
      message("msg_6", zach, "five", at(14, 9), [bare("silent")]),
    ],
    channel,
  );

  assert.deepEqual(lines.slice(1), [
    "",
    "zach  2026-10-03 14:05",
    "  one",
    "-- scout failed: the model refused: bad request --",
    "",
    "zach  2026-10-03 14:06",
    "  two",
    "-- scout stopped before answering --",
    "",
    "zach  2026-10-03 14:07",
    "  three",
    "-- scout skipped this message --",
    "",
    "zach  2026-10-03 14:08",
    "  four",
    "",
    "zach  2026-10-03 14:09",
    "  five",
  ]);
});

test("who is working in the thread is said at the end", () => {
  const lines = renderThread(
    thread({ working: [{ memberId: scout.id, since: at(14, 7) }] }),
    [message("msg_1")],
    channel,
  );

  assert.deepEqual(lines.slice(-2), ["", "-- scout is working (since 2026-10-03 14:07) --"]);
});

test("an empty thread says so, and a thread that is archived and main says what it is", () => {
  const lines = renderThread(thread({ main: true, archived: true }), [], channel);

  assert.deepEqual(lines, [
    "Thread th_one in your DM with scout: (no messages yet) [main, archived]",
    "",
    "(no messages yet)",
  ]);
});

test("a member the channel does not list is shown by its ID", () => {
  const lines = renderThread(thread(), [message("msg_1", zach, "hi", at(14, 5), [{ ...bare("stopped"), memberId: "agent:ghost" }])], channel);

  assert.ok(lines.includes("-- agent:ghost stopped before answering --"));
});
