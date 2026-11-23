import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Host, Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { untilHeard } from "../../../lib/listeners/index.ts";
import { eventually, stopAfter } from "../../../lib/testing/index.ts";
import { type Answer, holding, type Principal, type Revocation, Roster, valueOf } from "../../gateway/index.ts";
import { linkTestAgent, startTestGateway, type TestAgent } from "../../gateway/testing/index.ts";
import { Channel, Chat, type ChatEvent, type LeftReceipt, type Member, type Message, Thread } from "../index.ts";

const context = BACKGROUND_CONTEXT;

/** Anything with a host that holds chat's objects: a client linked to the gateway, or an agent's program. */
export type Holder = { readonly host: Host<Principal, Revocation> };

/**
 * A member of chat as a test speaks for it. Each call answers with what it
 * did, or fails with what chat refused.
 */
export interface Speaking {
  /** The member, as chat takes it. */
  readonly me: Member;
  /** The member's channels, as chat has them once everything it did before it was asked is in. */
  channels(): Promise<readonly Channel[]>;
  readOnlyChannels(): Promise<readonly Channel[]>;
  head(): number;
  threads(channel: string): Promise<readonly Thread[]>;
  read(thread: string, before: number | null, limit: number): Promise<Message[]>;
  post(thread: string, text: string, request?: string): Promise<Message>;
  createThread(channel: string, name: string | null): Promise<Thread>;
  openDm(member: string): Promise<Channel>;
  createRoom(name: string, members: string[]): Promise<Channel>;
  addMembers(channel: string, members: string[]): Promise<Channel>;
  edit(thread: string, message: string, text: string): Promise<Message>;
  delete(thread: string, message: string): Promise<Message>;
  react(thread: string, message: string, emoji: string): Promise<Message>;
  unreact(thread: string, message: string, emoji: string): Promise<Message>;
  /** Archive a thread, or bring it back, at the revision it is at. */
  archive(thread: string, archived: boolean): Promise<Thread>;
  events(after: number, limit: number): Promise<ChatEvent[]>;
  leaveReceipt(events: string[], receipt: LeftReceipt): Promise<void>;
  /** Mark the member at work in a thread, or not, for as long as this holds chat. */
  setWorking(thread: string, working: boolean): Promise<void>;
}

/** The thread `id` as `holder` holds it, for as long as `work` runs. */
export const onThread = <T>(holder: Holder, id: string, work: (thread: Reference<typeof Thread>) => Promise<T> | T) =>
  holding(holder.host.get(Thread, { thread: id }, context), work);

/** The channel `id` as `holder` holds it, for as long as `work` runs. */
export const onChannel = <T>(holder: Holder, id: string, work: (channel: Reference<typeof Channel>) => Promise<T> | T) =>
  holding(holder.host.get(Channel, { channel: id }, context), work);

/** `holder` as a member of chat, for as long as `work` runs. */
export const onChat = <T>(holder: Holder, work: (chat: Reference<typeof Chat>) => Promise<T> | T) =>
  holding(holder.host.get(Chat, {}, context), work);

/**
 * Whom chat takes the holder of `chat` for, once it takes it for a member: at
 * once when it does, and otherwise as soon as chat hears of it from the roster,
 * which can come after the gateway has the member.
 */
async function knownAs(chat: Reference<typeof Chat>): Promise<Member> {
  const watch = await chat.you.watch(context);
  try {
    if (watch.value !== null) return watch.value;
    return await untilHeard<Member>((heard) => {
      watch.start(async (call) => {
        if (call.kind === "value" && call.value !== null) heard(call.value);
      });
      return () => void watch.stop();
    });
  } finally {
    void watch.stop();
  }
}

