export type FoldClass = "noise" | "tool" | "content";

export interface RecordClassification {
  foldClass: FoldClass;
  label: string;
  summary: string;
  body: string;
  text?: string;
  context?: RecordClassification;
}

const TURN_CONTEXT_INSTRUCTION =
  "The turn context above is background for the user message below. Answer the user message below using this context when relevant.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringifyRecord(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    const encoded: unknown = JSON.stringify(value, null, 2);
    return typeof encoded === "string" ? encoded : "";
  } catch {
    return "[unserializable value]";
  }
}

function oneLine(value: unknown, max = 120): string {
  const text = stringifyRecord(value).replace(/\s+/g, " ").trim();
  if (!text) return "empty";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function recordLabel(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  for (const key of ["kind", "type", "name"]) {
    if (typeof value[key] === "string" && value[key]) return value[key];
  }
  return fallback;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return stringifyRecord(content);
  return content
    .map((part) => {
      if (isRecord(part) && typeof part.text === "string") return part.text;
      return stringifyRecord(part);
    })
    .join("\n");
}

export function splitInjectedMessageText(text: string): {
  context: RecordClassification;
  text: string;
} | null {
  if (!text.startsWith("[turn-context]\n")) return null;
  const instructionMarker = `\n\n${TURN_CONTEXT_INSTRUCTION}`;
  const instructionIndex = text.indexOf(instructionMarker);
  if (instructionIndex < 0) return null;

  let remainderStart =
    instructionIndex + instructionMarker.length;
  while (text[remainderStart] === "\n") remainderStart += 1;

  if (text.startsWith("[channel:", remainderStart)) {
    const envelopeEnd = text.indexOf("\n", remainderStart);
    if (envelopeEnd < 0) return null;
    remainderStart = envelopeEnd + 1;
  }

  const body = text.slice(0, remainderStart).trimEnd();
  return {
    context: {
      foldClass: "noise",
      label: "context",
      summary: `${body.length.toLocaleString()} chars`,
      body,
    },
    text: text.slice(remainderStart),
  };
}

export function classifySessionRecord(event: unknown): RecordClassification {
  if (!isRecord(event)) {
    return {
      foldClass: "noise",
      label: "unknown",
      summary: oneLine(event),
      body: stringifyRecord(event),
    };
  }

  const type = typeof event.type === "string" ? event.type : "unknown";
  if (type === "custom_message") {
    const customType =
      typeof event.customType === "string" ? event.customType : "custom-message";
    const details = isRecord(event.details) ? event.details : undefined;
    const payload = details?.text ?? event.content ?? event.details ?? event;
    return {
      foldClass: "noise",
      label: customType,
      summary: oneLine(payload),
      body: stringifyRecord(payload),
    };
  }

  if (type === "custom") {
    const customType =
      typeof event.customType === "string" ? event.customType : "custom";
    return {
      foldClass: "noise",
      label: customType,
      summary: oneLine(event.data),
      body: stringifyRecord(event.data),
    };
  }

  if (type === "message" && isRecord(event.message)) {
    const role =
      typeof event.message.role === "string" ? event.message.role : "message";
    const text = contentText(event.message.content);
    if (role === "toolResult") {
      return {
        foldClass: "tool",
        label: event.message.isError ? "tool-error" : "tool-result",
        summary: oneLine(text),
        body: text,
      };
    }
    const split = role === "user" ? splitInjectedMessageText(text) : null;
    return {
      foldClass: "content",
      label: role,
      summary: oneLine(split?.text ?? text),
      body: split?.text ?? text,
      text: split?.text ?? text,
      ...(split ? { context: split.context } : {}),
    };
  }

  const payload = type === "unknown" ? event : { ...event, type: undefined };
  return {
    foldClass: "noise",
    label: type,
    summary: oneLine(payload),
    body: stringifyRecord(event),
  };
}

export function classifySessionBlock(block: unknown): RecordClassification {
  if (!isRecord(block)) {
    return {
      foldClass: "noise",
      label: "unknown-block",
      summary: oneLine(block),
      body: stringifyRecord(block),
    };
  }
  const type = typeof block.type === "string" ? block.type : "unknown-block";
  if (type === "text") {
    const text = typeof block.text === "string" ? block.text : "";
    const split = splitInjectedMessageText(text);
    return {
      foldClass: "content",
      label: "text",
      summary: oneLine(split?.text ?? text),
      body: split?.text ?? text,
      text: split?.text ?? text,
      ...(split ? { context: split.context } : {}),
    };
  }
  if (type === "toolCall" || type === "toolResult") {
    return {
      foldClass: "tool",
      label: type,
      summary: oneLine(block.name ?? block.toolName ?? block.content),
      body: stringifyRecord(block),
    };
  }
  if (type === "thinking") {
    const text = typeof block.thinking === "string" ? block.thinking : "";
    return {
      foldClass: "content",
      label: "thinking",
      summary: oneLine(text),
      body: text,
      text,
    };
  }
  return {
    foldClass: "noise",
    label: type,
    summary: oneLine(block),
    body: stringifyRecord(block),
  };
}

export function classifyChannelRecord(event: unknown): RecordClassification {
  if (!isRecord(event) || !isRecord(event.content)) {
    return {
      foldClass: "noise",
      label: isRecord(event) && typeof event.type === "string"
        ? event.type
        : "unknown",
      summary: oneLine(event),
      body: stringifyRecord(event),
    };
  }

  const type =
    typeof event.content.type === "string" ? event.content.type : "unknown";
  const data = event.content.data;
  if (type === "text" && isRecord(data) && typeof data.text === "string") {
    return {
      foldClass: "content",
      label: "text",
      summary: oneLine(data.text),
      body: data.text,
      text: data.text,
    };
  }
  if (type === "image" || type === "image_group" || type === "unsupported_media") {
    return {
      foldClass: "content",
      label: type,
      summary: oneLine(data),
      body: stringifyRecord(data),
      text: oneLine(data, 500),
    };
  }
  return {
    foldClass: "noise",
    label: recordLabel(data, type),
    summary: oneLine(data),
    body: stringifyRecord(data),
  };
}
