import { defineTool } from "@earendil-works/pi-durable";
import { arr, bool, obj, opt, str } from "@earendil-works/pi-schema";
import { filesWords, MAX_MESSAGE_LENGTH, type Message, type Thread } from "../../contracts/chat/index.ts";
import { inParts } from "../chat/index.ts";
import { answer, failure, toolRequestId } from "../host/durable.ts";
import { CAN_END_TURN } from "../inputs/index.ts";
import { callSignal, chatFailure } from "../links/index.ts";
import { threadOfSession } from "../records/durable.ts";
import type { Watches } from "../watches/durable.ts";
import type { ChatToolsOptions } from "./options.ts";
import { resolveThread } from "./place.durable.ts";
import { type Sent, sendFiles } from "./send.durable.ts";
import * as words from "./words.ts";

const POST_DESCRIPTION =
  "Post a message immediately without ending your turn. Omit `to` for a mid-turn update in this thread. " +
  "Pass `to: \"@name\"` to start a new DM thread, or `to: \"th_...\"`, `\"@name/<thread>\"`, `\"#room\"`, or `\"#room/<thread>\"` for an existing thread. " +
  "Posting to another agent's DM automatically watches for their reply and wakes this thread when they settle. " +
  "Pass `attach` to send files with it. " +
  "Your final text at the end of a turn is posted to this thread automatically, so don't use `post` for your final reply: to send files with it, use attach.";

export function postTool(options: ChatToolsOptions, watches: Watches) {
  const limit = options.messageLimit ?? MAX_MESSAGE_LENGTH;
  return defineTool({
    name: "post",
    description: POST_DESCRIPTION,
    parameters: obj({
      text: str({ description: "Message text to post." }),
      to: opt(str({ description: 'Target thread: omit for this thread, "@name" for a new DM thread, "th_...", "@name/<thread>", "#room", or "#room/<thread>".' })),
      quiet: opt(bool({ description: "If true, do not send a push notification for this message." })),
      attach: opt(arr(str({ description: words.FILE_PATHS }), { description: "Files to send with the message, which then needs no text." })),
    }),
    executionMode: "sequential",
    async execute({ text, to, quiet, attach }, api, context) {
      const live = options.chat();
      if (live === undefined) return failure(words.UNREACHABLE);
      const parts = inParts(text, limit);
      const paths = attach ?? [];
      if (parts.length === 0 && paths.length === 0) return failure("Message text is empty.");
      if (parts.length === 0) parts.push("");

      const signal = callSignal(live, context);
      let confirmed = 0;
      let asking = false;
      try {
        const place = await resolveThread({
          argument: "to",
          value: to,
          allowNewDm: true,
          conversationId: api.conversationId,
          read: api,
          chat: live.chat,
          self: live.self,
          roster: options.roster(),
          newThread: async (make) => {
            const memo = await api.memo<Thread>("thread", context);
            return memo ?? api.memo("thread", await make(), context);
          },
          context,
          signal,
        });
        if ("problem" in place) return failure(place.problem);

        let files: Sent[] = [];
        if (paths.length > 0) {
          const sending = await sendFiles({ chat: live.chat, home: options.home, recordsId: options.recordsId, api, signal }, paths, "post");
          if ("problem" in sending) return failure(sending.problem);
          files = sending.sent;
        }
        let first: Message | undefined;
        for (const [index, part] of parts.entries()) {
          signal.throwIfAborted();
          asking = true;
          const posted = await live.chat.post(place.threadId, part, toolRequestId("post", options.recordsId, api, index), signal, {
            quiet: quiet === true,
            attachments: index === parts.length - 1 ? files.map((file) => file.attachment) : [],
          });
          asking = false;
          first ??= posted;
          confirmed += 1;
        }

        const current = await threadOfSession(api, api.conversationId, context);
        const targetAgent = place.dmWith?.kind === "agent" && !place.here ? place.dmWith : undefined;
        const count = `${parts.length === 1 ? "Posted" : `Posted in ${parts.length} parts`}${words.withFiles(files)}`;
        const where = place.created ? `new thread ${place.threadId} (${place.label})` : place.label;
        if (targetAgent !== undefined && current !== undefined && first !== undefined) {
          await watches.open(
            api,
            {
              id: `watch_${String(api.taskId)}`,
              fromThread: current.threadId,
              fromChannel: current.channelId,
              onAgent: { id: targetAgent.id, name: targetAgent.name },
              toThread: place.threadId,
              startedAt: first.sentAt,
              start: words.startOf(text.trim() === "" ? filesWords(files) : text),
              message: first.id,
              event: first.event,
              seq: first.seq,
            },
            context,
          );
          return answer(`${count} to ${where}. Watching for @${targetAgent.name}'s reply. ${CAN_END_TURN}`);
        }
        const suffix = place.here ? " Your final text at the end of the turn will still be posted here." : "";
        return answer(`${count} to ${where}.${suffix}`);
      } catch (error) {
        const why = chatFailure(error, live, context);
        if ("refused" in why) {
          const partial = confirmed === 0 ? "" : ` (${confirmed} of ${parts.length} parts were already posted)`;
          return failure(`Chat refused the post${partial}: ${why.refused}`);
        }
        if (asking) {
          return failure(`Lost connection while posting (${confirmed} of ${parts.length} parts confirmed); the in-flight part may have reached chat.`);
        }
        return failure(confirmed === 0 ? words.UNREACHABLE : `Lost connection after posting ${confirmed} of ${parts.length} parts.`);
      }
    },
  });
}
