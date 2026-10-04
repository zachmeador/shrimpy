import type { TestContext } from "node:test";
import { stopAfter } from "../../../lib/testing/index.ts";
import type { GatewayConnection } from "../../gateway/index.ts";
import { newToken } from "../../gateway/node.ts";
import { startTestGateway } from "../../gateway/testing/index.ts";
import type { ChatConnection, ChatEndpoint, Member } from "../index.ts";
import { connectLocal } from "../node.ts";

/** A connection to the chat server that has come in, and who the gateway says it is. */
export interface Entered extends ChatConnection {
  readonly me: Member;
}

const tokens = new WeakMap<TestContext, Map<string, string>>();

/**
 * Come in to the chat server at `endpoint` as the person who runs the gateway:
 * a ticket from the gateway, which has no one signed in on this connection to
 * say otherwise, handed to the chat server. The test needs the gateway the chat
 * server is registered with, which is the test's own. The connection is closed
 * when the test ends.
 */
export async function enterAsPerson(t: TestContext, endpoint: ChatEndpoint): Promise<Entered> {
  return enterWith(t, endpoint, await (await startTestGateway(t)).connect());
}

/**
 * Come in as the agent called `name`. With the token it was given when it
 * joined, it signs in. Without one, the first time in a test it joins the
 * gateway's roster with that name, and after that it signs in with the token
 * that gave it, so it is the same member each time.
 */
export async function enterAsAgent(
  t: TestContext,
  endpoint: ChatEndpoint,
  name: string,
  given?: string,
): Promise<Entered> {
  return enterWith(t, endpoint, await gatewayAsAgent(t, name, given));
}

/**
 * A connection to the gateway that is the agent called `name`, which is what
 * an agent makes tickets over. The first time in a test it joins the roster
 * with that name, and after that it signs in with the token that gave it.
 */
export async function gatewayAsAgent(t: TestContext, name: string, given?: string): Promise<GatewayConnection> {
  const gateway = await (await startTestGateway(t)).connect();
  const known = tokens.get(t) ?? new Map<string, string>();
  tokens.set(t, known);
  const token = given ?? known.get(name);
  if (token === undefined) {
    const made = newToken();
    await gateway.join(name, made);
    known.set(name, made);
  } else await gateway.signIn(token, name);
  return gateway;
}

/**
 * Make the agent called `name` a member of the roster without its coming in to
 * chat. When it does come in, it signs in with the token it got here.
 */
export async function joinRoster(t: TestContext, name: string): Promise<Member> {
  const gateway = await (await startTestGateway(t)).connect();
  const token = newToken();
  const member = await gateway.join(name, token);
  const known = tokens.get(t) ?? new Map<string, string>();
  tokens.set(t, known);
  known.set(name, token);
  return member;
}

/**
 * The roster's member called `name`, for a test that needs to say who it means.
 * An agent joins when it first reaches the gateway, which may be a moment from
 * now, so a member that is not there yet is waited for a few seconds.
 */
export async function memberNamed(t: TestContext, name: string): Promise<Member> {
  const gateway = await (await startTestGateway(t)).connect();
  const deadline = Date.now() + 10_000;
  for (;;) {
    const found = (await gateway.members()).find((member) => member.name === name);
    if (found !== undefined) return { id: found.id, kind: found.kind, name: found.name };
    if (Date.now() > deadline) throw new Error(`The roster has nobody called ${name}.`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Rename the agent called `name` at the gateway, as an agent that starts again
 * under another name is. It is `renamed` from then on, to this helper and to
 * the ones that come in as an agent.
 */
export async function renameAgent(t: TestContext, name: string, renamed: string): Promise<Member> {
  const known = tokens.get(t);
  const token = known?.get(name);
  if (known === undefined || token === undefined) throw new Error(`No agent called ${name} has joined in this test.`);
  const member = await (await (await startTestGateway(t)).connect()).signIn(token, renamed);
  known.delete(name);
  known.set(renamed, token);
  return member;
}

/** A ticket for the chat server, for the person who runs the gateway, once the chat server is registered. */
export async function ticketForPerson(t: TestContext): Promise<string> {
  return chatTicket(await (await startTestGateway(t)).connect());
}

/**
 * Ask the gateway for a ticket for the chat server. The chat server may be a
 * moment from being registered, so a refusal is tried again for a few seconds
 * before it is reported.
 */
async function chatTicket(gateway: GatewayConnection): Promise<string> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      return await gateway.ticket({ kind: "chat", name: "chat" });
    } catch (error) {
      if (Date.now() > deadline) throw new Error("The chat server did not register with the gateway", { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

/**
 * Ask the gateway for a ticket and hand it to the chat server. The chat server
 * may be a moment from being able to ask the gateway, so a refusal is tried
 * again for a few seconds before it is reported.
 */
async function enterWith(t: TestContext, endpoint: ChatEndpoint, gateway: GatewayConnection): Promise<Entered> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const ticket = await chatTicket(gateway);
      const connection = await connectLocal(endpoint);
      try {
        const me = await connection.chat.enter(ticket);
        stopAfter(t, () => connection.close());
        return { ...connection, me };
      } catch (error) {
        await connection.close().catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (Date.now() > deadline) throw new Error("Could not come in to chat", { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}
