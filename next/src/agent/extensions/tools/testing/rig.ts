import type { TestContext } from "node:test";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { ToolExecutionApi, ToolRegistration } from "@earendil-works/pi-durable";
import type { ChatClient, Thread } from "../../../../contracts/chat/index.ts";
import { type ScriptedChat, scriptedChat } from "../../../../contracts/chat/testing/index.ts";
import { stopAfter } from "../../../../lib/testing/index.ts";
import type { LiveChat } from "../../../links/index.ts";
import { scout, zach } from "../../../testing/index.ts";
import { messageTools } from "../index.ts";

export interface ToolRigOptions {
  /** Characters in the longest message the agent posts. */
  messageLimit?: number;
  /** Whether the session is behind Zach's main thread. Yes, unless this says otherwise. */
  inThread?: boolean;
  /** Stand between the tools and chat's calls, to make some of them go wrong. */
  through?: (chat: ChatClient, scripted: ScriptedChat) => ChatClient;
}

/** What a tool answered. */
export interface ToolRun {
  text: string;
  isError: boolean;
}

export interface ToolRig {
  readonly chat: ScriptedChat;
  /** The main thread of the DM between Zach and the agent, which is where the session is. */
  readonly thread: Thread;
  /** Run a tool as the engine does. Calls with the same `taskId` and `callId` are the same call run again. */
  call(
    name: "send_message" | "read_messages",
    args: Record<string, unknown>,
    call?: { taskId?: number; callId?: string; signal?: AbortSignal },
  ): Promise<ToolRun>;
  /** Make the tools find chat unreachable, or reachable again. It is reachable to begin with. */
  reachable(reachable: boolean): void;
  /** The connection the tools use. */
  readonly live: LiveChat;
}

/**
 * The message tools for the agent Scout, wired to a scripted chat where Zach
 * has a DM with it, over a connection that is closed when the test ends.
 */
export async function startToolRig(t: TestContext, options: ToolRigOptions = {}): Promise<ToolRig> {
  const chat = scriptedChat();
  const { thread } = chat.dm(zach, scout);
  const connection = await chat.join(scout);
  stopAfter(t, () => connection.close());
  const lost = new AbortController();
  connection.onDisconnect((reason) => lost.abort(reason ?? new Error("The connection to chat was closed.")));
  const live: LiveChat = { chat: options.through?.(connection.chat, chat) ?? connection.chat, lost: lost.signal };

  let reachable = true;
  const extension = messageTools({
    self: scout,
    chat: () => (reachable && !live.lost.aborted ? live : undefined),
    ...(options.messageLimit === undefined ? {} : { messageLimit: options.messageLimit }),
  });
  const tool = (name: string): ToolRegistration => {
    const found = extension.tools?.find((each) => each.name === name);
    if (found === undefined) throw new Error(`The extension has no tool called ${name}.`);
    return found;
  };

  // The engine's number for the session, and the one document that says which thread it is behind.
  const sessions = options.inThread === false ? {} : { [thread.id]: { conversationId: 1, channelId: thread.channelId, unacted: [] } };
  return {
    chat,
    thread,
    live,
    reachable: (value) => {
      reachable = value;
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
