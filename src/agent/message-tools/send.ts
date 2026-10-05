import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolExecutionApi } from "@earendil-works/pi-durable";
import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { inParts } from "../chat/index.ts";
import type { MessageToolsOptions } from "./options.ts";
import { placeOf } from "./place.ts";
import { answer, callSignal, chatFailure, failure } from "./results.ts";
import * as words from "./words.ts";

/**
 * `send_message`: post a message now, without ending the turn. With nothing
 * said about where, it goes to the thread the turn came from; `to` names a DM
 * or a room the agent is in, or one of its threads. The turn's final text is
 * still its reply, so this is never the way to answer.
 */
export function sendMessage(options: MessageToolsOptions) {
  const limit = options.messageLimit ?? MAX_MESSAGE_LENGTH;
  return defineTool({
    name: "send_message",
    description: words.SEND_DESCRIPTION,
    parameters: Type.Object({
      text: Type.String({ description: words.SEND_TEXT }),
      to: Type.Optional(Type.String({ description: words.SEND_TO })),
    }),
    // Messages sent in one round reach the thread in the order they were called.
    executionMode: "sequential",
    async execute({ text, to }, api, context) {
      const live = options.chat();
      if (live === undefined) return failure(words.SEND_UNREACHABLE);
      const parts = inParts(text, limit);
      if (parts.length === 0) return failure(words.SEND_EMPTY);

      const signal = callSignal(live, context);
      let confirmed = 0;
      let asking = false;
      try {
        const place = await placeOf({
          argument: "to",
          value: to,
          conversationId: api.conversationId,
          read: api,
          chat: live.chat,
          self: live.self,
          gateway: options.gateway(),
          startDm: true,
          context,
          signal,
        });
        if ("problem" in place) return failure(place.problem);
        for (const [index, part] of parts.entries()) {
          // A connection already lost means this part was never sent, which is not the same as not knowing.
          signal.throwIfAborted();
          asking = true;
          await live.chat.post(place.threadId, part, requestId(options.recordsId, api, index), signal);
          asking = false;
          confirmed += 1;
        }
        return answer(words.posted(place.label, parts.length, place.here));
      } catch (error) {
        const why = chatFailure(error, live, context);
        if ("refused" in why) return failure(words.sendRefused(why.refused, confirmed, parts.length));
        // A post that was out when the connection ended may have reached chat.
        if (asking) return failure(words.sendUncertain(confirmed, parts.length));
        return failure(confirmed === 0 ? words.SEND_UNREACHABLE : words.sendCutOff(confirmed, parts.length));
      }
    },
  });
}

/**
 * What names one part of one call. Chat posts a request ID once, so a call that
 * runs again posts nothing twice. The call's own ID is the model's and may
 * repeat in another session, so the engine's number for the call goes with it,
 * and the engine numbers its tasks again in a new database, so what the agent's
 * records are called goes with both.
 */
function requestId(recordsId: string, api: ToolExecutionApi, part: number): string {
  const call = api.callId.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
  return `send-${recordsId}-${String(api.taskId)}-${call}-${String(part)}`;
}
