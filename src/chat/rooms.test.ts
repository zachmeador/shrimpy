import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Chat } from "../contracts/chat/index.ts";
import { Roster } from "../contracts/gateway/index.ts";
import { refusalOf, startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("making a room takes an admin, and a promotion counts at once, on a hold made before it", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  // The first agent a roster has is an admin, and the next isn't.
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const mayas = await maya.host.get(Chat, {}, context);

  const refused = refusalOf(await mayas.createRoom({ name: "Ops", members: [scout.you.id] }, context));
  assert.match(refused.words, /scout/, "the refusal names the admins to ask");
  assert.deepEqual(mayas.channels.value, []);

  const roster = await you.host.get(Roster, {}, context);
  valueOf(await roster.promote({ member: maya.you.id }, context));

  const room = valueOf(await mayas.createRoom({ name: "Ops", members: [scout.you.id] }, context));
  assert.equal(room.name, "Ops");
  assert.deepEqual(
    room.members.map((member) => member.id).sort(),
    [scout.you.id, maya.you.id].sort(),
  );
});
