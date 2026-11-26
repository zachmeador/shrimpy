import type { Context } from "@earendil-works/chord/context";
import type { Conversation, Harness } from "@earendil-works/pi-durable";
import { withdrawUnhanded } from "../turns/durable.ts";

/**
 * Stop a session's running turn and withdraw queued unhanded inputs.
 * Leaves background `bash` processes, triggers, and open watches untouched.
 */
export async function stopWork(harness: Harness, conversation: Conversation, context: Context): Promise<void> {
  await withdrawUnhanded(harness, conversation.id, context);
  await conversation.abort(context);
}
