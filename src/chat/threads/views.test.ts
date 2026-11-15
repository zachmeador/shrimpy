import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { ANSWER_BYTES } from "../input/index.ts";
import { agent, openTestDeps, person } from "../testing/index.ts";
import { channelView, openDm, post, threadView } from "./index.ts";

test("a thread of very long messages shows the newest that fit one part, and counts the rest", (t) => {
  const { deps, clock, know } = openTestDeps(t);
  const zach = know(person("Zach"));
  const dm = openDm(deps, zach, know(agent("Shrimpy")).id);
  const [main] = channelView(deps, zach, dm.id).threads;
  assert.ok(main);
  const posted = 30;
  for (let number = 1; number <= posted; number++) {
    clock.advance();
    post(deps, zach, main.id, `${number} ${"é".repeat(MAX_MESSAGE_LENGTH - 10)}`, `request-${number}`);
  }

  const view = threadView(deps, zach, main.id);

  assert.ok(view.messages.length > 1 && view.messages.length < posted, String(view.messages.length));
  assert.equal(view.earlier, posted - view.messages.length);
  assert.ok(view.messages.at(-1)?.text.startsWith(`${posted} `));
  assert.ok(Buffer.byteLength(JSON.stringify(view.messages)) <= ANSWER_BYTES);
});
