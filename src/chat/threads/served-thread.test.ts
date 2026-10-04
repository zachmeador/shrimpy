import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { stopAfter } from "../../lib/testing/index.ts";
import { know, openTestDm, outcome } from "../testing/index.ts";
import {
  archiveThread,
  createThread,
  deleteMessage,
  editMessage,
  leaveReceipt,
  post,
  react,
  renameThread,
  serveThread,
  setWorking,
  unreact,
} from "./index.ts";
import { readThreadView } from "./thread-view.ts";

async function setup(t: TestContext) {
  const { deps, clock, zach, shrimpy, dm, main } = await openTestDm(t);
  const served = serveThread(deps, main.id);
  stopAfter(t, () => served.close());
  return { deps, clock, zach, shrimpy, dm, main, served };
}

test("the view follows the thread through any mix of changes", async (t) => {
  const { deps, clock, zach, shrimpy, dm, main, served } = await setup(t);
  const side = createThread(deps, zach, dm.id, "Side");
  served.watch();
  const connections = [{}, {}];
  // A small deterministic generator, so a failure can be reproduced.
  let seed = 20_241_003;
  const next = (limit: number): number => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed % limit;
  };

  for (let step = 0; step < 400; step++) {
    clock.advance(next(3) * 1000);
    const author = next(2) === 0 ? zach : shrimpy;
    const connection = connections[next(2)] ?? {};
    const choice = next(30);
    const request = `request-${step}`;
    if (choice < 11) post(deps, author, main.id, `message ${step}`, request);
    else if (choice < 13) post(deps, author, side.id, `side ${step}`, request);
    else if (choice === 13) renameThread(deps, author, main.id, `Name ${step}`);
    else if (choice === 14) archiveThread(deps, author, main.id, next(2) === 0);
    else if (choice === 15) {
      const messages = readThreadView(deps, main.id).messages;
      const picked = messages[next(Math.max(messages.length, 1))];
      const mine = messages.filter((candidate) => candidate.author.id === shrimpy.id);
      const answer = mine[next(Math.max(mine.length, 1))];
      const outcomes = [
        outcome("silent"),
        outcome("stopped"),
        outcome("skipped"),
        outcome("failed", { detail: `Failed at step ${step}.` }),
        answer === undefined ? outcome("failed") : outcome("answered", { reply: answer.id }),
      ];
      if (picked !== undefined) leaveReceipt(deps, shrimpy, [picked.event], outcomes[next(outcomes.length)]!);
    } else if (choice < 19) setWorking(deps, connection, author, main.id, next(2) === 0);
    else if (choice === 19) deps.working.end(connection);
    else if (choice < 22) know(deps, { ...author, name: `${author.name} ${step}` });
    else {
      // The rest change messages that are there: edit, delete, react and take a reaction back.
      const messages = readThreadView(deps, main.id).messages;
      const picked = messages[next(Math.max(messages.length, 1))];
      const emoji = next(2) === 0 ? "\u{1F44D}" : "\u{1F389}";
      if (picked !== undefined) {
        try {
          if (choice < 24) editMessage(deps, picked.author, picked.id, `edit ${step}`);
          else if (choice === 24) deleteMessage(deps, picked.author, picked.id);
          else if (choice < 28) react(deps, author, picked.id, emoji);
          else unreact(deps, author, picked.id, emoji);
        } catch (error) {
          // A deleted message takes no edit and no reaction; that is the rule, not a failure of the view.
          if (!(error instanceof Error && /was deleted/.test(error.message))) throw error;
        }
      }
    }

    assert.deepEqual(served.state.value, readThreadView(deps, main.id), `after step ${step}`);
  }
});
