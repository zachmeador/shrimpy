import { defineTool } from "@earendil-works/pi-durable";
import { arr, obj, str } from "@earendil-works/pi-schema";
import { failure } from "../host/durable.ts";
import { callSignal, chatFailure } from "../links/index.ts";
import type { ForReply } from "../turns/durable.ts";
import type { ChatToolsOptions } from "./options.ts";
import { sendFiles } from "./send.durable.ts";
import * as words from "./words.ts";

/**
 * The `attach` tool: send files to chat now, for the reply the turn ends with,
 * which carries the files of every `attach` call of its turn.
 */
export function attachTool(options: ChatToolsOptions) {
  return defineTool({
    name: "attach",
    description: words.ATTACH_DESCRIPTION,
    parameters: obj({ paths: arr(str({ description: words.FILE_PATHS })) }),
    executionMode: "sequential",
    async execute({ paths }, api, context) {
      const live = options.chat();
      if (live === undefined) return failure(words.UNREACHABLE);
      if (paths.length === 0) return failure(words.NO_FILES);
      const signal = callSignal(live, context);
      try {
        const result = await sendFiles({ chat: live.chat, home: options.home, recordsId: options.recordsId, api, signal }, paths, "attach");
        if ("problem" in result) return failure(result.problem);
        const details: ForReply = { forReply: result.sent.map((file) => file.attachment) };
        return { output: [{ type: "text", text: words.attached(result.sent) }], details };
      } catch (error) {
        const why = chatFailure(error, live, context);
        return failure("refused" in why ? words.filesRefused(why.refused) : words.UNREACHABLE);
      }
    },
  });
}
