import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";

const MODEL_SWITCH_CUSTOM_TYPE = "shrimpy_model_switch";

interface ModelRefDetails {
  provider?: string;
  id?: string;
}

interface ModelSwitchDetails {
  current?: ModelRefDetails;
}

export default function (pi: ExtensionAPI) {
  pi.registerMessageRenderer<ModelSwitchDetails>(
    MODEL_SWITCH_CUSTOM_TYPE,
    (message, { expanded }, theme) => {
      if (!expanded) {
        return new Text(
          `${theme.fg("muted", "Model:")} ${theme.fg("accent", currentModelLabel(message))}`,
          0,
          0,
        );
      }

      const container = new Container();
      container.addChild(
        new Text(theme.fg("customMessageLabel", `[${MODEL_SWITCH_CUSTOM_TYPE}]`), 0, 0),
      );
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(theme.fg("customMessageText", textContent(message.content)), 0, 0),
      );
      return container;
    },
  );
}

function currentModelLabel(input: {
  content: string | Array<{ type: string; text?: string }>;
  details?: ModelSwitchDetails;
}): string {
  const current = input.details?.current;
  if (current?.id) return current.id;
  if (current?.provider) return current.provider;

  const content = textContent(input.content);
  const match = content.match(/ -> (.*?)(?:\. Thinking:|\. Earlier assistant messages|$)/s);
  return match?.[1]?.trim() || "unknown";
}

function textContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}
