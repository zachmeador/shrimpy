import { defineDoc } from "@earendil-works/pi-durable";
import { newId } from "../../lib/ids/index.ts";
import type { TriggerDefinition } from "../home/index.ts";
import { isOccurrence, isWakeup, type Outstanding, type Place, type Snapshot, threadOf, type Wakeup } from "../inputs/index.ts";

/**
 * Shrimpy's own documents, kept in the engine's storage and written in the same
 * commits as the work they belong to. The engine has no place for these: what
 * the agent's records are called, which thread a session belongs to, and where
 * the agent stands in chat's feed.
 *
 * Their version rises when a home written under the old meaning must be refused
 * and not read as current: the engine refuses it, and `records.durable.ts` says
 * what to do. A home written before every event had a task of its own keeps the
 * events it has not answered in a record that is no longer read, so reading it
 * would drop them.
 */

/**
 * What the agent's records are called, and how the agent's runs have gone.
 *
 * The ID is made with the records and never changes. The engine numbers its
 * entries and tasks again in a new database, so a name built from those numbers
 * alone repeats one that an earlier set of records already posted under, and
 * chat takes the post for a retry of that one. What the agent posts under such a
 * name carries this too.
 *
 * `running` is set at every start and cleared by an orderly stop, so a start
 * that finds it set follows a run that ended in some other way. `crashes` counts,
 * for each input whose task is live, the runs that ended that way while the
 * input's turn was underway, under the input's ID. Records written before either
 * existed have neither, which reads as not running and no crashes.
 */
export const RecordsDoc = defineDoc<{ id: string; running?: boolean; crashes?: Record<string, number> }>({
  kind: "shrimpy.records",
  version: 3,
  scope: "session",
  initial: () => ({ id: newId("rec") }),
});

/**
 * A session of the agent, and what the model has yet to be shown for it: the
 * events in its thread the agent has not acted on, and the wake-ups it asked
 * for that were cancelled. Both go with the session's next input. A session in a
 * room also keeps where the agent last looked in the thread. A session also keeps
 * what it was shown of the home's breadcrumbs, to tell which are new to it. A
 * session is behind a thread, and has that thread's channel and, once it has
 * learned it, where the thread is, or is a trigger's own and behind none, and
 * has no channel and no place; `trigger` names that trigger.
 */
export type SessionRecord =
  | {
      /** The engine's ID for the session. */
      conversationId: number;
      channelId: string;
      /** Events skipped when work was stopped: shown with the next event in the thread. Oldest first. */
      unacted: Snapshot[];
      /**
       * Wake-ups the agent asked for that were cancelled, by a stop or because their
       * turn was skipped: told to the model with the session's next input, once. A
       * session written before wake-ups existed has none.
       */
      cancelled?: Wakeup[];
      /**
       * In a room, the position of the newest event the agent took up in the thread:
       * everything the thread says after it is what the agent has not looked at. A
       * session that was never woken in a room has none, and neither has one written
       * before the agent kept it.
       */
      looked?: number;
      /**
       * For each breadcrumb the session was shown, a digest of the text it was
       * shown, by the name of the file. A file whose text differs, or that is not
       * here, is new to the session. A session written before breadcrumbs existed
       * has none, which says it was shown nothing.
       */
      shown?: Record<string, string>;
      /**
       * Where the thread is, as chat said when the agent last took something up
       * there, and written again when what chat says has changed. A session that
       * has not learned it, or was written before the agent kept it, has none.
       */
      place?: Place;
    }
  | {
      conversationId: number;
      channelId: null;
      /** The trigger whose own session this is. */
      trigger: string;
      /** Always empty: chat events come in threads. */
      unacted: Snapshot[];
      cancelled?: Wakeup[];
      shown?: Record<string, string>;
    };

/**
 * Every session the agent has, by its address: a thread's ID for a session
 * behind a thread, which it never changes, and `trigger:` and a trigger's name
 * for a trigger's own session (see `triggerSession`). The document is kept under
 * the kind it was first stored as, when every session was a thread's.
 */
export const SessionsDoc = defineDoc<{ sessions: Record<string, SessionRecord> }>({
  kind: "shrimpy.threads",
  version: 3,
  scope: "session",
  initial: () => ({ sessions: {} }),
});

/** The address of the session of its own that a trigger's occurrences go to when the trigger names no thread. */
export const triggerSession = (name: string): string => `trigger:${name}`;

/**
 * The address of the session an input belongs to: its thread's ID, or the
 * address of the trigger's own session. An occurrence that no session ran has
 * none.
 */
export function sessionAddress(input: Outstanding): string | undefined {
  const thread = threadOf(input);
  if (thread !== undefined) return thread.threadId;
  if (isWakeup(input)) return input.trigger === undefined ? undefined : triggerSession(input.trigger);
  if (isOccurrence(input) && input.unrun === undefined) return triggerSession(input.occurrence.trigger);
  return undefined;
}

/**
 * A standing trigger the agent runs: its definition as the file last said it
 * validly, and the revision of its schedule. Each schedule a trigger is started
 * on gets a revision of its own, which no other has, so the task that waits for
 * the trigger's next occurrence, which carries the revision it was made for,
 * knows when it is out of date. A trigger with a check also keeps what its check
 * printed at the last occurrence that was told of it, which is what `changed`
 * compares with, and a trigger that has not had one has none and counts its next
 * as changed; when it last checked, in milliseconds since the epoch; and how many
 * checks in a row, the last included, have found no news since an occurrence was
 * made, which is 0 when the last check made one. A check that finds no news makes
 * no occurrence, so this is all there is of it.
 */
export type StoredTrigger = { revision: number; definition: TriggerDefinition; last?: string; checkedAt?: number; quiet?: number };

/**
 * The agent's standing triggers by name. They follow the files of the home
 * when the agent starts and when it reloads. `revisions` counts the schedules
 * triggers have been started on, to give each its revision. `owner` is the
 * engine's ID for the conversation that owns the tasks that wait for the
 * triggers and the occurrences that no session ran, once there is one.
 */
export const TriggersDoc = defineDoc<{ owner: number | null; revisions: number; triggers: Record<string, StoredTrigger> }>({
  kind: "shrimpy.triggers",
  version: 1,
  scope: "session",
  initial: () => ({ owner: null, revisions: 0, triggers: {} }),
});

/**
 * Where the agent stands in chat's feed: the position of the last event it is
 * done with, and the ID of the chat store that position is in. A position kept
 * with no ID is for no store.
 */
export const FeedDoc = defineDoc<{ cursor: number | null; store?: string }>({
  kind: "shrimpy.feed",
  version: 3,
  scope: "session",
  initial: () => ({ cursor: null }),
});

/** A plain copy of something read from a document, safe to keep after the commit. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
