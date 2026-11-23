import { constant, defineFacet, type Facet, type FollowAttach } from "@earendil-works/chord";
import type { JsonValue } from "@earendil-works/chord/json";
import { Channel, Chat, type ChatEvent, ChatPresence, type Member, Thread } from "../../contracts/chat/index.ts";
import { type Answer, done, type Principal, type Way } from "../../contracts/gateway/index.ts";
import { follow } from "../../lib/follow/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import type { LiveIdentity } from "../identity/index.ts";
import { events } from "../offers/index.ts";
import type { Change } from "../store/index.ts";
import {
  addMembers,
  answer,
  archiveThread,
  type ChatDeps,
  channelView,
  chatView,
  createRoom,
  createThread,
  deleteMessage,
  editMessage,
  leaveReceipt,
  markRead,
  NOT_A_MEMBER,
  openDm,
  post,
  react,
  readMessages,
  renameThread,
  setWorking,
  threadView,
  triggerFired,
  unreact,
} from "../threads/index.ts";

/** What the objects are served from: the operations' own, with the roster as it is followed. */
export type ServedDeps = ChatDeps & { readonly identity: LiveIdentity };

/** The member `principal` is, as the roster has it now, or undefined for a program that is no member. */
function whoIs(deps: ServedDeps, principal: Principal): Member | undefined {
  if (principal.kind !== "person" && principal.kind !== "agent") return undefined;
  return deps.identity.member(principal.member);
}

const wayKey = (way: Way): string => ("id" in way ? `${way.kind} ${way.id}` : way.kind);

/** A post as a version of `Thread` from before `quiet` asks for it: not quiet. */
const loud = (args: { text: string; request: string }) => ({ ...args, quiet: false });

/** An answer as an older version of a type gives it: its value changed by `older`, and a refusal as it is. */
const answeredAs =
  <T, U>(older: (value: T) => U) =>
  (answer: Answer<T>): Answer<U> =>
    answer.kind === "refused" ? answer : done(older(answer.value));

/** A thread as the versions of `Thread` and `Channel` from before revisions serve it: without its revision. */
function threadV1(thread: Thread) {
  const { revision: _revision, ...unrevised } = thread;
  return unrevised;
}

/**
 * What the versions of `Thread` from before revisions are given. A rename or
 * an archive from one names no revision, and a change to a message no request
 * ID, so a stale retry can't be told from a later decision, and each is
 * refused.
 */
const BEFORE_REVISIONS = {
  state: { all: { thread: (thread: Thread | null) => (thread === null ? null : threadV1(thread)) } },
  methods: { edit: "refuse", delete: "refuse", react: "refuse", unreact: "refuse", rename: "refuse", archive: "refuse" },
} as const;

/** What the versions of `Channel` from before revisions are given. */
const CHANNEL_BEFORE_REVISIONS = {
  state: { all: { threads: (threads: Thread[]) => threads.map(threadV1) } },
  methods: { createThread: { result: answeredAs(threadV1) } },
} as const;

/** An event as version 1 of `Chat` serves it: a post or an edit without the members it mentioned. */
function eventV1(event: ChatEvent) {
  if (event.kind !== "posted" && event.kind !== "edited") return event;
  const { mentions: _mentions, ...unmentioned } = event;
  return unmentioned;
}

/**
 * Whether a change in the store can change what `principal` is shown. Any
 * change can, but a read mark that moved changes only what its own member is
 * shown.
 */
function shownTo(deps: ServedDeps, principal: Principal, change: Change): boolean {
  return change.kind !== "read" || whoIs(deps, principal)?.id === change.memberId;
}

/** Whether two principals are one: the same kind, and for a member the same member by the same way in. */
function samePrincipal(a: Principal, b: Principal): boolean {
  if (a.kind !== "person" && a.kind !== "agent") return a.kind === b.kind;
  return b.kind === a.kind && b.member === a.member && wayKey(b.way) === wayKey(a.way);
}

/**
 * What `self.follow` takes for a view that `view` works out: once the roster is
 * known, it is read, and read again whenever something it is worked out from
 * may have changed: a change in the store that `wants` picks, a change of the
 * working marks in a thread that `marks` picks, each by the view as it was last
 * read, and any change of the roster. Each reading comes at once, beside the
 * store, so nothing polls.
 */
