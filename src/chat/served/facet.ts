import { constant, defineFacet, type Facet } from "@earendil-works/chord";
import { Channel, Chat, ChatPresence, type Member, Thread } from "../../contracts/chat/index.ts";
import type { Principal, Way } from "../../contracts/gateway/index.ts";
import type { LiveIdentity } from "../identity/index.ts";
import { events } from "../offers/index.ts";
import { answer, refuse } from "../refusal/index.ts";
import type { Change } from "../store/index.ts";
import {
  addMembers,
  archiveThread,
  type ChatDeps,
  channelView,
  chatView,
  createRoom,
  createThread,
  deleteMessage,
  editMessage,
  leaveReceipt,
  NOT_A_MEMBER,
  openDm,
  post,
  react,
  readMessages,
  renameThread,
  setWorking,
  threadView,
  unreact,
} from "../threads/index.ts";
import { live, type Watch } from "./live.ts";

/** What the objects are served from: the operations' own, with the roster as it is followed. */
export type ServedDeps = ChatDeps & { readonly identity: LiveIdentity };

/** The member `principal` is, as the roster has it now, or undefined for a program that is no member. */
function whoIs(deps: ServedDeps, principal: Principal): Member | undefined {
  if (principal.kind !== "person" && principal.kind !== "agent") return undefined;
  return deps.identity.member(principal.member);
}

const wayKey = (way: Way): string => ("id" in way ? `${way.kind} ${way.id}` : way.kind);

/** Whether two principals are one: the same kind, and for a member the same member by the same way in. */
function samePrincipal(a: Principal, b: Principal): boolean {
  if (a.kind !== "person" && a.kind !== "agent") return a.kind === b.kind;
  return b.kind === a.kind && b.member === a.member && wayKey(b.way) === wayKey(a.way);
}

/**
 * What tells a view that something it is worked out from may have changed:
 * changes in the store that `wants` picks, any change of the working marks
 * that `marks` picks, and any change of the roster.
 */
function watching<T>(
  deps: ServedDeps,
  wants: (change: Change, current: T) => boolean,
  marks: (threadId: string, current: T) => boolean,
): Watch<T> {
  return (changed, current) => {
    const stops = [
      deps.store.subscribe((change) => {
        if (wants(change, current())) changed();
      }),
      deps.working.subscribe((threadId) => {
        if (marks(threadId, current())) changed();
      }),
      deps.identity.subscribe(changed),
    ];
    return () => {
      for (const stop of stops) stop();
    };
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
  const ready = (signal: AbortSignal | undefined): Promise<void> => deps.identity.known(signal);

  /** The caller, as a method needs it: a member, recorded in the store as the roster names it now. */
  const callerOf = (principal: Principal): Member => {
    const member = whoIs(deps, principal) ?? refuse(NOT_A_MEMBER);
    deps.store.transaction((tx) => {
      if (tx.member(member.id)?.name !== member.name) tx.saveMember(member);
    });
    return member;
  };

  return defineFacet<Principal>((host) => {
    const holds = host.references(Chat);

    host.serve(ChatPresence, () => ({ variant: "present", members: {} }));

    host.serve(Chat, (_params, principal, self) => {
      // Positions only grow, so each reading of the head starts where the last one ended.
      let since = 0;
      const state = self.follow(
        live(
          () => {
            const view = chatView(deps, whoIs(deps, principal), since);
            since = view.head;
            return view;
          },
          watching(deps, (change) => change.kind !== "thread", () => false),
          ready,
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
    });

    host.serve(Channel, ({ channel: channelId }, principal, self) => {
      const state = self.follow(
        live(
          () => channelView(deps, whoIs(deps, principal), channelId),
          watching(
            deps,
            (change) => change.channelId === channelId,
            (threadId, current) => current.threads.some((thread) => thread.id === threadId),
          ),
          ready,
        ),
      );
      const caller = (): Member => callerOf(principal);
      return {
        variant: "all",
        members: {
          refusal: self.derive([state], ([view]) => view.refusal),
          channel: self.derive([state], ([view]) => view.channel),
          threads: self.derive([state], ([view]) => view.threads),
          createThread: async ({ name }) => answer(() => createThread(deps, caller(), channelId, name)),
          addMembers: async ({ members }) => answer(() => addMembers(deps, caller(), channelId, members)),
        },
      };
    });

    host.serve(Thread, ({ thread: threadId }, principal, self) => {
      const state = self.follow(
        live(
          () => threadView(deps, whoIs(deps, principal), threadId),
          watching(
            deps,
            // A refused view doesn't show its channel, and a member let in to a channel is let in by a channel's change.
            (change, current) =>
              change.kind === "channel"
                ? current.thread === null || change.channelId === current.thread.channelId
                : change.threadId === threadId,
            (marked) => marked === threadId,
          ),
          ready,
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
          read: async ({ before, limit }) => answer(() => readMessages(deps, caller(), threadId, before, limit)),
          post: async ({ text, request }) => answer(() => post(deps, caller(), threadId, text, request)),
          edit: async ({ message, text }) => answer(() => editMessage(deps, caller(), threadId, message, text)),
          delete: async ({ message }) => answer(() => deleteMessage(deps, caller(), threadId, message)),
          react: async ({ message, emoji }) => answer(() => react(deps, caller(), threadId, message, emoji)),
          unreact: async ({ message, emoji }) => answer(() => unreact(deps, caller(), threadId, message, emoji)),
          rename: async ({ name }) => answer(() => renameThread(deps, caller(), threadId, name)),
          archive: async ({ archived }) => answer(() => archiveThread(deps, caller(), threadId, archived)),
        },
      };
    });
  });
}
