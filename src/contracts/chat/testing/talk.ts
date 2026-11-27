import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { eventually } from "../../../lib/testing/index.ts";
import { type Client, valueOf } from "../../gateway/index.ts";
import { startTestGateway } from "../../gateway/testing/index.ts";
import { type Attachment, type Chat, type ChatEvent, fetchFile, type FileToSend, type Member, type Message, type Receipt, sendFile, type Thread } from "../index.ts";
import { memberNamed, onChannel, onChat } from "./speaking.ts";

const context = BACKGROUND_CONTEXT;

/** A person's side of a DM with an agent, on a chat server that may go away and come back. */
export interface Talk {
  /** You, who talk to the agent. */
  readonly me: Member;
  /** The agent you talk to, as the roster has it. */
  readonly partner: Member;
  /** The thread of the DM you talk in, which you started. */
  readonly thread: Thread;
  /** Start a side thread in the DM. */
  newThread(name?: string): Promise<Thread>;
  /** Say something in a thread, the one you talk in unless another is given. */
  say(text: string, threadId?: string): Promise<Message>;
  /** Say something with files in a thread, the one you talk in unless another is given. */
  send(text: string, files: readonly FileToSend[], threadId?: string): Promise<Message>;
  /** The bytes of a file that came with a message. */
  download(attachment: Attachment): Promise<Uint8Array>;
  /** Change what a message of yours says. */
  edit(message: Message, text: string): Promise<Message>;
  /** Delete a message of yours. */
  remove(message: Message): Promise<Message>;
  /** Put an emoji on a message, yours or the agent's. */
  react(message: Message, emoji: string): Promise<Message>;
  /** Take your own emoji back off a message. */
  unreact(message: Message, emoji: string): Promise<Message>;
  /** Everything said in a thread, as it now stands, oldest first. */
  said(threadId?: string): Promise<Message[]>;
  /** What the agent said in a thread, oldest first, without its triggers' lines. */
  replies(threadId?: string): Promise<Message[]>;
  /** Every event in the DM's channel, oldest first: the log, as your feed has it. */
  events(): Promise<ChatEvent[]>;
  /** The IDs of the members chat says are working in a thread. */
  working(threadId?: string): Promise<string[]>;
  /** Resolve once the agent is marked as working in a thread. */
  untilWorking(threadId?: string): Promise<void>;
  /** Resolve once nobody is marked as working in a thread. */
  untilIdle(threadId?: string): Promise<void>;
  /** Resolve with the receipt the agent leaves on a message's post. */
  receiptOn(message: Message, timeoutMs?: number): Promise<Receipt>;
  /** Resolve with the receipt the agent leaves on an event. */
  receiptFor(event: ChatEvent, timeoutMs?: number): Promise<Receipt>;
}

/** The thread each test talks to each agent in, by the agent's member ID. */
const talkedIn = new WeakMap<TestContext, Map<string, string>>();

/**
 * You, in a thread of your DM with the agent called `agentName` on the chat
 * server, made if need be once the agent has joined the test gateway's roster.
 * It is the thread the test talked to the agent in before, as before the agent
 * started again, while chat still has it, and otherwise one you start. You
 * link to the gateway again by yourself when it has been away.
 */
