import {
  agentMember,
  type Channel,
  type Member,
  type Message,
  personMember,
  type Receipt,
  type Thread,
  type ThreadView,
} from "../../../../contracts/chat/index.ts";
import type { Registration } from "../../../../contracts/gateway/index.ts";
import { SHRIMPY_VERSION } from "../../../../lib/version/index.ts";
import type { Dm, Model } from "../index.ts";

export const zach = personMember("zach");

/** A model with nothing wrong and nothing on it: the agents screen, every link up, no agents. */
export function aModel(parts: Partial<Model> = {}): Model {
  return {
    me: zach,
    where: { screen: "agents" },
    gateway: { state: "up" },
    listing: { programs: [], version: SHRIMPY_VERSION },
    chat: { state: "up" },
    agent: undefined,
    dms: {},
    thread: undefined,
    session: undefined,
    notice: undefined,
    ...parts,
  };
}

/** An agent as the gateway lists it. */
export function anAgent(name: string, version = SHRIMPY_VERSION): Registration {
  return { kind: "agent", name, serverId: `${name}-id`, socket: `/tmp/${name}.sock`, pid: 100, version };
}

export function aChatServer(version = SHRIMPY_VERSION): Registration {
  return { kind: "chat", name: "chat", serverId: "chat-id", socket: "/tmp/chat.sock", pid: 101, version };
}

/** A thread, with the fields a test cares about; the rest are plain. */
export function aThread(id: string, parts: Partial<Thread> = {}): Thread {
  return {
    id,
    channelId: "ch_1",
    main: false,
    name: null,
    preview: null,
    archived: false,
    updatedAt: 0,
    working: [],
    ...parts,
  };
}

export function aDm(agent: string, threads: Thread[]): Dm {
  const channel: Channel = { id: "ch_1", kind: "dm", name: agent, members: [zach, agentMember(agent)] };
  return { channel, threads };
}

export function aMessage(id: string, author: Member, text: string, parts: Partial<Message> = {}): Message {
  return {
    id,
    seq: Number(id.replace(/\D/g, "")) || 1,
    channelId: "ch_1",
    threadId: "th_1",
    author,
    text,
    sentAt: 0,
    addressed: [],
    receipts: [],
    ...parts,
  };
}

export function aReceipt(agent: string, status: Receipt["status"], detail: string | null = null): Receipt {
  return { memberId: agentMember(agent).id, status, reply: null, detail };
}

export function aThreadView(thread: Thread, messages: Message[], earlier = 0): ThreadView {
  return { thread, messages, earlier };
}

/** A model on a thread of an agent's, with whatever else `parts` adds. */
export function onThread(agent: string, thread: Thread, view: ThreadView | undefined, parts: Partial<Model> = {}): Model {
  return aModel({
    where: { screen: "thread", agent, thread: thread.id },
    listing: { programs: [anAgent(agent), aChatServer()], version: SHRIMPY_VERSION },
    agent: { state: "up" },
    dms: { [agent]: aDm(agent, [thread]) },
    thread: view,
    ...parts,
  });
}
