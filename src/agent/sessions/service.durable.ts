import type { Context } from "@earendil-works/chord/context";
import type { Conversation, Harness } from "@earendil-works/pi-durable";
import { endTasks } from "../host/durable.ts";
import { QUESTION_TASK } from "../questions/durable.ts";
import { withdrawUnhanded } from "../turns/durable.ts";
import { WAKEUP_TASK } from "../wakeups/durable.ts";

/** The tasks a session's work leaves open, which a stop ends. */
const LEFT_OPEN = [WAKEUP_TASK, QUESTION_TASK];

/**
 * Stop a session's work: the turn that is running is stopped, the inputs that
 * wait are taken back, the wake-ups the session is waiting on are cancelled, and
 * the questions it asked other agents are closed, with nothing said of them. A
 * client's stop and a person's `/stop` in a thread are this, so they do the same.
 * The tasks that follow the inputs are left to tell their sources how that ended.
 */
export async function stopWork(harness: Harness, conversation: Conversation, context: Context): Promise<void> {
  // The wake-ups and the questions go first, so that none of them starts a turn while the work is being stopped. A
  // stopped turn may have set another or asked another before it ended, so they go again after.
  await endTasks(harness, conversation.id, LEFT_OPEN, context);
  await withdrawUnhanded(harness, conversation.id, context);
  await conversation.abort(context);
  await endTasks(harness, conversation.id, LEFT_OPEN, context);
}
