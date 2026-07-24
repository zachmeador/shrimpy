import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { prefixPromptWithTurnContext } from "../context/turn/prompt-prefix.js";

interface MessageLike {
  role?: string;
  content?: unknown;
}

interface AgentEndEvent {
  type: "agent_end";
  messages?: unknown[];
}

interface SessionTurnResult {
  messages: unknown[];
  assistantText: string;
}

function isAgentEndEvent(event: unknown): event is AgentEndEvent {
  return (
    typeof event === "object"
    && event !== null
    && (event as { type?: unknown }).type === "agent_end"
  );
}

function abortError(signal: AbortSignal, fallbackMessage: string): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  if (typeof reason === "string") return new Error(reason);
  return new Error(fallbackMessage);
}

export function collectAssistantText(messages: unknown[]): string {
  let text = "";
  for (const message of messages) {
    const msg = message as MessageLike;
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

    for (const block of msg.content as Array<{ type?: string; text?: string }>) {
      if (block.type === "text" && typeof block.text === "string") {
        text += block.text;
      }
    }
  }
  return text;
}

export function runSessionTurn(
  session: AgentSession,
  prompt: string,
  opts?: {
    signal?: AbortSignal;
    abortMessage?: string;
    turnContextText?: string;
    channelDelivery?: boolean;
  },
): Promise<SessionTurnResult> {
  const signal = opts?.signal;
  const abortMessage = opts?.abortMessage ?? "session turn aborted";
  const promptText = opts?.turnContextText?.trim()
    ? prefixPromptWithTurnContext(prompt, opts.turnContextText.trim(), {
      channelDelivery: opts.channelDelivery,
    })
    : prompt;

  return new Promise<SessionTurnResult>((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;

    const cleanup = () => {
      unsubscribe?.();
      signal?.removeEventListener("abort", onAbort);
    };

    const resolveOnce = (messages: unknown[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        messages,
        assistantText: collectAssistantText(messages),
      });
    };

    const rejectOnce = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onAbort = () => {
      if (!signal) return;
      rejectOnce(abortError(signal, abortMessage));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      unsubscribe = session.subscribe((event: unknown) => {
        if (!isAgentEndEvent(event)) return;
        resolveOnce(event.messages ?? []);
      });
      session.prompt(promptText).catch(rejectOnce);
    } catch (err) {
      rejectOnce(err);
    }
  });
}
