import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChannelRecord } from "../store/index.ts";
import { agent, person } from "../testing/index.ts";
import { addressedMembers } from "./addressing.ts";

const zach = person("Zach");
const shrimpy = agent("Shrimpy");

test("a message in a DM is addressed to the other member", () => {
  const dm: ChannelRecord = { id: "ch_1", kind: "dm", name: null, members: [shrimpy, zach] };

  assert.deepEqual(addressedMembers(dm, zach, "hello"), [shrimpy.id]);
  assert.deepEqual(addressedMembers(dm, shrimpy, "hello"), [zach.id]);
});

test("a message in a room is addressed to nobody until mentions are read", () => {
  const room: ChannelRecord = { id: "ch_2", kind: "room", name: "Home", members: [shrimpy, zach] };

  assert.deepEqual(addressedMembers(room, zach, "hello @shrimpy"), []);
});