export async function talkTo(t: TestContext, agentName: string): Promise<Talk> {
  let linked: Promise<Client> | undefined;
  const connection = (): Promise<Client> => {
    linked ??= startTestGateway(t)
      .then((gateway) => gateway.connect())
      .then(
        (client) => {
          void client.closed.then(() => {
            linked = undefined;
          });
          return client;
        },
        (error: unknown) => {
          linked = undefined;
          throw error;
        },
      );
    return linked;
  };

  const partner = await memberNamed(t, agentName);
  const first = await connection();
  if (first.you === null) throw new Error("The gateway took the person's client for nobody.");
  const me: Member = { id: first.you.id, kind: first.you.kind, name: first.you.name };
  const dm = await onChat(first, async (held) => valueOf(await held.openDm({ member: partner.id }, context)));
  const known = talkedIn.get(t) ?? new Map<string, string>();
  talkedIn.set(t, known);
  const before = await onChannel(first, dm.id, (held) => held.threads.value.find((each) => each.id === known.get(partner.id)));
  const thread = before ?? (await onChat(first, async (held) => valueOf(await held.createThread({ channel: dm.id, name: null }, context))));
  known.set(partner.id, thread.id);

  /** What `ask` asks of chat, as you, linked again if need be. */
  const asking = async <T>(ask: (chat: Reference<typeof Chat>) => Promise<T>): Promise<T> => onChat(await connection(), ask);
  const said = (threadId = thread.id): Promise<Message[]> =>
    asking(async (held) => valueOf(await held.read({ thread: threadId, before: null, limit: 200 }, context)));
  const working = async (threadId = thread.id): Promise<string[]> =>
    onChannel(await connection(), dm.id, (held) => {
      const found = held.threads.value.find((candidate) => candidate.id === threadId);
      return found?.working.map((mark) => mark.memberId) ?? [];
    });
  const receipt = (eventId: string, threadId: string, timeoutMs?: number): Promise<Receipt> =>
    eventually(
      async () =>
        (await said(threadId))
          .flatMap((message) => message.receipts)
          .find((candidate) => candidate.event === eventId && candidate.memberId === partner.id),
      (found) => found !== undefined,
      { what: `a receipt on the event ${eventId}`, timeoutMs },
    ) as Promise<Receipt>;
  return {
    me,
    partner,
    thread,
    newThread: (name) => asking(async (held) => valueOf(await held.createThread({ channel: dm.id, name: name ?? null }, context))),
    say: (text, threadId = thread.id) => asking(async (held) => valueOf(await held.post({ thread: threadId, text, request: randomUUID() }, context))),
    send: (text, files, threadId = thread.id) =>
      asking(async (held) => {
        const sender = {
          upload: async (upload: { name: string; mediaType: string; size: number }, request: string) =>
            valueOf(await held.upload({ ...upload, request }, context)),
          uploadPiece: async (attachment: string, offset: number, data: Uint8Array) =>
            valueOf(await held.uploadPiece({ attachment, offset, data }, context)),
        };
        const attachments = [];
        for (const file of files) attachments.push(await sendFile(sender, file, randomUUID()));
        return valueOf(await held.post({ thread: threadId, text, request: randomUUID(), attachments }, context));
      }),
    download: (attachment) =>
      asking((held) =>
        fetchFile(attachment.size, async (offset, length) => valueOf(await held.download({ attachment: attachment.id, offset, length }, context))),
      ),
    edit: (message, text) => asking(async (held) => valueOf(await held.edit({ message: message.id, text, request: randomUUID() }, context))),
    remove: (message) => asking(async (held) => valueOf(await held.delete({ message: message.id, request: randomUUID() }, context))),
    react: (message, emoji) => asking(async (held) => valueOf(await held.react({ message: message.id, emoji, request: randomUUID() }, context))),
    unreact: (message, emoji) => asking(async (held) => valueOf(await held.unreact({ message: message.id, emoji, request: randomUUID() }, context))),
    said,
    async replies(threadId) {
      return (await said(threadId)).filter((message) => message.author.id === partner.id && message.wake === null);
    },
    async events() {
      const events = await asking(async (held) => valueOf(await held.events({ after: 0, limit: 200 }, context)));
      return events.filter((event) => event.message.channelId === dm.id);
    },
    working,
    async untilWorking(threadId) {
      await eventually(() => working(threadId), (ids) => ids.length > 0, { what: "the agent to take a message up" });
    },
    async untilIdle(threadId) {
      await eventually(() => working(threadId), (ids) => ids.length === 0, { what: "the mark to be cleared" });
    },
    receiptOn: (message, timeoutMs) => receipt(message.event, message.threadId, timeoutMs),
    receiptFor: (event, timeoutMs) => receipt(event.id, event.message.threadId, timeoutMs),
  };
}