function followed<T extends JsonValue>(
  deps: ServedDeps,
  view: () => T,
  wants: (change: Change, last: T) => boolean,
  marks: (threadId: string, last: T) => boolean,
): FollowAttach<T> {
  let last: T | undefined;
  const attach = follow({
    read() {
      last = view();
      return last;
    },
    watch(changed) {
      const stops = [
        deps.store.subscribe((change) => {
          if (last === undefined || wants(change, last)) changed();
        }),
        deps.working.subscribe((threadId) => {
          if (last === undefined || marks(threadId, last)) changed();
        }),
        deps.identity.subscribe(changed),
      ];
      return () => {
        for (const stop of stops) stop();
      };
    },
  });
  return async (observer, context) => {
    await deps.identity.known(context.abortSignal);
    return attach(observer, context);
  };
}

/**
 * The objects the chat server serves at `chat()`, one of each type for each
 * caller and params, each kept live from the store, the working marks and the
 * roster, and `ChatPresence`, which the gateway holds. Who the caller is comes
 * from the relay's stamp, and its name and whether it is an admin from the
 * roster as it is now.
 */
export function chatFacet(deps: ServedDeps): Facet<Principal> {
  /** The caller, as a method needs it: a member, recorded in the store as the roster names it now. */
  const callerOf = (principal: Principal): Member => {
    const member = whoIs(deps, principal) ?? refuse(NOT_A_MEMBER.words);
    deps.store.transaction((tx) => {
      if (tx.member(member.id)?.name !== member.name) tx.saveMember(member);
    });
    return member;
  };

  return defineFacet<Principal>((host) => {
    const holds = host.references(Chat);

    host.serve(ChatPresence, () => ({ variant: "present", members: {} }));

    host.serve(
      Chat,
      (_params, principal, self) => {
        // Positions only grow, so each reading of the head starts where the last one ended.
        let since = 0;
        const state = self.follow(
          followed(
            deps,
            () => {
              const view = chatView(deps, whoIs(deps, principal), since);
              since = view.head;
              return view;
            },
            (change) => change.kind === "event" || change.kind === "channel",
            () => false,
          ),
        );

        // A working mark lasts while the hold that made it does: one per host that holds this object, by its incarnation.
        const owner = crypto.randomUUID();
        const holders = new Map<string, string>();
        const holderFor = (incarnation: string): string => {
          const known = holders.get(incarnation);
          if (known !== undefined) return known;
          const made = `${owner} ${incarnation}`;
          holders.set(incarnation, made);
          return made;
        };
        self.on(holds, async ({ value }) => {
          const present = new Set(
            value.flatMap((hold) => (hold.principal !== undefined && samePrincipal(hold.principal, principal) ? [hold.incarnation] : [])),
          );
          for (const [incarnation, holder] of holders) {
            if (present.has(incarnation)) continue;
            holders.delete(incarnation);
            deps.working.end(holder);
          }
        });
        self.open(
          async () => holders,
          (open) => {
            for (const holder of open.values()) deps.working.end(holder);
            open.clear();
          },
        );

        const caller = (): Member => callerOf(principal);
        return {
          variant: "all",
          members: {
            you: self.derive([state], ([view]) => view.you),
            channels: self.derive([state], ([view]) => view.channels),
            readOnlyChannels: self.derive([state], ([view]) => view.readOnlyChannels),
            head: self.derive([state], ([view]) => view.head),
            store: constant(deps.store.id),
            events: async ({ after, limit }) => answer(() => events(deps.store, caller(), after, limit)),
            leaveReceipt: async ({ events: ids, receipt }) => answer(() => leaveReceipt(deps, caller(), ids, receipt)),
            setWorking: async ({ thread, working }, ctx) =>
              answer(() => setWorking(deps, holderFor(ctx.incarnation), caller(), thread, working)),
            openDm: async ({ member }) => answer(() => openDm(deps, caller(), member)),
            createRoom: async ({ name, members }) => answer(() => createRoom(deps, caller(), name, members)),
          },
        };
      },
      { accepts: { 1: { methods: { events: { result: answeredAs((events: ChatEvent[]) => events.map(eventV1)) } } } } },
    );

    // Version 1 of `Channel` and `Thread` is from before read marks. A holder of it, such as an agent on another
    // machine that runs an older Shrimpy, binds as it did and is shown no counts. Versions 1 and 2 of `Thread` post
    // nothing quietly. Versions 1 to 3 of `Thread` are from before revisions and request IDs on changes to messages,
    // and versions 1 and 2 of `Channel` from before revisions.
    host.serve(
      Channel,
      ({ channel: channelId }, principal, self) => {
        const state = self.follow(
          followed(
            deps,
            () => channelView(deps, whoIs(deps, principal), channelId),
            (change) => change.channelId === channelId && shownTo(deps, principal, change),
            (threadId, last) => last.threads.some((thread) => thread.id === threadId),
          ),
        );
        const caller = (): Member => callerOf(principal);
        return {
          variant: "all",
          members: {
            refusal: self.derive([state], ([view]) => view.refusal),
            channel: self.derive([state], ([view]) => view.channel),
            threads: self.derive([state], ([view]) => view.threads),
            unread: self.derive([state], ([view]) => view.unread),
            createThread: async ({ name }) => answer(() => createThread(deps, caller(), channelId, name)),
            addMembers: async ({ members }) => answer(() => addMembers(deps, caller(), channelId, members)),
          },
        };
      },
      { accepts: { 1: CHANNEL_BEFORE_REVISIONS, 2: CHANNEL_BEFORE_REVISIONS } },
    );

    host.serve(
      Thread,
      ({ thread: threadId }, principal, self) => {
        const state = self.follow(
          followed(
            deps,
            () => threadView(deps, whoIs(deps, principal), threadId),
            // A refused view doesn't show its channel, and a member let in to a channel is let in by a channel's change.
            (change, last) =>
              change.kind === "channel"
                ? last.thread === null || change.channelId === last.thread.channelId
                : change.threadId === threadId && shownTo(deps, principal, change),
            (marked) => marked === threadId,
          ),
        );
        const caller = (): Member => callerOf(principal);
        return {
          variant: "all",
          members: {
            refusal: self.derive([state], ([view]) => view.refusal),
            thread: self.derive([state], ([view]) => view.thread),
            messages: self.derive([state], ([view]) => view.messages),
            earlier: self.derive([state], ([view]) => view.earlier),
            readOnly: self.derive([state], ([view]) => view.readOnly),
            unread: self.derive([state], ([view]) => view.unread),
            read: async ({ before, limit }) => answer(() => readMessages(deps, caller(), threadId, before, limit)),
            post: async ({ text, request, quiet }) => answer(() => post(deps, caller(), threadId, text, request, quiet === true)),
            edit: async ({ message, text, request }) => answer(() => editMessage(deps, caller(), threadId, message, text, request)),
            delete: async ({ message, request }) => answer(() => deleteMessage(deps, caller(), threadId, message, request)),
            react: async ({ message, emoji, request }) => answer(() => react(deps, caller(), threadId, message, emoji, request)),
            unreact: async ({ message, emoji, request }) => answer(() => unreact(deps, caller(), threadId, message, emoji, request)),
            rename: async ({ name, revision }) => answer(() => renameThread(deps, caller(), threadId, name, revision)),
            archive: async ({ archived, revision }) => answer(() => archiveThread(deps, caller(), threadId, archived, revision)),
            markRead: async ({ message }) => answer(() => markRead(deps, caller(), threadId, message)),
            triggerFired: async ({ request, ...fired }) => answer(() => triggerFired(deps, caller(), threadId, fired, request)),
          },
        };
      },
      {
        accepts: {
          1: { ...BEFORE_REVISIONS, methods: { ...BEFORE_REVISIONS.methods, post: { args: loud } } },
          2: { ...BEFORE_REVISIONS, methods: { ...BEFORE_REVISIONS.methods, post: { args: loud } } },
          3: BEFORE_REVISIONS,
        },
      },
    );
  });
}
