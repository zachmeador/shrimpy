import { arr, bool, int, lit, nul, num, obj, oneOf, type Static, str, union } from "@earendil-works/chord";
import { PIGMENTS } from "./sigil.ts";

/** A color an agent's sigil is drawn in. */
export const PigmentSchema = oneOf(...PIGMENTS);

/** An entry of a folder of an agent's home. */
export const HomeEntrySchema = obj({
  /** Its name in the folder. */
  name: str(),
  /** A folder, a file, or anything else, such as a link that leads out of the home, which is listed and never opened. */
  kind: oneOf("folder", "file", "other"),
  /** A file's size in bytes, or null for anything else. */
  size: union([int(), nul()]),
});
export type HomeEntry = Static<typeof HomeEntrySchema>;

/** A file of an agent's home: its text, or an image, by its media type and its bytes in base64. */
export const HomeFileSchema = union([
  obj({ kind: lit("text"), text: str() }),
  obj({ kind: lit("image"), mediaType: oneOf("image/png", "image/jpeg", "image/gif", "image/webp"), data: str() }),
]);
export type HomeFile = Static<typeof HomeFileSchema>;

/** A model by the provider that serves it and the ID that provider knows it by. */
export const ModelIdSchema = obj({ provider: str(), id: str() });
export type ModelId = Static<typeof ModelIdSchema>;

/**
 * The model an agent's sessions follow by default, until one is given another:
 * the one its `agent.json` names, or else the folder's default model.
 */
export const DefaultModelSchema = obj({
  provider: str(),
  id: str(),
  /** Whether `agent.json` names it. When it doesn't, the agent follows the folder's default model. */
  fromHome: bool(),
});
export type DefaultModel = Static<typeof DefaultModelSchema>;

/** A model the agent can use: where it is served, the ID that server knows it by, and the name Pi has for it. */
export const AgentModelSchema = obj({ provider: str(), id: str(), name: str() });
export type AgentModel = Static<typeof AgentModelSchema>;

/** Which thread of a channel: its name, if it has one. */
const ThreadPlaceSchema = obj({ name: union([str(), nul()]) });
export type ThreadPlace = Static<typeof ThreadPlaceSchema>;

/**
 * Where a session is, as the agent last knew it. A client can't always ask chat,
 * which tells nobody about a channel they are not in, so the agent says. The
 * names are as they were when the agent last took something up there: a member
 * or a room can be renamed since.
 */
const SessionPlaceSchema = union([
  /** A thread of the agent's DM with one other member. */
  obj({ kind: lit("dm"), with: obj({ name: str(), kind: oneOf("person", "agent") }), thread: ThreadPlaceSchema }),
  /** A thread of a room the agent is in. */
  obj({ kind: lit("room"), room: str(), thread: ThreadPlaceSchema }),
  /** A trigger's own session, which is behind no thread. */
  obj({ kind: lit("trigger"), trigger: str() }),
]);
export type SessionPlace = Static<typeof SessionPlaceSchema>;

/**
 * A session as a list shows it. An agent has one session for each thread it
 * takes part in, and one for each trigger whose occurrences go to no thread.
 * Every session has an address at the agent: a thread's ID for a session behind
 * a thread, and `trigger:` followed by the trigger's name for a trigger's own
 * session, which is behind none. A client treats the address as a name and
 * never takes it apart.
 */
export const SessionSummarySchema = obj({
  /** The session's address at the agent: the `session` param of `Session`. */
  id: str(),
  /** The thread the session is behind, or null for a session behind none. For one behind a thread, it is also the address. */
  threadId: union([str(), nul()]),
  /** The channel of that thread, or null for a session behind no thread. */
  channelId: union([str(), nul()]),
  /** Where the session is, in names, or null when the agent has not learned it. */
  place: union([SessionPlaceSchema, nul()]),
  /** Whether a turn is underway in the session. */
  working: bool(),
});
export type SessionSummary = Static<typeof SessionSummarySchema>;

/**
 * When a trigger's occurrences come. `every` is how it was written, such as
 * `1h`, and counts from the last occurrence. `cron` has five fields and is the
 * next matching time in `timezone`, which is the machine's when the file left
 * it out.
 */