/** `holder` as a member of chat, holding `Chat` until the test ends, once chat knows it. */
export async function speakingAs(t: TestContext, holder: Holder): Promise<Speaking> {
  const chat = await holder.host.get(Chat, {}, context);
  stopAfter(t, () => chat.release());
  const me = await knownAs(chat);
  const inThread = (thread: string, work: (held: Reference<typeof Thread>) => Promise<Answer<Message>>) =>
    onThread(holder, thread, async (held) => valueOf(await work(held)));
  // A call's answer comes after every change chat made before it, so what chat shows is caught up once one is answered.
  const caughtUp = async (): Promise<void> => {
    valueOf(await chat.events({ after: chat.head.value, limit: 1 }, context));
  };
  return {
    me,
    channels: async () => {
      await caughtUp();
      return chat.channels.value;
    },
    readOnlyChannels: async () => {
      await caughtUp();
      return chat.readOnlyChannels.value;
    },
    head: () => chat.head.value,
    threads: (channel) => onChannel(holder, channel, (held) => held.threads.value),
    read: (thread, before, limit) => onThread(holder, thread, async (held) => valueOf(await held.read({ before, limit }, context))),
    post: (thread, text, request = randomUUID()) => inThread(thread, (held) => held.post({ text, request }, context)),
    createThread: (channel, name) => onChannel(holder, channel, async (held) => valueOf(await held.createThread({ name }, context))),
    openDm: async (member) => valueOf(await chat.openDm({ member }, context)),
    createRoom: async (name, members) => valueOf(await chat.createRoom({ name, members }, context)),
    addMembers: (channel, members) => onChannel(holder, channel, async (held) => valueOf(await held.addMembers({ members }, context))),
    edit: (thread, message, text) => inThread(thread, (held) => held.edit({ message, text }, context)),
    delete: (thread, message) => inThread(thread, (held) => held.delete({ message }, context)),
    react: (thread, message, emoji) => inThread(thread, (held) => held.react({ message, emoji }, context)),
    unreact: (thread, message, emoji) => inThread(thread, (held) => held.unreact({ message, emoji }, context)),
    archive: (thread, archived) =>
      onThread(holder, thread, async (held) => valueOf(await held.archive({ archived, revision: held.thread.value?.revision ?? 0 }, context))),
    events: async (after, limit) => valueOf(await chat.events({ after, limit }, context)),
    async leaveReceipt(events, receipt) {
      valueOf(await chat.leaveReceipt({ events, receipt }, context));
    },
    async setWorking(thread, working) {
      valueOf(await chat.setWorking({ thread, working }, context));
    },
  };
}

/** You, linked to the test's gateway on its socket, as a member of chat. The chat server has to be running. */
export async function enterAsPerson(t: TestContext): Promise<Speaking> {
  const client = await (await startTestGateway(t)).connect();
  return speakingAs(t, client);
}

/**
 * The agent called `name`, as a member of chat: a small agent's program,
 * linked to the test's gateway, on its roster, and holding chat as the agent.
 */
export async function enterAsAgent(t: TestContext, name: string): Promise<Speaking & { readonly agent: TestAgent }> {
  await startTestGateway(t);
  const agent = await linkTestAgent(t, name);
  return { ...(await speakingAs(t, agent)), agent };
}

/**
 * The agent called `name`, joined to the test gateway's roster with a token of
 * its own, and not linked to it, as chat knows members, once chat does. The
 * chat server has to be running.
 */
export async function joinRoster(t: TestContext, name: string): Promise<Member> {
  await startTestGateway(t);
  const agent = await linkTestAgent(t, name);
  const member = await onChat(agent, knownAs);
  await agent.stop();
  return member;
}

/** The member of the test gateway's roster called `name`, as chat knows members, once it has joined. */
export async function memberNamed(t: TestContext, name: string): Promise<Member> {
  const client = await (await startTestGateway(t)).connect();
  const found = await holding(client.host.get(Roster, {}, context), (roster) =>
    eventually(
      () => roster.members.value.find((member) => member.name === name),
      (member) => member !== undefined,
      { what: `${name} to join the roster` },
    ),
  );
  return { id: found!.id, kind: found!.kind, name: found!.name };
}
