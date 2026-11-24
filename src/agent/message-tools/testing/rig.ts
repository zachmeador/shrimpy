import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { ToolExecutionApi, ToolRegistration } from "@earendil-works/pi-durable";
import { Roster } from "../../../contracts/gateway/index.ts";
import { stopAfter } from "../../../lib/testing/index.ts";
import { type ChatCalls, type LiveChat, openChatLink } from "../../links/index.ts";
import { type ChatServer, SCOUT, startChatServer } from "../../testing/index.ts";
import { messageTools } from "../durable.ts";
import { type Talk, talkTo } from "../../../contracts/chat/testing/index.ts";

export interface ToolRigOptions {
  /** Characters in the longest message the agent posts. */
  messageLimit?: number;
  /**
   * Stand between the tools and chat's calls, to make some of them go wrong.
   * `lose` loses chat, as its going away does.
   */
  through?: (chat: ChatCalls, lose: () => void) => ChatCalls;
}

/** What a tool answered. */
export interface ToolRun {
  text: string;
  isError: boolean;
}

/** The message tools for the agent Scout, and you to talk to it. */
export interface ToolRig extends Talk {
  /** The real chat server and gateway the tools work against. */
  readonly chat: ChatServer;
  /** Scout posts in the main thread of the DM, as the agent does over the link the tools use. */
  postAsScout(text: string): Promise<void>;
  /** The chat the tools use is lost. */
  lose(): void;
  /** Run a tool as the engine does. Calls with the same `taskId` and `callId` are the same call run again. */
  call(
    name: "send_message" | "read_messages",
    args: Record<string, unknown>,
    call?: { taskId?: number; callId?: string; signal?: AbortSignal },
  ): Promise<ToolRun>;
}

const never = new AbortController().signal;

/** What each call kept with `memo`, by its task and call ID, as the engine keeps it across runs of the same call. */
type Memos = Map<string, Map<string, unknown>>;

/**
 * The message tools for the agent Scout, wired to the real chat server and
 * gateway, where you have a DM with it. Scout is a member of the roster here,
 * linked to the gateway as an agent's program is, without being a running
 * agent: the tools are all that is under test.
 */
export async function startToolRig(t: TestContext, options: ToolRigOptions = {}): Promise<ToolRig> {
  const chat = await startChatServer(t);
  const scout = await chat.agent(SCOUT);
  const talk = await talkTo(t, SCOUT);
  const link = openChatLink(() => undefined);
  link.follow(scout.host);
  stopAfter(t, () => link.close());
  const up = await link.use(async (live) => live, never);
  const lost = new AbortController();
  const lose = (): void => lost.abort(new Error("Chat was lost."));
  const live: LiveChat = {
    chat: options.through?.(up.chat, lose) ?? up.chat,
    self: up.self,
    lost: AbortSignal.any([lost.signal, up.lost]),
  };
  const person = await chat.person();
  const roster = await person.host.get(Roster, {}, BACKGROUND_CONTEXT);

  const extension = messageTools({
    recordsId: "rec_test",
    chat: () => (live.lost.aborted ? undefined : live),
    roster: () => roster.members.value,
    ...(options.messageLimit === undefined ? {} : { messageLimit: options.messageLimit }),
  });
  const tool = (name: string): ToolRegistration => {
    const found = extension.tools?.find((each) => each.name === name);
    if (found === undefined) throw new Error(`The extension has no tool called ${name}.`);
    return found;
  };

  // The engine's number for the session, and the one document that says it is behind the main thread of the DM.
  const sessions = { [talk.thread.id]: { conversationId: 1, channelId: talk.thread.channelId, unacted: [], cancelled: [], missed: [], shown: {} } };
  const memos: Memos = new Map();
  return {
    ...talk,
    chat,
    lose,
    async postAsScout(text) {
      await up.chat.post(talk.thread.id, text, randomUUID(), never);
    },
    async call(name, args, call = {}) {
      const taskId = call.taskId ?? 1;
      const callId = call.callId ?? "call-0";
      const kept = memos.get(`${String(taskId)}/${callId}`) ?? new Map<string, unknown>();
      memos.set(`${String(taskId)}/${callId}`, kept);
      const api = {
        conversationId: 1,
        taskId,
        callId,
        snapshot: () => Promise.resolve({ sessions }),
        // The first value kept under a name stays, as the engine's memo keeps it.
        memo: (memoName: string, ...rest: unknown[]) => {
          if (rest.length === 2 && !kept.has(memoName)) kept.set(memoName, rest[0]);
          return Promise.resolve(kept.get(memoName));
        },
      } as unknown as ToolExecutionApi;
      const context = call.signal === undefined ? BACKGROUND_CONTEXT : withAbortSignal(call.signal, BACKGROUND_CONTEXT);
      const result = await tool(name).execute(args, api, context);
      const text = (result.output ?? []).map((block) => (block.type === "text" ? block.text : "[image]")).join("");
      return { text, isError: result.isError === true };
    },
  };
}