const TriggerScheduleSchema = union([obj({ every: str() }), obj({ cron: str(), timezone: str() })]);
export type TriggerSchedule = Static<typeof TriggerScheduleSchema>;

/**
 * What a trigger's check is. The command runs at each occurrence, before
 * anything is taken up, and decides whether there is news: with none, no turn is
 * made, no model is called and no occurrence is made. The agent keeps it in its
 * records.
 */
const CheckSchema = obj({
  /** The command line, run with the agent's shell from its home. */
  command: str(),
  /**
   * What counts as news: output that `changed` since the last occurrence, which
   * a trigger's first always has, any `output` at all, or `always`. A check that
   * fails has a line about the failure for its output.
   */
  when: oneOf("changed", "output", "always"),
  /**
   * What news does: `wake` the agent with the trigger's prompt and the output, which it reads as data and not as
   * instructions, or `note` the output in the home's `breadcrumbs/`, with the prompt above it, and wake nobody.
   */
  then: oneOf("wake", "note"),
  /** How long the check may run before it is stopped and counts as failed: a delay such as `30s` or `2m`, at most `10m`. */
  timeout: str(),
});
export type Check = Static<typeof CheckSchema>;

/**
 * How an occurrence ended. A skipped occurrence never ran: the last one was still
 * going, or there was nowhere to send it. A noted one ran its check, which found
 * news, and wrote it to a breadcrumb, so nobody was woken. An interrupted one was
 * running its check when the agent ended, and the check was not run again for it.
 * A check that finds no news makes no occurrence.
 */
const OccurrenceEndingSchema = oneOf("answered", "silent", "failed", "stopped", "skipped", "noted", "interrupted");
export type OccurrenceEnding = Static<typeof OccurrenceEndingSchema>;

/** One occurrence of a trigger, from the agent's records. Times are milliseconds since the epoch. */
export const OccurrenceSchema = obj({
  id: str(),
  /** When it was due, and when it fired, which is later when the agent was down at the time. A run by hand is due when it fires. */
  due: num(),
  firedAt: num(),
  byHand: bool(),
  /** How it ended, or null while it is still going. */
  ended: union([OccurrenceEndingSchema, nul()]),
  /** Why it failed or was skipped, when it says. */
  reason: union([str(), nul()]),
});
export type Occurrence = Static<typeof OccurrenceSchema>;

const TRIGGER_SUMMARY = {
  /** The trigger's name, which is its file's name. */
  name: str(),
  schedule: TriggerScheduleSchema,
  /** The thread its occurrences go to, or null when they go to a session of its own. */
  thread: union([str(), nul()]),
  /** Whether it is on. `enabled: false` in its file turns it off. */
  on: bool(),
  /** When its next occurrence is due, or null when it is off. */
  next: union([num(), nul()]),
  /** Its latest occurrence, or null before the first. */
  last: union([OccurrenceSchema, nul()]),
  /**
   * For a trigger with a check that has run: when it last ran, in milliseconds
   * since the epoch, and how many checks in a row, that one included, have found
   * no news since the last occurrence was made, which is 0 when the last check
   * made one. Null for a trigger that has no check, or has not run it yet.
   */
  lastCheck: union([obj({ at: num(), quiet: int() }), nul()]),
};

/** A standing trigger, as the agent's records have it. */
export const TriggerSummarySchema = obj(TRIGGER_SUMMARY);
export type TriggerSummary = Static<typeof TriggerSummarySchema>;

/** A trigger with its definition and its most recent occurrences. */
export const TriggerDetailSchema = obj({
  ...TRIGGER_SUMMARY,
  /** What a running occurrence is told to do: the body of its file. */
  prompt: str(),
  /** Whether a due occurrence is skipped while the last one is still going (`skip`), or handed over behind it (`allow`). */
  overlap: oneOf("skip", "allow"),
  /** Its check, or null when every occurrence wakes the agent. */
  check: union([CheckSchema, nul()]),
  /** The address of the session of its own that its occurrences go to, if they go there, whether or not it has been made yet. */
  session: union([str(), nul()]),
  /** The latest occurrences, newest first. */
  occurrences: arr(OccurrenceSchema),
});
export type TriggerDetail = Static<typeof TriggerDetailSchema>;

/**
 * What an agent found in its home when it read it again: how much of each kind
 * it now gives its sessions, the model they follow, and the files it could not
 * use.
 */
