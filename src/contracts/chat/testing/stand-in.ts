import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { isRefusal, refuse } from "../../../lib/refusal/index.ts";
import { backoff } from "../../../lib/retry/index.ts";
import { offer, type StandIn, startStandIn, stopAfter } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import { keepRegistered, type KeptRegistration } from "../../gateway/node.ts";
import { Chat } from "../index.ts";
import { type Entered, enterAsAgent, enterAsPerson } from "./enter.ts";
import { type ScriptedChat, scriptedChat, type ScriptedIdentity } from "./scripted.ts";

export interface StandInChatOptions {
  /** The chat to serve, when the test made one. By default a new, empty one. */
  chat?: ScriptedChat;
}

export interface StandInChat {
  /** What the chat holds and how it is scripted. It lives through outages. */
  readonly chat: ScriptedChat;
  /** How many connections are open right now. */
  connections(): number;
  /** Come in as the person who runs the gateway. The connection is closed when the test ends. */
  asPerson(): Promise<Entered>;
  /**
   * Come in as the agent called `name`: with its token if it has one, as a
   * stand-in agent does, or else by joining the roster the first time. The
   * connection is closed when the test ends.
   */
  asAgent(name: string, token?: string): Promise<Entered>;
  /** Stop listening and cut every connection, like a chat server that went away. What was said stays. */
  outage(): Promise<void>;
  /** Listen again where it was, with the same server ID, like a chat server that came back. */
  recover(): Promise<void>;
}

/**
 * A stand-in for the chat server as a real server on a real socket, for the
 * tests of the console. It answers with a scripted chat in memory, not the chat
 * server's code, but it lets people in the way the chat server does: it is
 * registered with the gateway, which is the real one and pipes connections made
 * by its name to it, and asks the gateway whose a ticket is. It listens where
 * the chat server does, so the test needs a runtime directory of its own and a
 * gateway, and it is closed when the test ends.
 */
export async function startStandInChat(t: TestContext, options: StandInChatOptions = {}): Promise<StandInChat> {
  const chat = options.chat ?? scriptedChat();
  const serverId = randomUUID();
  const registered: { kept?: KeptRegistration } = {};
  const identity: ScriptedIdentity = {
    async redeem(ticket) {
      const gateway = registered.kept?.current() ?? refuse("The stand-in chat can't reach the gateway.", "service_not_allowed");
      try {
        const { id, kind, name } = await gateway.redeem(ticket);
        return { id, kind, name };
      } catch (error) {
        if (isRefusal(error)) refuse(error.message);
        throw error;
      }
    },
    async member(id) {
      const gateway = registered.kept?.current() ?? refuse("The stand-in chat can't reach the gateway.", "service_not_allowed");
      const found = (await gateway.members()).find((each) => each.id === id);
      return found === undefined ? undefined : { id: found.id, kind: found.kind, name: found.name };
    },
  };
  const listen = (): Promise<StandIn> =>
    startStandIn(t, "chat", {
      serverId,
      offer(presentation) {
        const served = chat.serve(presentation, identity);
        return offer(Chat, served.chat, served.end);
      },
      route: (threadId) => chat.route(threadId),
    });

  let listening: StandIn | undefined = await listen();
  const { socket } = listening;
  const kept = keepRegistered(
    { kind: "chat", serverId, socket, version: SHRIMPY_VERSION },
    { backoff: backoff({ firstMs: 5, maxMs: 20 }) },
  );
  registered.kept = kept;
  stopAfter(t, () => kept.stop());

  return {
    chat,
    connections: () => listening?.connections() ?? 0,
    asPerson: () => enterAsPerson(t),
    asAgent: (name, token) => enterAsAgent(t, name, token),
    async outage() {
      const stopped = listening;
      listening = undefined;
      await stopped?.close();
    },
    async recover() {
      listening ??= await listen();
    },
  };
}
