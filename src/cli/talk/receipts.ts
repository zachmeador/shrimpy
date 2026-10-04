import type { Message, Receipt, ThreadHandle, ThreadView } from "../../contracts/chat/index.ts";

/** How waiting for a receipt ended, when nobody gave up. */
export type Waited =
  /** The member left a receipt. `reply` is the message it points at, when the thread still shows it. */
  | { kind: "receipt"; receipt: Receipt; reply: Message | undefined }
  /** The thread has had so many messages since that the live view no longer shows the one being waited on. */
  | { kind: "moved-on" };

/**
 * Watch a thread until `memberId` leaves a receipt on the message
 * `messageId`, and say what it was. The receipt is thread data like any other,
 * so this reads what the agent did from the thread, never from the agent.
 * Rejects when `signal` aborts, and stops watching either way.
 */
export function waitForReceipt(
  handle: Pick<ThreadHandle, "subscribe">,
  messageId: string,
  memberId: string,
  signal: AbortSignal,
): Promise<Waited> {
  return new Promise((resolve, reject) => {
    // The listener can run during subscribe(), before there is anything to stop.
    const watching: { done: boolean; stop?: () => void } = { done: false };
    const finish = (settle: () => void): void => {
      if (watching.done) return;
      watching.done = true;
      watching.stop?.();
      signal.removeEventListener("abort", abandon);
      settle();
    };
    function abandon(): void {
      finish(() => reject(abortError(signal)));
    }

    if (signal.aborted) return abandon();
    signal.addEventListener("abort", abandon, { once: true });
    watching.stop = handle.subscribe((view) => {
      const waited = lookFor(view, messageId, memberId);
      if (waited !== undefined) finish(() => resolve(waited));
    });
    if (watching.done) watching.stop();
  });
}

function lookFor(view: ThreadView, messageId: string, memberId: string): Waited | undefined {
  const message = view.messages.find((candidate) => candidate.id === messageId);
  if (message === undefined) return { kind: "moved-on" };
  const receipt = message.receipts.find((candidate) => candidate.memberId === memberId);
  if (receipt === undefined) return undefined;
  const reply = receipt.reply === null ? undefined : view.messages.find((candidate) => candidate.id === receipt.reply);
  return { kind: "receipt", receipt, reply };
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException("The wait was cancelled", "AbortError");
}
