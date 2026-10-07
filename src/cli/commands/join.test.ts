import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAddress, writeLink } from "../../contracts/gateway/index.ts";
import { connectLocalGateway, readMachine } from "../../contracts/gateway/node.ts";
import { stopAfter } from "../../lib/testing/index.ts";
import { captureIo, serveGateway, shrimpy, useShrimpyDir } from "../testing/index.ts";
import { joinThisMachine } from "./join.ts";

/*
 * What `join` does with a gateway that does not answer, which takes the time it waits for. The other things it does,
 * from the invitation to a machine that talks as the person, are in cli/machine.test.ts.
 */

test("join gives up on a gateway that does not answer, says where it tried, and running it again with the same link joins as the same machine", { timeout: 60_000 }, async (t) => {
  const gateway = await serveGateway(t, ["--listen", "127.0.0.1:0"]);
  const [address] = gateway.listening.listen;
  assert.ok(address);
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());
  const link = writeLink({ name: null, address, code: (await person.inviteMachine()).code });
  const folder = useShrimpyDir(t);
  // A process that is stopped takes connections and answers none of them. Killing it, as the test's end does, works all the same.
  process.kill(gateway.listening.pid, "SIGSTOP");

  await assert.rejects(joinThisMachine(captureIo().io, link, 1_000), (error: Error) => {
    assert.ok(error.message.includes(formatAddress(address)), error.message);
    assert.match(error.message, /safe/, "and that it is safe to run it again");
    return true;
  });
  const waiting = readMachine(folder);
  assert.ok(waiting !== undefined);
  assert.equal(waiting.member, undefined, "it has a token, and is nobody's machine yet");

  process.kill(gateway.listening.pid, "SIGCONT");
  const joined = await shrimpy(["join", link]);
  assert.equal(joined.code, 0, joined.stderr);
  assert.equal(readMachine(folder)?.token, waiting.token, "it is the same machine");
});
