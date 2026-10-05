import type { TestContext } from "node:test";
import { DisconnectedError } from "@earendil-works/pi-client";
import { type ChatConnection, connectChat, type Message } from "../../../contracts/chat/index.ts";
import { gatewayAsAgent } from "../../../contracts/chat/testing/index.ts";
import { localTransports } from "../../../contracts/gateway/node.ts";
import { backoff } from "../../../lib/retry/index.ts";
import { stopAfter, useRuntimeDir } from "../../../lib/testing/index.ts";
import type { Outstanding } from "../../inputs/index.ts";
import { type ChatLink, openChatLink } from "../../links/index.ts";
import { type ChatServer, SCOUT, startChatServer, type Talk, talkTo } from "../../testing/index.ts";
import { type ChatDelivery, createDelivery, type DeliveryOptions } from "../index.ts";

type Method = "post" | "leaveReceipt";

/** What goes wrong between the agent and chat, at the agent's end of the connection. */
export interface Faults {
  /** Make the next `times` calls of `method` fail with `error`, before they reach chat. */
  fail(method: Method, error: Error, times?: number): void;
  /** Let the next post reach chat, and then lose the connection before its answer comes back. */
  loseAnswerToNextPost(): void;
  /** How many times `method` was called, failed calls included. */
  calls(method: Method): number;
}

export interface ChatRig extends Talk {
  readonly chat: ChatServer;
  /** The agent's way to chat. */
  readonly link: ChatLink;
  /** A delivery over that link. */
  readonly delivery: ChatDelivery;
  readonly faults: Faults;
  /** What the link and the delivery reported. */
  readonly errors: Error[];
  /** The event a message of the person's made, as the agent would have taken it up. */
  outstanding(message: Message): Outstanding;
}

/**
 * The agent Scout's way to chat, and a delivery over it, wired to the real chat
 * server and gateway, with the person who runs the gateway to talk to it.
 * Scout is a member of the roster here, signed in on a connection to the
 * gateway that makes the tickets it comes in with, without being a running
 * agent. Pauses between retries are a few milliseconds. The delivery and the
 * link are stopped when the test ends.
 */
export async function startChatRig(
  t: TestContext,
  options: Pick<DeliveryOptions, "messageLimit"> = {},
): Promise<ChatRig> {
  useRuntimeDir(t);
  const chat = await startChatServer(t);
  const gateway = await gatewayAsAgent(t, SCOUT);
  const talk = await talkTo(chat);
  const errors: Error[] = [];
  const faults = planFaults();

  const link = openChatLink({
    gateway: { untilUp: () => Promise.resolve(gateway) },
    transports: localTransports(),
    connect: async (connecting) => faulty(await connectChat(connecting), faults),
    onError: (error) => errors.push(error),
    backoff: backoff({ firstMs: 5, maxMs: 20 }),
  });
  const delivery = createDelivery({
    recordsId: "rec_test",
    onError: (error) => errors.push(error),
    backoff: () => backoff({ firstMs: 5, maxMs: 20 }),
    ...(options.messageLimit === undefined ? {} : { messageLimit: options.messageLimit }),
  });
  delivery.attach(link);
  // Stops run newest first: the delivery stops before the link it uses.
  stopAfter(t, () => link.close());
  stopAfter(t, () => delivery.close());

  return {
    ...talk,
    chat,
    link,
    delivery,
    faults: faults.faults,
    errors,
    outstanding: (message) => ({
      event: { kind: "posted", id: message.event, seq: message.seq, author: message.author.name, sentAt: message.sentAt, text: message.text },
      threadId: message.threadId,
      channelId: message.channelId,
      earlier: [],
    }),
  };
}

interface FaultPlan {
  failures: Map<Method, { error: Error; times: number }>;
  counts: Map<Method, number>;
  loseAnswer: boolean;
  /** What a test is handed to set faults. */
  faults: Faults;
}

function planFaults(): FaultPlan {
  const plan: FaultPlan = {
    failures: new Map(),
    counts: new Map(),
    loseAnswer: false,
    faults: {
      fail(method, error, times = 1) {
        plan.failures.set(method, { error, times });
      },
      loseAnswerToNextPost() {
        plan.loseAnswer = true;
      },
      calls: (method) => plan.counts.get(method) ?? 0,
    },
  };
  return plan;
}

/** The connection, with the calls of the plan going wrong. Everything else goes to chat as it is. */
function faulty(connection: ChatConnection, plan: FaultPlan): ChatConnection {
  const heard: ((reason: Error | undefined) => void)[] = [];
  const lose = (): void => {
    void connection.close();
    for (const listener of heard) listener(new Error("The connection was lost."));
  };
  const begin = (method: Method): void => {
    plan.counts.set(method, (plan.counts.get(method) ?? 0) + 1);
    const failure = plan.failures.get(method);
    if (failure === undefined || failure.times === 0) return;
    failure.times -= 1;
    throw failure.error;
  };
  return {
    ...connection,
    onDisconnect(listener) {
      connection.onDisconnect(listener);
      heard.push(listener);
    },
    chat: {
      ...connection.chat,
      async post(threadId, text, requestId, signal) {
        begin("post");
        const posted = await connection.chat.post(threadId, text, requestId, signal);
        if (plan.loseAnswer) {
          plan.loseAnswer = false;
          lose();
          throw new DisconnectedError("Client is disconnected");
        }
        return posted;
      },
      leaveReceipt(messageIds, receipt, signal) {
        begin("leaveReceipt");
        return connection.chat.leaveReceipt(messageIds, receipt, signal);
      },
    },
  };
}
