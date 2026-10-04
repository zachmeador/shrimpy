import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { offer, type StandIn, startStandIn, stopAfter } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import type { Registration } from "../../gateway/index.ts";
import { keepRegistered } from "../../gateway/node.ts";
import { Chat, type ChatConnection, type ChatEndpoint, type Member } from "../index.ts";
import { connectLocal } from "../node.ts";
import { type ScriptedChat, scriptedChat } from "./scripted.ts";

export interface StandInChatOptions {
  /** The chat to serve, when the test made one. By default a new, empty one. */
  chat?: ScriptedChat;
  /** The server ID it claims, a random one by default. It is the same each time the chat comes back. */
  serverId?: string;
  /** Register with this machine's gateway, the way the chat server does. */
  register?: boolean;
}

export interface StandInChat {
  /** What the chat holds and how it is scripted. It lives through outages. */
  readonly chat: ScriptedChat;
  readonly serverId: string;
  /** Absolute path of its Unix socket, in the test's runtime directory where the chat server would be. */
  readonly socket: string;
  /** What `connectLocal` takes. */
  readonly endpoint: ChatEndpoint;
  /** What a gateway lists for it. */
  readonly registration: Registration;
  /** How many connections are open right now. */
  connections(): number;
  /** Connect over the socket and say who you are. The connection is closed when the test ends. */
  join(member: Member): Promise<ChatConnection>;
  /** Stop listening and cut every connection, like a chat server that went away. What was said stays. */
  outage(): Promise<void>;
  /** Listen again where it was, with the same server ID, like a chat server that came back. */
  recover(): Promise<void>;
}

/**
 * The chat server as a real server on a real socket, for tests of whatever
 * talks to chat over a connection. It answers with a scripted chat in memory,
 * not the chat server's code. It listens where the chat server does, so the test
 * needs a runtime directory of its own, and it is closed when the test ends.
 */
export async function startStandInChat(t: TestContext, options: StandInChatOptions = {}): Promise<StandInChat> {
  const chat = options.chat ?? scriptedChat();
  const serverId = options.serverId ?? randomUUID();
  const listen = (): Promise<StandIn> =>
    startStandIn(t, "chat", {
      serverId,
      offer() {
        const served = chat.serve();
        return offer(Chat, served.chat, served.end);
      },
    });

  let listening: StandIn | undefined = await listen();
  const { socket } = listening;
  const endpoint: ChatEndpoint = { serverId, socket, pid: process.pid };
  const registration: Registration = { kind: "chat", name: "chat", ...endpoint, version: SHRIMPY_VERSION };
  if (options.register === true) {
    const kept = keepRegistered(registration);
    stopAfter(t, () => kept.stop());
  }

  return {
    chat,
    serverId,
    socket,
    endpoint,
    registration,
    connections: () => listening?.connections() ?? 0,
    async join(member) {
      const connection = await connectLocal(endpoint);
      stopAfter(t, () => connection.close());
      await connection.chat.identify(member);
      return connection;
    },
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
