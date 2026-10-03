import assert from "node:assert/strict";
import { test } from "node:test";
import { type Context, defineService } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { offerToConnection, offerToSession } from "./index.ts";

const context = BACKGROUND_CONTEXT;

interface Greeter {
  greet(name: string, context: Context): Promise<string>;
}
const Greeter = defineService<Greeter>("shrimpy.test.greeter");

const publish = (): void => undefined;

test("a connection is offered the service, and a call to it is answered by the implementation", async () => {
  const offered = offerToConnection(Greeter, { greet: (name) => Promise.resolve(`hello, ${name}`) });

  const answer = await offered.invokeService(
    { serviceId: Greeter.id, member: "greet", args: ["Zach"] },
    publish,
    context,
  );

  assert.equal(answer, "hello, Zach");
  await offered.release(context);
});

test("a service the connection was not offered is not reachable", async () => {
  const offered = offerToConnection(Greeter, { greet: () => Promise.resolve("") });

  await assert.rejects(
    offered.invokeService({ serviceId: "shrimpy.test.other", member: "greet", args: [] }, publish, context),
    { code: "service_not_allowed" },
  );
  await offered.release(context);
});

test("letting go of a connection takes the offer back and then tells whoever asked", async () => {
  const events: string[] = [];
  const offered = offerToConnection(Greeter, { greet: () => Promise.resolve("") }, () => events.push("released"));

  await offered.release(context);
  events.push("after release");

  assert.deepEqual(events, ["released", "after release"]);
  await assert.rejects(
    offered.invokeService({ serviceId: Greeter.id, member: "greet", args: ["Zach"] }, publish, context),
  );
});

test("a session is offered to every connection that attaches it, and they are told as they come and go", async () => {
  const events: string[] = [];
  let attachments = 0;
  const handle = offerToSession(
    Greeter,
    { greet: (name) => Promise.resolve(`hello, ${name}`) },
    {
      attached() {
        const number = (attachments += 1);
        events.push(`attached ${number}`);
        return () => events.push(`let go ${number}`);
      },
      closed: () => events.push("closed"),
    },
  );

  const first = await handle.attachClient(context);
  const second = await handle.attachClient(context);
  const call = { serviceId: Greeter.id, member: "greet", args: ["Zach"] };
  assert.equal(await first.invokeService(call, publish, context), "hello, Zach");
  assert.equal(await second.invokeService(call, publish, context), "hello, Zach");

  await first.release(context);
  await handle.close(context);
  await second.release(context);

  assert.deepEqual(events, ["attached 1", "attached 2", "let go 1", "closed", "let go 2"]);
});

test("a session with no hooks can still be attached and closed", async () => {
  const handle = offerToSession(Greeter, { greet: () => Promise.resolve("") });

  const attachment = await handle.attachClient(context);
  await attachment.release(context);
  await handle.close(context);
});
