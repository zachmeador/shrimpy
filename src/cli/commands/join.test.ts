import assert from "node:assert/strict";
import { test } from "node:test";
import { writeLink } from "../../contracts/gateway/index.ts";
import { readMachine } from "../../contracts/gateway/node.ts";
import { captureIo, onTheRoster, shrimpy, useShrimpyDir } from "../testing/index.ts";
import { joinByLink } from "./join.ts";
import { startTestGateway } from "../../contracts/gateway/testing/index.ts";
import { formatAddress } from "../../lib/link/index.ts";

/*
 * What `join` does with the link of a machine of the person's own when the gateway does not answer, which takes the
 * time it waits for. The other things it does, from the invitation to a machine that talks as the person, are in
 * cli/machine.test.ts.
 */

test("join gives up on a gateway that does not answer, and the same link joins later as the same machine", { timeout: 60_000 }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening.listen;
  assert.ok(address);
  const person = await onTheRoster(t);
  const { code, fingerprint } = await person.inviteDevice();
  const link = writeLink({ name: null, address, code, fingerprint });
  const folder = useShrimpyDir(t);
  // A process that is stopped takes connections and answers none of them. Killing it, as the test's end does, works all the same.
  gateway.freeze();

  await assert.rejects(joinByLink(captureIo().io, link, 1_000), (error: Error) => {
    assert.ok(error.message.includes(formatAddress(address)), error.message);
    return true;
  });
  const waiting = readMachine(folder);
  assert.ok(waiting !== undefined);
  assert.equal(waiting.member, undefined, "it has a token, and is nobody's machine yet");

  gateway.thaw();
  const joined = await shrimpy(["join", link]);
  assert.equal(joined.code, 0, joined.stderr);
  assert.equal(readMachine(folder)?.token, waiting.token, "it is the same machine");
});
