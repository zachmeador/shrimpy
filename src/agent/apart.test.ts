import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAddress, writeLink } from "../contracts/gateway/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { startQuietLink, tempDir, until } from "../lib/testing/index.ts";
import { initHome, joinHome } from "./index.ts";
import { SCOUT, startAgentRig, startChatServer } from "./testing/index.ts";

/*
 * An agent apart from the gateway, with the real gateway and chat server in processes of their own, and
 * the agent reaching the gateway's entry through a link that can go quiet without closing.
 */

const timeout = 30_000;

test("an agent apart whose gateway and chat go quiet without closing, and then come back, reads its feed again and answers what is said after", { timeout }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [entry] = gateway.listening;
  assert.ok(entry);
  const chat = await startChatServer(t);
  const link = await startQuietLink(t, entry);
  // The agent joined through the link, so the address its home keeps for the gateway is the link's.
  const { code } = await (await gateway.connect()).invite(SCOUT);
  const home = tempDir(t, "agent");
  initHome(home, { name: SCOUT });
  await joinHome(home, writeLink({ name: SCOUT, address: link.address, code }));
  const rig = await startAgentRig(t, {
    home,
    chat,
    join: { apart: link.address, heartbeat: { everyMs: 100, withinMs: 300, tryMs: 500 } },
  });
  await rig.receiptOn(await rig.say("are you there"));

  // Nothing passes and nothing closes, as when a network dies. The agent finds that out for itself.
  link.silence();
  await until(
    () => rig.reports.some((report) => (report as Error).message.includes(formatAddress(link.address))),
    "the agent to say that it can't reach its gateway",
  );

  // It is registered again over the connections made once the link passes, and its feed is read over a new one.
  link.restore();
  const asked = await rig.say("and now");
  const receipt = await rig.receiptOn(asked, 15_000);
  assert.equal(receipt.status, "answered");
  assert.equal((await rig.replies()).length, 2);
});