export const ReloadedSchema = obj({
  /** Whether `SOUL.md` has instructions in it. */
  soul: bool(),
  /** How many files of the workspace context it gives its sessions, from its home's copy. */
  workspace: int(),
  /** How many Markdown files of `context/` it gives its sessions. */
  files: int(),
  /** How many skills it tells its sessions about. */
  skills: int(),
  /** How many triggers it has now, on or off, counting one whose file it could not use but still has a last valid definition of. */
  triggers: int(),
  /** The model the home names, which its sessions follow now: the one `agent.json` names, or else the folder's default. */
  model: ModelIdSchema,
  /** The model they followed until this reload, when it found the home naming another; null when it is the same one. */
  changedFrom: union([ModelIdSchema, nul()]),
  /**
   * Files it did not use, each with why. Everything else was read. The file
   * that names the model is among them when that model can't be used, and then
   * the sessions keep the model they had.
   */
  leftOut: arr(obj({ file: str(), reason: str() })),
});
export type Reloaded = Static<typeof ReloadedSchema>;

/**
 * Why a turn ended without an answer, or why an input was left without one:
 *
 * - `model_failed`: the model failed.
 * - `no_model`: the agent has no model it can use.
 * - `stopped`: the work was stopped, by someone, or by the agent after it
 *   stopped unexpectedly too many times during the turn.
 * - `kept_crashing`: the agent stopped unexpectedly so many times during the
 *   turn that it gave up.
 * - `internal_error`: something went wrong inside the agent.
 * - `updated`: the agent was updated, and could not go on with the work.
 * - `turn_ahead_failed`: an input was taken back before the agent reached it,
 *   because the turn ahead of it failed.
 * - `other`: anything else, with what the engine said in the detail.
 */
const FailureReasonSchema = oneOf(
  "model_failed",
  "no_model",
  "stopped",
  "kept_crashing",
  "internal_error",
  "updated",
  "turn_ahead_failed",
  "other",
);
export type FailureReason = Static<typeof FailureReasonSchema>;

/**
 * How an accepted input ended. `answered` is the agent's final answer, which
 * may be empty. `cancelled` means someone stopped the work. `unanswered` is
 * anything else that left the input without an answer: `reason` says why, and
 * `detail` says more when the agent knows more.
 */
export const SettlementSchema = union([
  obj({ status: lit("answered"), text: str() }),
  obj({ status: lit("cancelled") }),
  obj({ status: lit("unanswered"), reason: FailureReasonSchema, detail: union([str(), nul()]) }),
]);
export type Settlement = Static<typeof SettlementSchema>;

/** An input a session accepted: what `wait` takes to say how it ended. */
export const SubmittedSchema = obj({ submission: int() });
export type Submitted = Static<typeof SubmittedSchema>;

/** `interrupted` means the agent restarted mid-call and did not run the tool again. */
const ToolStatusSchema = oneOf("pending", "running", "done", "error", "interrupted");
export type ToolStatus = Static<typeof ToolStatusSchema>;

/**
 * The entry of the session an item came from, by the ID the agent gives it, or
 * null for a partial answer that is not stored yet and the tool calls in it.
 */
const ENTRY = union([int(), nul()]);

/** When it happened, in milliseconds since the epoch. */
const AT = num();

/** An image the model was shown, by its media type, such as `image/png`, which is enough to name it. */
const SessionImageSchema = obj({ mimeType: str() });
export type SessionImage = Static<typeof SessionImageSchema>;

/**
 * How an answer ended:
 *
 * - `finished`: the model was done.
 * - `called_tools`: it stopped for the tools it called to run.
 * - `too_long`: it reached the most the model may write in one answer.
 * - `failed`: the model failed.
 * - `interrupted`: it was cut off, by a stop or by the agent ending.
 * - `other`: anything else, with what the engine said in the detail.
 */
const AnswerEndingSchema = oneOf("finished", "called_tools", "too_long", "failed", "interrupted", "other");
export type AnswerEnding = Static<typeof AnswerEndingSchema>;

