import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Chat, MAX_ATTACHED_BYTES, PIECE_BYTES } from "../contracts/chat/index.ts";
import { until } from "../lib/testing/index.ts";
import { refusalOf, startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

/** A PNG's start, 640 × 480, followed by `size` bytes in all, so it takes more than one piece. */
function aPicture(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 640);
  view.setUint32(20, 480);
  for (let index = 24; index < size; index += 1) bytes[index] = index % 251;
  return bytes;
}

test("a file goes to chat in pieces, comes with its message, and is read back by whoever reads the thread", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const kelp = await chat.agent("kelp");
  const yours = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  const kelps = await kelp.host.get(Chat, {}, context);
  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yours.createThread({ channel: dm.id, name: null }, context));

  const picture = aPicture(PIECE_BYTES + 1000);
  const started = valueOf(await yours.upload({ name: "board.png", mediaType: "", size: picture.byteLength, request: "up-1" }, context));
  assert.equal(started.received, 0);
  const id = started.attachment;
  assert.equal(valueOf(await yours.uploadPiece({ attachment: id, offset: 0, data: picture.subarray(0, PIECE_BYTES) }, context)), PIECE_BYTES);
  assert.deepEqual(valueOf(await yours.upload({ name: "board.png", mediaType: "", size: picture.byteLength, request: "up-1" }, context)), {
    attachment: id,
    received: PIECE_BYTES,
  });
  assert.equal(valueOf(await yours.uploadPiece({ attachment: id, offset: 0, data: picture.subarray(0, PIECE_BYTES) }, context)), PIECE_BYTES);
  refusalOf(await yours.post({ thread: thread.id, text: "", request: "post-0", attachments: [id] }, context));
  assert.equal(valueOf(await yours.uploadPiece({ attachment: id, offset: PIECE_BYTES, data: picture.subarray(PIECE_BYTES) }, context)), picture.byteLength);

  refusalOf(await scouts.post({ thread: thread.id, text: "mine now", request: "steal", attachments: [id] }, context));
  const posted = valueOf(await yours.post({ thread: thread.id, text: "", request: "post-1", attachments: [id] }, context));
  assert.deepEqual(posted.attachments, [{ id, name: "board.png", mediaType: "image/png", size: picture.byteLength, width: 640, height: 480 }]);
  const listed = valueOf(await yours.read({ thread: thread.id, before: null, limit: 1 }, context));
  assert.equal(listed[0]?.attachments[0]?.id, id);

  await until(() => scouts.head.value > 0, "the post to reach scout's feed");
  const [event] = valueOf(await scouts.events({ after: 0, limit: 50 }, context)).filter((each) => each.kind === "posted");
  assert.ok(event?.kind === "posted");
  assert.deepEqual(event.attachments, posted.attachments);
  const first = valueOf(await scouts.download({ attachment: id, offset: 0, length: PIECE_BYTES * 4 }, context));
  assert.equal(first.byteLength, PIECE_BYTES);
  const rest = valueOf(await scouts.download({ attachment: id, offset: PIECE_BYTES, length: PIECE_BYTES }, context));
  assert.deepEqual(new Uint8Array([...first, ...rest]), picture);
  assert.equal(valueOf(await scouts.download({ attachment: id, offset: picture.byteLength, length: 10 }, context)).byteLength, 0);

  assert.match(refusalOf(await kelps.download({ attachment: id, offset: 0, length: 10 }, context)).words, /Unknown attachment/);

  const deleted = valueOf(await yours.delete({ message: posted.id, request: "delete-1" }, context));
  assert.deepEqual(deleted.attachments, []);
  assert.match(refusalOf(await scouts.download({ attachment: id, offset: 0, length: 10 }, context)).words, /Unknown attachment/);
});

test("a message carries 25 MB of files at most, and a file chat doesn't know as a picture is a file", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yours = await you.host.get(Chat, {}, context);
  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yours.createThread({ channel: dm.id, name: null }, context));

  refusalOf(await yours.upload({ name: "huge.mov", mediaType: "video/quicktime", size: MAX_ATTACHED_BYTES + 1, request: "huge" }, context));
  refusalOf(await yours.upload({ name: "../escape.txt", mediaType: "text/plain", size: 3, request: "escape" }, context));

  const notes = new TextEncoder().encode("hello");
  const upload = valueOf(await yours.upload({ name: "notes.txt", mediaType: "text/plain", size: notes.byteLength, request: "notes" }, context));
  valueOf(await yours.uploadPiece({ attachment: upload.attachment, offset: 0, data: notes }, context));
  const posted = valueOf(await yours.post({ thread: thread.id, text: "the notes", request: "notes-post", attachments: [upload.attachment] }, context));
  assert.deepEqual(posted.attachments, [{ id: upload.attachment, name: "notes.txt", mediaType: "text/plain", size: 5, width: null, height: null }]);
  refusalOf(await yours.post({ thread: thread.id, text: "again", request: "notes-again", attachments: [upload.attachment] }, context));
});
