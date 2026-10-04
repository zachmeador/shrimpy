import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { ToolExecutionApi, ToolRegistration } from "@earendil-works/pi-durable";
import type { ChatClient } from "../../../../contracts/chat/index.ts";
import type { LiveChat } from "../../../links/index.ts";
import { scout, startChatServer, type Talk, talkTo } from "../../../testing/index.ts";
import { messageTools } from "../index.ts";

export interface ToolRigOptions {
  /** Characters in the longest message the agent posts. */
  messageLimit?: number;
  /**
   * Stand between the tools and chat's calls, to make some of them go wrong.
   * `lose` ends the connection, as chat going away does.
   */
  through?: (chat: ChatClient, lose: () => void) => ChatClient;
}

/** What a tool answered. */
export interface ToolRun {
  text: string;
  isError: boolean;
}

/** The message tools for the agent Scout, and Zach to talk to it. */
export interface ToolRig extends Talk {
  /** Scout posts in the main thread of the DM, as the agent does over the connection the tools use. */
  postAsScout(text: string): Promise<void>;
  /** The connection the tools use is lost. */
  lose(): void;
  /** Run a tool as the engine does. Calls with the same `taskId` and `callId` are the same call run again. */
  call(
    name: "send_message" | "read_messages",
    args: Record<string, unknown>,
    call?: { taskId?: number; callId?: string; signal?: AbortSignal },
  ): Promise<ToolRun>;
}

/**
 * The message tools for the agent Scout, wired to the real chat server where
 * Zach has a DM with it, over a connection that is closed when the test ends.
 */
export async function startToolRig(t: TestContext, options: ToolRigOptions = {}): Promise<ToolRig> {
  const chat = await startChatServer(t);
  const talk = await talkTo(chat);
  const connection = await chat.join(scout);
  const lost = new AbortController();
  const lose = (): void => lost.abort(new Error("The connection to chat was closed."));
  connection.onDisconnect((reason) => lost.abort(reason ?? new Error("The connection to chat was closed.")));
  const live: LiveChat = { chat: options.through?.(connection.chat, lose) ?? connection.chat, lost: lost.signal };

  const extension = messageTools({
    self: scout,
    chat: () => (live.lost.aborted ? undefined : live),
    ...(options.messageLimit === undefined ? {} : { messageLimit: options.messageLimit }),
  });
  const tool = (name: string): ToolRegistration => {
    const found = extension.tools?.find((each) => each.name === name);
    if (found === undefined) throw new Error(`The extension has no tool called ${name}.`);
    return found;
  };

  // The engine's number for the session, and the one document that says it is behind Zach's main thread.
  const sessions = { [talk.thread.id]: { conversationId: 1, channelId: talk.thread.channelId, unacted: [] } };
  return {
    ...talk,
    lose,
    async postAsScout(text) {
      await connection.chat.post(talk.thread.id, text, randomUUID());
    },
    async call(name, args, call = {}) {
      const api = {
        conversationId: 1,
        taskId: call.taskId ?? 1,
        callId: call.callId ?? "call-0",
        snapshot: () => Promise.resolve({ sessions }),
      } as unknown as ToolExecutionApi;
      const context = call.signal === undefined ? BACKGROUND_CONTEXT : withAbortSignal(call.signal, BACKGROUND_CONTEXT);
      const result = await tool(name).execute(args, api, context);
      const text = (result.content ?? []).map((block) => (block.type === "text" ? block.text : "[image]")).join("");
      return { text, isError: result.isError === true };
    },
  };
}
