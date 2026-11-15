import { int, method, nul, obj, remote, str, union } from "@earendil-works/chord";
import { agent, answerOf, RefusedSchema } from "../gateway/index.ts";
import { SessionPageSchema, SessionStatusSchema, SettlementSchema, SubmittedSchema } from "./shapes.ts";

/** The most entries one `read` covers. */
export const MAX_READ = 200;

/**
 * One session of an agent as the caller sees it, at `agent({ name: agent })`:
 * the newest stretch of its history and what it is doing, kept live, older
 * history a page at a time, and control over its work. `session` is its address
 * at the agent: a thread's ID, or `trigger:` and a trigger's name. Holding it is
 * what attaching to a session was.
 *
 * `refusal` is null, or why the caller can't have this session: the agent
 * hasn't made it yet, or the caller may not watch the agent. Then the rest of
 * its state is empty and every method answers with that refusal. It follows the
 * agent's sessions and the live roster, so a session the agent makes, or a
 * promotion, shows at once.
 */
export const Session = remote("shrimpy.agent.session", {
  version: 1,
  params: { agent: str(), session: str() },
  hostAddress: ({ agent: name }) => agent({ name }),
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
      },
    },
  },
});
