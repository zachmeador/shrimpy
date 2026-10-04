import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { agentMember, connectChat, personMember } from "../../contracts/chat/index.ts";
import { type ScriptedChat, scriptedChat, startStandInChat } from "../../contracts/chat/testing/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { eventually, settle, stopAfter, until, useRuntimeDir } from "../../lib/testing/index.ts";
import { ChatUnavailableError, type ChatLinkOptions, openChatLink } from "./index.ts";

const timeout = 15_000;
const scout = agentMember("scout");
const neverStopped = new AbortController().signal;

/** A link to `chat` that tries again after a few milliseconds, and is closed when the test ends. */
function linkTo(t: TestContext, chat: ScriptedChat, extra: Partial<ChatLinkOptions> = {}) {
  const errors: Error[] = [];
  const link = openChatLink({
    self: scout,
    open: () => chat.connect(),
    onError: (error) => errors.push(error),
    backoff: backoff({ firstMs: 5, maxMs: 20 }),
    ...extra,
  });
  stopAfter(t, () => link.close());
  return { link, errors };
}

test("the link connects, says who the agent is, and runs a call on the connection", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { link } = linkTo(t, chat);

  const head = await link.use((live, signal) => live.head(signal), neverStopped);

  assert.equal(head, 0);
  assert.equal(link.current() !== undefined, true);
  const { channel } = chat.dm(personMember("zach"), scout);
  const mine = await link.use((live, signal) => live.channels(signal), neverStopped);
  assert.deepEqual(mine.map((found) => found.id), [channel.id]);
});

test("a call waits for chat while there is none, and runs once chat is up", { timeout }, async (t) => {
  const chat = scriptedChat();
  chat.down();
  const { link, errors } = linkTo(t, chat);
  assert.equal(link.current(), undefined);

  const asking = link.use((live, signal) => live.head(signal), neverStopped);
  await delay(60);
  chat.up();

  assert.equal(await asking, 0);
  assert.deepEqual(errors, [], "chat not being there is not worth telling anyone");
});

test("a call that is cut off by a lost connection runs again on the next one", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { link } = linkTo(t, chat);
  await link.use((live, signal) => live.head(signal), neverStopped);
  const held = chat.hold("head");
  let runs = 0;
  const asking = link.use((live, signal) => {
    runs += 1;
    return live.head(signal);
  }, neverStopped);
  await eventually(() => held.arrived(), (arrived) => arrived === 1, { what: "the call to arrive" });

  chat.down();
  chat.up();
  await eventually(() => held.arrived(), (arrived) => arrived === 2, { what: "the call to arrive again" });
  held.release();

  assert.equal(await asking, 0);
  assert.equal(runs, 2);
});

test("a call that fails for its own reason while the connection holds is not run again", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { link } = linkTo(t, chat);
  let runs = 0;

  await assert.rejects(
    link.use(() => {
      runs += 1;
      return Promise.reject(new Error("no good"));
    }, neverStopped),
    /no good/,
  );

  assert.equal(runs, 1);
});

test("a call that is cancelled while it waits for chat ends with the cancellation", { timeout }, async (t) => {
  const chat = scriptedChat();
  chat.down();
  const { link } = linkTo(t, chat);
  const cancel = new AbortController();

  const asking = assert.rejects(link.use((live, signal) => live.head(signal), cancel.signal), /enough/);
  await settle();
  cancel.abort(new Error("enough"));

  await asking;
});

test("the link says what failed, and nothing about chat not being there", { timeout }, async (t) => {
  const chat = scriptedChat();
  let attempts = 0;
  const { errors } = linkTo(t, chat, {
    open() {
      attempts += 1;
      if (attempts === 1) throw new ChatUnavailableError("The gateway lists no chat server.");
      if (attempts === 2) throw new Error("The chat server answers as someone else.");
      return chat.connect();
    },
  });

  await until(() => chat.calls("identify") === 1, "the link to get through");

  assert.deepEqual(errors.map((error) => error.message), ["The chat server answers as someone else."]);
});

test("an identity the chat server refuses is reported, and tried again", { timeout }, async (t) => {
  const chat = scriptedChat();
  chat.fail("identify", new Error("not now"), 2);
  const { link, errors } = linkTo(t, chat);

  await link.use((live, signal) => live.head(signal), neverStopped);

  assert.deepEqual(errors.map((error) => error.message), ["not now", "not now"]);
});

test("the link is told of each connection that comes up, the one already up included", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { link } = linkTo(t, chat);
  await link.use((live, signal) => live.head(signal), neverStopped);
  const seen: boolean[] = [];

  const stop = link.onUp((live) => seen.push(live.lost.aborted));
  chat.down();
  chat.up();
  await until(() => seen.length === 2, "the next connection to come up");
  stop();
  chat.down();
  chat.up();
  await until(() => chat.calls("identify") === 3, "a third connection");
  await settle();

  assert.deepEqual(seen, [false, false]);
});

test("closing leaves chat, ends a call that waits for it, and does not come back", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { link } = linkTo(t, chat);
  await link.use((live, signal) => live.head(signal), neverStopped);
  const held = chat.hold("head");
  const asking = assert.rejects(link.use((live, signal) => live.head(signal), neverStopped), /closed/);
  await eventually(() => held.arrived(), (arrived) => arrived === 1, { what: "the call to arrive" });

  await link.close();

  await asking;
  assert.equal(link.current(), undefined);
  await assert.rejects(link.use((live, signal) => live.head(signal), neverStopped), /closed/);
  await delay(50);
  assert.equal(chat.calls("identify"), 1, "it did not connect again");
});

test("over a real socket, a chat server that goes away and comes back is found again", { timeout }, async (t) => {
  useRuntimeDir(t);
  const stand = await startStandInChat(t);
  const { link } = linkTo(t, stand.chat, {
    open: () =>
      connectChat({ serverId: stand.serverId, transportFactory: createUnixTransportFactory({ path: stand.socket }) }),
  });
  await link.use((live, signal) => live.head(signal), neverStopped);

  await stand.outage();
  await until(() => link.current() === undefined, "the link to notice");
  const asking = link.use((live, signal) => live.head(signal), neverStopped);
  await stand.recover();

  assert.equal(await asking, 0);
});
