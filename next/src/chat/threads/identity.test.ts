import assert from "node:assert/strict";
import { test } from "node:test";
import { agent, openTestDeps, person, refused } from "../testing/index.ts";
import { identify } from "./index.ts";

test("a member is recorded as it describes itself", (t) => {
  const { deps } = openTestDeps(t);

  const zach = identify(deps, { id: "person:zach", kind: "person", name: " Zach ", extra: "dropped" });

  assert.deepEqual(zach, person("Zach"));
  deps.store.transaction((tx) => assert.deepEqual(tx.member("person:zach"), person("Zach")));
});

test("a member can change its name by identifying again", (t) => {
  const { deps } = openTestDeps(t);
  identify(deps, person("Zach"));

  identify(deps, { id: "person:zach", kind: "person", name: "Zachariah" });

  deps.store.transaction((tx) => assert.equal(tx.member("person:zach")?.name, "Zachariah"));
});

test("a member cannot become a different kind of member", (t) => {
  const { deps } = openTestDeps(t);
  identify(deps, agent("Shrimpy"));

  assert.throws(
    () => identify(deps, { id: "agent:shrimpy", kind: "person", name: "Shrimpy" }),
    refused(/agent:shrimpy is on record with kind agent, not person/),
  );
});

test("a description that is not a member is refused", (t) => {
  const { deps } = openTestDeps(t);

  for (const bad of [null, "person:zach", {}, { id: "person:zach", kind: "person" }]) {
    assert.throws(() => identify(deps, bad), refused(/^member/));
  }
});
