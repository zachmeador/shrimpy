import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { Roster } from "../contracts/gateway/index.ts";
import { until } from "../lib/testing/index.ts";
import { refusalOf, startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("Chat.search matches terms, quoted phrases, literal wildcards, pre-join room history, and excludes deletes and wake lines", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const yours = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  const mayas = await maya.host.get(Chat, {}, context);

  const ops = valueOf(await yours.createRoom({ name: "Ops", members: [scout.you.id] }, context));
  const [opsMain] = (await you.host.get(Channel, { channel: ops.id }, context)).threads.value;
  assert.ok(opsMain);
  const opsSide = valueOf(await yours.createThread({ channel: ops.id, name: "Certs" }, context));

  // Posted before maya joins #Ops.
  const preJoin = valueOf(
    await yours.post({ thread: opsMain.id, text: "Renew tailscale cert at 100% speed_check!", request: "you-1" }, context),
  );
  const deleted = valueOf(await yours.post({ thread: opsMain.id, text: "Deleted tailscale note", request: "you-2" }, context));
  valueOf(await yours.delete({ message: deleted.id, request: "you-del" }, context));
  valueOf(
    await scouts.wakeLine(
      {
        thread: opsMain.id,
        wake: { kind: "trigger", name: "certs", firedAt: 1_700_000_000_000, prompt: "tailscale wake prompt", output: null },
        request: "scout-wake",
      },
      context,
    ),
  );
  const sideHit = valueOf(
    await scouts.post({ thread: opsSide.id, text: "Tailscale cert expires Feb 2027.", request: "scout-1" }, context),
  );

  // Add maya later; maya can search pre-join messages in #Ops.
  valueOf(await yours.addMembers({ channel: ops.id, members: [maya.you.id] }, context));

  const both = valueOf(await mayas.search({ query: "tailscale cert" }, context));
  assert.deepEqual(
    both.map((h) => [h.message.id, h.threadName]),
    [
      [sideHit.id, "Certs"],
      [preJoin.id, null],
    ],
  );

  // Quoted phrase matches only contiguous phrase.
  const phrase = valueOf(await mayas.search({ query: '"cert expires"' }, context));
  assert.deepEqual(
    phrase.map((h) => h.message.id),
    [sideHit.id],
  );

  // Literal SQL LIKE wildcards (% and _) match literally, not as wildcards.
  const wildcard = valueOf(await mayas.search({ query: "100% speed_check" }, context));
  assert.deepEqual(
    wildcard.map((h) => h.message.id),
    [preJoin.id],
  );
  assert.deepEqual(valueOf(await mayas.search({ query: "100x speedXcheck" }, context)), []);

  // Thread scoping restricts to one thread.
  const scoped = valueOf(await mayas.search({ query: "tailscale", thread: opsSide.id }, context));
  assert.deepEqual(
    scoped.map((h) => h.message.id),
    [sideHit.id],
  );
});

test("Chat.around returns messages centered on a sparse global seq", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yours = await you.host.get(Chat, {}, context);

  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));
  const target = valueOf(await yours.createThread({ channel: dm.id, name: "Target" }, context));
  const noise = valueOf(await yours.createThread({ channel: dm.id, name: "Noise" }, context));

  const posted = [];
  for (let i = 1; i <= 7; i++) {
    posted.push(valueOf(await yours.post({ thread: target.id, text: `msg-${i}`, request: `t-${i}` }, context)));
    // Interleave messages in another thread so global seq has gaps inside `target`.
    valueOf(await yours.post({ thread: noise.id, text: `noise-${i}a`, request: `na-${i}` }, context));
    valueOf(await yours.post({ thread: noise.id, text: `noise-${i}b`, request: `nb-${i}` }, context));
  }

  const middle = valueOf(await yours.around({ thread: target.id, seq: posted[3]!.seq, limit: 3 }, context));
  assert.deepEqual(
    middle.map((m) => m.text),
    ["msg-3", "msg-4", "msg-5"],
  );

  // Near the start: fills remaining budget from after `seq`.
  const nearStart = valueOf(await yours.around({ thread: target.id, seq: posted[0]!.seq, limit: 4 }, context));
  assert.deepEqual(
    nearStart.map((m) => m.text),
    ["msg-1", "msg-2", "msg-3", "msg-4"],
  );

  // Near the end: fills remaining budget from before `seq`.
  const nearEnd = valueOf(await yours.around({ thread: target.id, seq: posted[6]!.seq, limit: 4 }, context));
  assert.deepEqual(
    nearEnd.map((m) => m.text),
    ["msg-4", "msg-5", "msg-6", "msg-7"],
  );
});

