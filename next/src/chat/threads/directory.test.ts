import assert from "node:assert/strict";
import { test } from "node:test";
import { agent, openTestDm, refused } from "../testing/index.ts";
import {
  archiveThread,
  createThread,
  listChannels,
  listThreads,
  openDm,
  renameThread,
  setWorking,
} from "./index.ts";

test("a DM is made once with its main thread, and each side sees it named for the other", (t) => {
  const { deps, zach, shrimpy, dm, main } = openTestDm(t);

  assert.equal(dm.kind, "dm");
  assert.equal(dm.name, "Shrimpy");
  assert.deepEqual(dm.members, [shrimpy, zach]);
  assert.deepEqual(openDm(deps, zach, shrimpy), dm);
  assert.deepEqual(main, {
    id: main.id,
    channelId: dm.id,
    main: true,
    name: null,
    preview: null,
    archived: false,
    updatedAt: main.updatedAt,
    working: [],
  });

  const fromShrimpy = openDm(deps, shrimpy, zach);
  assert.equal(fromShrimpy.id, dm.id);
  assert.equal(fromShrimpy.name, "Zach");
  assert.deepEqual(listChannels(deps, zach), [dm]);
  assert.deepEqual(listChannels(deps, shrimpy), [fromShrimpy]);
  assert.equal(listThreads(deps, zach, dm.id).length, 1);
});

test("a DM needs someone besides yourself", (t) => {
  const { deps, zach } = openTestDm(t);

  assert.throws(() => openDm(deps, zach, zach), refused(/needs someone besides yourself/));
});

test("a member the store has not met is recorded as described, and one it knows keeps its record", (t) => {
  const { deps, zach, shrimpy } = openTestDm(t);

  const withNewcomer = openDm(deps, zach, agent("Newcomer"));
  const withImpostor = openDm(deps, zach, { id: shrimpy.id, kind: "agent", name: "Impostor" });

  assert.equal(withNewcomer.name, "Newcomer");
  deps.store.transaction((tx) => assert.deepEqual(tx.member("agent:newcomer"), agent("Newcomer")));
  assert.equal(withImpostor.name, "Shrimpy");
  deps.store.transaction((tx) => assert.equal(tx.member(shrimpy.id)?.name, "Shrimpy"));
});

test("a member sees only the channels it belongs to", (t) => {
  const { deps, alice, dm, main } = openTestDm(t);

  assert.deepEqual(listChannels(deps, alice), []);
  assert.throws(() => listThreads(deps, alice, dm.id), refused(/^Unknown channel: ch_/));
  assert.throws(() => listThreads(deps, alice, "ch_nothing"), refused(/^Unknown channel: ch_nothing/));
  assert.throws(() => createThread(deps, alice, dm.id, "mine"), refused(/^Unknown channel/));
  assert.throws(() => renameThread(deps, alice, main.id, "mine"), refused(/^Unknown thread: th_/));
  assert.throws(() => archiveThread(deps, alice, main.id, true), refused(/^Unknown thread: th_/));
  assert.throws(() => setWorking(deps, {}, alice, main.id, true), refused(/^Unknown thread: th_/));
});

test("side threads can be started, named, archived and brought back", (t) => {
  const { deps, clock, zach, shrimpy, dm, main } = openTestDm(t);
  clock.advance();

  const named = createThread(deps, zach, dm.id, "  Plans  ");
  clock.advance();
  const unnamed = createThread(deps, shrimpy, dm.id, null);

  assert.equal(named.name, "Plans");
  assert.equal(named.main, false);
  assert.equal(named.preview, null);
  assert.equal(unnamed.name, null);
  assert.equal(renameThread(deps, shrimpy, unnamed.id, "Trip").name, "Trip");
  assert.equal(archiveThread(deps, zach, named.id, true).archived, true);
  assert.deepEqual(
    listThreads(deps, zach, dm.id).map((thread) => [thread.id, thread.name, thread.archived]),
    [
      [unnamed.id, "Trip", false],
      [named.id, "Plans", true],
      [main.id, null, false],
    ],
  );
  assert.equal(archiveThread(deps, zach, named.id, false).archived, false);
});

test("thread names and archive flags are checked", (t) => {
  const { deps, zach, dm, main } = openTestDm(t);

  assert.throws(() => createThread(deps, zach, dm.id, ""), refused(/^name must be/));
  assert.throws(() => createThread(deps, zach, dm.id, 7), refused(/^name must be/));
  assert.throws(() => createThread(deps, zach, 7, null), refused(/^channelId must be an ID/));
  assert.throws(() => renameThread(deps, zach, main.id, "two\nlines"), refused(/^name must be/));
  assert.throws(() => archiveThread(deps, zach, main.id, "yes"), refused(/^archived must be true or false/));
});

test("who is working shows in every thread the service returns, and does not touch updatedAt", (t) => {
  const { deps, clock, zach, shrimpy, dm, main } = openTestDm(t);
  const here = {};
  clock.advance(5000);
  setWorking(deps, here, shrimpy, main.id, true);
  const working = [{ memberId: shrimpy.id, since: clock.now() }];
  clock.advance(5000);

  const listed = listThreads(deps, zach, dm.id).find((thread) => thread.main);
  assert.ok(listed);
  assert.deepEqual(listed.working, working);
  assert.equal(listed.updatedAt, main.updatedAt);
  assert.deepEqual(renameThread(deps, zach, main.id, "Main").working, working);
  assert.deepEqual(archiveThread(deps, zach, main.id, true).working, working);
  assert.deepEqual(createThread(deps, zach, dm.id, "Elsewhere").working, []);

  setWorking(deps, here, shrimpy, main.id, false);
  assert.deepEqual(listThreads(deps, zach, dm.id).find((thread) => thread.main)?.working, []);
});

test("working needs a true or false and a thread the caller belongs to", (t) => {
  const { deps, shrimpy, main } = openTestDm(t);

  assert.throws(() => setWorking(deps, {}, shrimpy, main.id, "yes"), refused(/^working must be true or false/));
  assert.throws(() => setWorking(deps, {}, shrimpy, 5, true), refused(/^threadId must be an ID/));
  assert.throws(() => setWorking(deps, {}, shrimpy, "th_nothing", true), refused(/^Unknown thread: th_nothing/));
  assert.deepEqual(deps.working.list(main.id), []);
});
