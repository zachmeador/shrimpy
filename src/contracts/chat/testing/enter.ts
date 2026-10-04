import type { TestContext } from "node:test";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { stopAfter } from "../../../lib/testing/index.ts";
import { type GatewayConnection, reachProgram, type Ticket } from "../../gateway/index.ts";
import { localTransports, newToken } from "../../gateway/node.ts";
import { startTestGateway } from "../../gateway/testing/index.ts";
import { type ChatConnection, connectChat, type Member } from "../index.ts";

/** A connection to the chat server that has come in, and who the gateway says it is. */
export interface Entered extends ChatConnection {
  readonly me: Member;
}

const tokens = new WeakMap<TestContext, Map<string, string>>();

const CHAT = { kind: "chat", name: "chat" } as const;

/**
 * Come in to the chat server as the person who runs the gateway: by its name
 * through the gateway, which has no one signed in on this connection to say
 * otherwise. The test needs the gateway the chat server is registered with,
 * which is the test's own. The connection is closed when the test ends.
 */
export async function enterAsPerson(t: TestContext): Promise<Entered> {
  return enterWith(t, await (await startTestGateway(t)).connect());
}

/**
 * Come in as the agent called `name`. With the token it was given when it
 * joined, it signs in. Without one, the first time in a test it joins the
 * gateway's roster with that name, and after that it signs in with the token
 * that gave it, so it is the same member each time.
 */
export async function enterAsAgent(t: TestContext, name: string, given?: string): Promise<Entered> {
  return enterWith(t, await gatewayAsAgent(t, name, given));
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
 * under another name does. It is `renamed` from then on, to this helper and to
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

/**
 * Ask the gateway for a ticket for the chat server. The chat server may be a
 * moment from being registered, so a refusal is tried again for a few seconds
 * before it is reported.
 */
async function chatTicket(gateway: GatewayConnection): Promise<Ticket> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      return await gateway.ticket(CHAT);
    } catch (error) {
      if (Date.now() > deadline) throw new Error("The chat server did not register with the gateway", { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

/** A ticket for the chat server, for the person who runs the gateway, once the chat server is registered. */
export async function ticketForPerson(t: TestContext): Promise<string> {
  return (await chatTicket(await (await startTestGateway(t)).connect())).value;
}

/**
 * Connect straight to a chat server's own socket, which no client does and a
 * test of the chat server itself must: it shows what the chat server does with
 * a connection that has not come in, or cannot be told who it is. The test
 * closes the connection.
 */
export function connectToSocket(program: { serverId: string; socket: string }): Promise<ChatConnection> {
  return connectChat({
    serverId: program.serverId,
    transportFactory: createUnixTransportFactory({ path: program.socket }),
  });
}

/**
 * Reach the chat server by its name through the gateway and come in with the
 * ticket. The chat server may be a moment from being able to ask the gateway
 * whose a ticket is, so a refusal is tried again for a few seconds before it is
 * reported.
 */
async function enterWith(t: TestContext, gateway: GatewayConnection): Promise<Entered> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const { connection, entered } = await reachProgram({
        gateway,
        transports: localTransports(),
        target: CHAT,
        connect: connectChat,
        enter: (opened, ticket) => opened.chat.enter(ticket),
      });
      stopAfter(t, () => connection.close());
      return { ...connection, me: entered };
    } catch (error) {
      if (Date.now() > deadline) throw new Error("Could not come in to chat", { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}