/**
 * One thing a client draws for a session. A tool call is an item of the answer
 * that made it, and carries how it went: its result, which comes in a later
 * entry, is no item of its own. What the session was shown, and what a tool
 * gave back, can hold images beside the text, as Pi's `read` of an image file
 * does: each is named in `images`, in the order the model was shown them, and
 * is no part of `text`. Each item says when it happened: what the session was
 * shown, when it was given it; an answer, when the model began it, and each
 * tool call it made with it; and a compaction, when its summary was made. A
 * reset has a time only when it carried text over.
 */
const SessionItemSchema = union([
  obj({ type: lit("user"), entry: ENTRY, at: AT, text: str(), images: arr(SessionImageSchema) }),
  obj({
    type: lit("assistant"),
    entry: ENTRY,
    at: AT,
    text: str(),
    thinking: str(),
    streaming: bool(),
    /**
     * How it ended, or null while it streams. `detail` is what the engine said
     * about it, such as why the model failed, or null when it said nothing.
     */
    ended: union([obj({ how: AnswerEndingSchema, detail: union([str(), nul()]) }), nul()]),
  }),
  obj({
    type: lit("tool"),
    entry: ENTRY,
    at: AT,
    id: str(),
    name: str(),
    args: str(),
    status: ToolStatusSchema,
    output: str(),
    images: arr(SessionImageSchema),
    notes: arr(str()),
  }),
  obj({ type: lit("marker"), entry: ENTRY, at: union([AT, nul()]), marker: oneOf("reset", "compaction") }),
]);
export type SessionItem = Static<typeof SessionItemSchema>;

/**
 * A stretch of a session's history: its items, oldest first, and the entry just
 * before the first of them, or null when they start at the session's start. A
 * client pages back by asking `read` for what is before, from that entry on.
 */
export const SessionPageSchema = obj({ items: arr(SessionItemSchema), before: union([int(), nul()]) });
export type SessionPage = Static<typeof SessionPageSchema>;

const SessionActivitySchema = union([
  obj({ kind: lit("idle") }),
  obj({ kind: lit("working") }),
  obj({ kind: lit("answering") }),
  obj({ kind: lit("tool"), name: str() }),
  obj({ kind: lit("retrying"), error: str() }),
]);
export type SessionActivity = Static<typeof SessionActivitySchema>;

/**
 * Input the session has accepted but not picked up yet, and when it will be:
 * `next_step` joins the running turn at its next step, `next_turn` waits for
 * the turn after it, and `other` is anything else, such as an entry the engine
 * writes, which `text` names as the engine does.
 */
const QueuedInputSchema = obj({ when: oneOf("next_step", "next_turn", "other"), text: str() });
export type QueuedInput = Static<typeof QueuedInputSchema>;

/** A wake-up the session asked for with `check_back` and is waiting on: when it is due, and the note it will bring. */
const WaitingWakeupSchema = obj({
  /** In milliseconds since the epoch. */
  due: num(),
  note: str(),
});
export type WaitingWakeup = Static<typeof WaitingWakeupSchema>;

/** Why a session's last turn ended without an answer, and more when the agent knows more. */
const TurnFailureSchema = obj({ reason: FailureReasonSchema, detail: union([str(), nul()]) });
export type TurnFailure = Static<typeof TurnFailureSchema>;

/** What a session is doing, what waits, its model and its usage. */
export const SessionStatusSchema = obj({
  activity: SessionActivitySchema,
  busy: bool(),
  queued: arr(QueuedInputSchema),
  /** The model the session's next request names, or null when it has none. */
  model: union([ModelIdSchema, nul()]),
  /**
   * Whether `model` is one the session was given, by a person's `/model` in its
   * thread, and not the model the agent's home names, which every session
   * follows until it is given another. A session that was given the home's own
   * model follows the home, so this is false for it too. A session's own model
   * lasts until the agent is started again, when every session follows the home,
   * or until a reload finds the home naming another model, when every session
   * follows that one. A reload that finds the same model leaves it alone.
   */
  ownModel: bool(),
  usage: obj({ input: num(), output: num(), cost: num() }),
  /** The wake-ups the session is waiting on, the soonest first. */
  wakeups: arr(WaitingWakeupSchema),
  /** Why the session's last turn ended without an answer, until its next turn starts; null when it answered, or there was none. */
  failure: union([TurnFailureSchema, nul()]),
});
export type SessionStatus = Static<typeof SessionStatusSchema>;
