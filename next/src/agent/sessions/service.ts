import { type Context, replicatedState } from "@earendil-works/chord";
import type { Conversation, Harness } from "@earendil-works/pi-durable";
import type { SessionService } from "../../contracts/agent/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { publishSessionView } from "./publish.ts";
import { toSessionView } from "./session-view.ts";
import { waitForSettlement } from "./settlement.ts";

/** A session being served: the contract's service, and a way to stop serving it. */
export interface ServedSession {
  readonly service: SessionService;
  close(): void;
}

/**
 * Serve one session: keep its view published, and route control to the
 * engine. `takingInput` says whether new input may still come in; stopping
 * work and watching stay open either way.
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
      stop: (callContext) => conversation.abort(callContext),
    },
    close() {
      stopPublishing();
      committed.dispose();
    },
  };
}
