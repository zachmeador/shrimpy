import { int, method, nul, obj, opt, remote, str, union } from "@earendil-works/chord";
import { agent, answerOf, RefusedSchema } from "../gateway/index.ts";
import { RequestPageSchema, SessionRequestSchema } from "./request-shapes.ts";
import { SessionPageSchema, SessionStatusSchema, SettlementSchema, SubmittedSchema } from "./shapes.ts";

/** The most entries one `read` covers. */
export const MAX_READ = 200;

/** The most requests one `requests` call returns. */
export const MAX_REQUESTS = 100;

/**
 * One session of an agent as the caller sees it, at `agent({ id: agent })`:
 * the newest stretch of its history and what it is doing, kept live, older
 * history a page at a time, and control over its work. `session` is its thread
 * ID. Holding it is what attaching to a session was.
 *
 * `refusal` is null, or why the caller can't have this session: the agent
 * hasn't made it yet, or the caller may not watch the agent. Then the rest of
 * its state is empty and every method answers with that refusal. It follows the
 * agent's sessions and the live roster, so a session the agent makes, or a
 * promotion, shows at once.
 */
export const Session = remote("shrimpy.agent.session", {
  version: 3,
  params: { agent: str(), session: str() },
  hostAddress: ({ agent: id }) => agent({ id }),
  variants: {
    all: {
      state: {
        /** Null, or why the caller can't have this session. */
        refusal: union([RefusedSchema, nul()]),
        /**
         * The newest items, and the entry just before them, or null when they
         * start at the session's start. A partial answer, and the output of a
         * tool that runs, show as they arrive, before they are stored.
         */
        window: SessionPageSchema,
        /** What the session is doing, what waits, its model and its usage, or null while it is refused. */
        status: union([SessionStatusSchema, nul()]),
      },
      methods: {
        /**
         * The items of up to `limit` entries, from the entry `before` back,
         * oldest first, and the entry just before those, or null at the
         * session's start. `before` is the entry a window or an earlier page
         * names as just before it, so pages follow on from each other.
         */
        read: method(obj({ before: int({ min: 0 }), limit: int({ min: 1, max: MAX_READ }) }), answerOf(SessionPageSchema)),
        /**
         * Puts input into the session: it joins work that is underway, or starts
         * a turn. A request ID's first use wins: a retry answers with the first
         * submission, even with other text.
         */
        steer: method(obj({ text: str(), request: str() }), answerOf(SubmittedSchema)),
        /**
         * How an input ended, once it has, after a restart of the agent too. A
         * dropped link fails the call, and the caller asks again. A caller that
         * goes away while waiting never stops the work.
         */
        wait: method(obj({ submission: int() }), answerOf(SettlementSchema)),
        /** Stops the session's current work and takes back input it has not picked up. */
        stop: method(undefined, answerOf(nul())),
        /**
         * Lists model requests made in this session, newest first, including
         * unrecorded assistant entries reconstructed from history when capture
         * was absent. Pass `before` from the previous page to page back.
         */
        requests: method(
          obj({ before: opt(str()), limit: int({ min: 1, max: MAX_REQUESTS }) }),
          answerOf(RequestPageSchema),
        ),
        /**
         * Full inspection of one model request: raw entries, effective messages
         * as sent after hooks, active sections and source revisions, selected
         * tools, omissions and budgets, and effective model and settings.
         * Omit both `id` and `entry` for the latest request, or pass `entry`
         * for the request behind an assistant entry ID. Returns null when the
         * session has no matching request.
         */
        request: method(
          obj({ id: opt(str()), entry: opt(int({ min: 0 })) }),
          answerOf(union([SessionRequestSchema, nul()])),
        ),
      },
    },
  },
});
