import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { ANSWER_BYTES } from "../input/index.ts";
import { agent, openTestDeps, person } from "../testing/index.ts";
import { identify, listThreads, openDm, post } from "./index.ts";
import { readThreadView } from "./thread-view.ts";

test("a view of very long messages holds the newest that fit one answer, and counts the rest", (t) => {
  const { deps, clock } = openTestDeps(t);
  const zach = identify(deps, person("Zach"));
  const dm = openDm(deps, zach, identify(deps, agent("Shrimpy")));
  const [main] = listThreads(deps, zach, dm.id);
  assert.ok(main);
  const posted = 30;
  for (let number = 1; number <= posted; number++) {
    clock.advance();
    post(deps, zach, main.id, `${number} ${"é".repeat(MAX_MESSAGE_LENGTH - 10)}`, `request-${number}`);
  }

  const view = readThreadView(deps, main.id);

  assert.ok(view.messages.length > 1 && view.messages.length < posted, String(view.messages.length));
  assert.equal(view.earlier, posted - view.messages.length);
  assert.ok(view.messages.at(-1)?.text.startsWith(`${posted} `));
  assert.ok(Buffer.byteLength(JSON.stringify(view.messages)) <= ANSWER_BYTES);
});
