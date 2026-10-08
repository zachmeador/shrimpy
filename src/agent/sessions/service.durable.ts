import { type Context, replicatedState } from "@earendil-works/chord";
import type { Conversation, ConversationView, Harness, ModelRef } from "@earendil-works/pi-durable";
import type { SessionService, SessionView } from "../../contracts/agent/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { closeQuestions } from "../questions/durable.ts";
import { withdrawUnhanded } from "../turns/durable.ts";
import { cancelWakeups } from "../wakeups/durable.ts";
import { publishSessionView } from "./publish.ts";
import { toSessionView } from "./session-view.durable.ts";
import { waitForSettlement } from "./settlement.durable.ts";

/** What a served session asks of the agent about models. */
export interface SessionModels {
  /** The model the agent's home names now, which a session follows until it is given one of its own. */
  home(): ModelRef;
}

/** A session being served: the contract's service, and a way to stop serving it. */
export interface ServedSession {
  readonly service: SessionService;
  /** Show the session's clients its status as it reads now, which depends on the home's model as well as the session's. */
  refresh(): void;
  close(): void;
}

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
  await cancelWakeups(harness, conversation.id, context);
  await closeQuestions(harness, conversation.id, context);
  await withdrawUnhanded(harness, conversation.id, context);
  await conversation.abort(context);
  await cancelWakeups(harness, conversation.id, context);
  await closeQuestions(harness, conversation.id, context);
}

/**
 * Serve one session: keep its view published, and route control to the
 * engine. `takingInput` says whether new input may still come in; stopping
 * work and watching stay open either way. Stopping the work also cancels the
 * wake-ups the session is waiting on and closes its open questions.
 */
export async function serveSession(
  harness: Harness,
  conversation: Conversation,
  context: Context,
  takingInput: () => boolean,
  models: SessionModels,
): Promise<ServedSession> {
  const committed = await conversation.viewState(context);
  const viewOf = (value: ConversationView): SessionView => toSessionView(value, models.home());
  const state = replicatedState(viewOf(committed.value));
  const stopPublishing = committed.subscribe((value) => {
    publishSessionView(state, viewOf(value), context);
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
    refresh: () => publishSessionView(state, viewOf(committed.value), context),
    close() {
      stopPublishing();
      committed.dispose();
    },
  };
}
