import { type Context, replicatedState } from "@earendil-works/chord";
import type { Conversation, Harness } from "@earendil-works/pi-durable";
import type { SessionService } from "../../contracts/agent/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { withdrawUnhanded } from "../turns/durable.ts";
import { cancelWakeups } from "../wakeups/durable.ts";
import { publishSessionView } from "./publish.ts";
import { toSessionView } from "./session-view.durable.ts";
import { waitForSettlement } from "./settlement.durable.ts";

/** A session being served: the contract's service, and a way to stop serving it. */
export interface ServedSession {
  readonly service: SessionService;
  close(): void;
}

/**
 * Stop a session's work: the turn that is running is stopped, the inputs that
 * wait are taken back, and the wake-ups the session is waiting on are cancelled.
 * A client's stop and a person's `/stop` in a thread are this, so they do the
 * same. The tasks that follow the inputs are left to tell their sources how that
 * ended.
 */
export async function stopWork(harness: Harness, conversation: Conversation, context: Context): Promise<void> {
  // The wake-ups go first, so that none of them starts a turn while the work is being stopped. A stopped turn
  // may have set another before it ended, so they go again after.
  await cancelWakeups(harness, conversation.id, context);
  await withdrawUnhanded(harness, conversation.id, context);
  await conversation.abort(context);
  await cancelWakeups(harness, conversation.id, context);
}

/**
 * Serve one session: keep its view published, and route control to the
 * engine. `takingInput` says whether new input may still come in; stopping
 * work and watching stay open either way. Stopping the work also cancels the
 * wake-ups the session is waiting on.
 */
export async function serveSession(
  harness: Harness,
  conversation: Conversation,
  context: Context,
  takingInput: () => boolean,
): Promise<ServedSession> {
  const committed = await conversation.viewState(context);
  const state = replicatedState(toSessionView(committed.value));
  const stopPublishing = committed.subscribe((value) => {
    publishSessionView(state, toSessionView(value), context);
  });
  return {
    service: {
      state,
      async steer(text, requestId, callContext) {
        if (!takingInput()) refuse("The agent is stopping and is not taking new input.", "service_not_allowed");
        const submission = await conversation.submit(
          { type: "input", content: text, whenBusy: "steer", requestId: requestId ?? undefined },
          callContext,
        );
        return { submission: submission.id };
      },
      wait: (submission, callContext) => waitForSettlement(harness, conversation, submission, callContext),
      stop: (callContext) => stopWork(harness, conversation, callContext),
    },
    close() {
      stopPublishing();
      committed.dispose();
    },
  };
}
