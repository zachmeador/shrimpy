import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "../contracts/chat/index.ts";
import { shrimpy, startScriptedAgent, startTalking } from "./testing/index.ts";

/*
 * These tests change messages as people do: every `shrimpy` is its own process,
 * and so are the gateway and the chat server. A scripted member stands in for
 * an agent whose side of chat is not under test.
 */

const timeout = 60_000;
const THUMBS_UP = "\u{1F44D}";

test("edit, delete, react and unreact change a message as whoever runs them, and read shows it as it now stands", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => ({ status: "answered", text: "Noted." }) });
  const started = await shrimpy(["run", "scout", "first draft"]);
  const thread = /^Thread (th_\w+) started\./m.exec(started.stderr)?.[1] ?? "";
  const you = await talking.you();
  const [asked, reply] = await you.chat.read(thread, null, 10);
  assert.ok(asked && reply);
  const read = async (): Promise<string[]> => (await shrimpy(["read", thread])).stdout.split("\n");

  // The IDs the commands take are the ones read shows.
  assert.ok((await read()).some((line) => line.includes(asked.id)));
  const edited = await shrimpy(["edit", asked.id, "second draft"]);
  const reacted = await shrimpy(["react", reply.id, THUMBS_UP]);
  assert.deepEqual([edited.code, reacted.code], [0, 0], edited.stderr + reacted.stderr);
  const lines = await read();
  assert.ok(lines.some((line) => line.trim() === "second draft"));
  assert.ok(!lines.some((line) => line.trim() === "first draft"));
  assert.match(lines.find((line) => line.includes(asked.id)) ?? "", /edited/);
  assert.ok(lines.some((line) => line.trim() === `${THUMBS_UP} ${you.me.name}`));

  const unreacted = await shrimpy(["unreact", reply.id, THUMBS_UP]);
  const deleted = await shrimpy(["delete", asked.id]);
  assert.deepEqual([unreacted.code, deleted.code], [0, 0], unreacted.stderr + deleted.stderr);
  const after = await read();
  assert.ok(after.some((line) => line.trim() === "(deleted)"));
  assert.ok(!after.some((line) => line.includes("second draft") || line.includes(THUMBS_UP)));
  const json = JSON.parse((await shrimpy(["read", thread, "--json"])).stdout) as { messages: Message[] };
  assert.deepEqual([json.messages[0]?.deleted, json.messages[0]?.text, json.messages[1]?.reactions], [true, "", []]);

  // What can't be done says why, and exits 1.
  const notYours = await shrimpy(["edit", reply.id, "Not mine."]);
  const gone = await shrimpy(["edit", asked.id, "Back again."]);
  const unknown = await shrimpy(["delete", "msg_nothing"]);
  const notAnEmoji = await shrimpy(["react", reply.id, "thumbs up"]);
  assert.deepEqual([notYours.code, gone.code, unknown.code, notAnEmoji.code], [1, 1, 1, 1]);
  assert.match(notYours.stderr, /Only the author of a message can edit it/);
  assert.match(gone.stderr, /was deleted/);
  assert.match(unknown.stderr, /Unknown message: msg_nothing.*shrimpy read <thread>/);
  assert.match(notAnEmoji.stderr, /must be one emoji/);
  assert.equal((await shrimpy(["edit", asked.id])).code, 2, "a command used wrongly exits 2");
});
