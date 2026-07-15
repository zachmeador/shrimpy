import type {
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { ImageContent } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { formatTrailingTurnContext } from "../context/index.js";

export const TURN_CONTEXT_CUSTOM_TYPE = "shrimpy_turn_context";

interface TurnContextMessageDetails {
  text: string;
}

export interface SessionTurnContextController {
  prepareForPrompt(prompt: string, images?: ImageContent[]): Promise<string | undefined>;
}

export type PrepareSessionTurnContext = (
  prompt: string,
  images?: ImageContent[],
) => Promise<string | undefined> | string | undefined;

export function createSessionTurnContextController(opts?: {
  prepare?: PrepareSessionTurnContext;
}): SessionTurnContextController {
  return {
    async prepareForPrompt(prompt, images) {
      if (prompt.startsWith("/") || !opts?.prepare) return undefined;

      const prepared = await opts.prepare(prompt, images);
      const text = prepared?.trim();
      return text || undefined;
    },
  };
}

export function createTurnContextExtensionFactory(
  controller: SessionTurnContextController,
): ExtensionFactory {
  return (pi) => {
    pi.registerMessageRenderer<TurnContextMessageDetails>(
      TURN_CONTEXT_CUSTOM_TYPE,
      (message, { expanded }, theme) => {
        if (!expanded) return new Text("", 0, 0);

        const text = message.details?.text?.trim();
        if (!text) return new Text("", 0, 0);

        return new Text(theme.fg("dim", text), 1, 0);
      },
    );

    pi.on("before_agent_start", async (event) => {
      const text = await controller.prepareForPrompt(event.prompt, event.images);
      if (!text) return undefined;
      return {
        message: {
          customType: TURN_CONTEXT_CUSTOM_TYPE,
          content: formatTrailingTurnContext(text),
          display: true,
          details: { text } satisfies TurnContextMessageDetails,
        },
      };
    });
  };
}