test("admin agents read, search, pin, and add members to channels they are not in; non-admins cannot until promoted", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  // First agent on roster is an admin; later agents are not.
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const rex = await chat.agent("rex");

  const yours = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  const rexs = await rex.host.get(Chat, {}, context);

  // A room and a DM that neither scout (admin) nor rex (non-admin) belongs to.
  const secretRoom = valueOf(await yours.createRoom({ name: "Secret", members: [maya.you.id] }, context));
  const [secretThread] = (await you.host.get(Channel, { channel: secretRoom.id }, context)).threads.value;
  assert.ok(secretThread);
  const roomMsg = valueOf(
    await yours.post({ thread: secretThread.id, text: "Vault key is cobalt-42.", request: "you-room-1" }, context),
  );
  const otherThread = valueOf(await yours.createThread({ channel: secretRoom.id, name: "Side" }, context));

  const mayaDm = valueOf(await yours.openDm({ member: maya.you.id }, context));
  const mayaDmThread = valueOf(await yours.createThread({ channel: mayaDm.id, name: null }, context));
  const dmMsg = valueOf(
    await yours.post({ thread: mayaDmThread.id, text: "Private cobalt-42 DM note.", request: "you-dm-1" }, context),
  );

  // Admin agent sees both in readOnlyChannels, can read/search/around, pin, and add itself, but never wakes or writes until joining.
  await until(() => scouts.readOnlyChannels.value.length === 2, "scout (admin) to see both read-only channels");
  assert.deepEqual(scouts.channels.value, []);
  assert.equal(scouts.head.value, 0, "read-only channels do not advance an admin agent's wake feed");

  const scoutRead = await scout.host.get(Thread, { thread: secretThread.id }, context);
  assert.equal(scoutRead.refusal.value, null);
  assert.equal(scoutRead.readOnly.value, true);
  assert.deepEqual(
    scoutRead.messages.value.map((m) => m.text),
    ["Vault key is cobalt-42."],
  );
  refusalOf(await scouts.post({ thread: secretThread.id, text: "Posting before joining", request: "scout-no" }, context));

  const scoutHits = valueOf(await scouts.search({ query: "cobalt-42" }, context));
  assert.deepEqual(
    scoutHits.map((h) => h.message.id),
    [dmMsg.id, roomMsg.id],
  );

  // Admin agent can pin in a room it isn't in, and can add itself to that room.
  const pinned = valueOf(
    await scouts.pin({ thread: otherThread.id, pinned: true, revision: otherThread.revision }, context),
  );
  assert.notEqual(pinned.pinned, null);
  valueOf(await scouts.addMembers({ channel: secretRoom.id, members: [scout.you.id] }, context));
  await until(() => !scoutRead.readOnly.value, "secret thread to become writable once scout joins");

  // Non-admin rex sees nothing of Secret or Maya's DM until promoted.
  assert.deepEqual(rexs.readOnlyChannels.value, []);
  assert.deepEqual(valueOf(await rexs.search({ query: "cobalt-42" }, context)), []);
  refusalOf(await rexs.search({ query: "cobalt-42", channel: secretRoom.id }, context));
  refusalOf(await rexs.read({ thread: secretThread.id, before: null, limit: 10 }, context));
  refusalOf(await rexs.around({ thread: secretThread.id, seq: roomMsg.seq, limit: 5 }, context));
  refusalOf(await rexs.addMembers({ channel: secretRoom.id, members: [rex.you.id] }, context));

  // Promoting rex opens readOnlyChannels and search live on its existing Chat hold.
  const roster = await you.host.get(Roster, {}, context);
  valueOf(await roster.promote({ member: rex.you.id }, context));
  await until(() => rexs.readOnlyChannels.value.length === 2, "rex to see read-only channels after promotion");
  const rexHits = valueOf(await rexs.search({ query: "cobalt-42" }, context));
  assert.deepEqual(
    rexHits.map((h) => h.message.id),
    [dmMsg.id, roomMsg.id],
  );
});
