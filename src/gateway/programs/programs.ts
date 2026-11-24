import { type Address, ChordError, type Held, type Host, type RefState, type RouteHandle } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import type { NativeWatchHandle } from "@earendil-works/chord/watch";
import { AgentPresence } from "../../contracts/agent/index.ts";
import { ChatPresence } from "../../contracts/chat/index.ts";
import { agent, chat, type Principal, type Program, type Revocation, type TurnedAwayProgram } from "../../contracts/gateway/index.ts";
import type { Linked } from "../../lib/link/index.ts";

export interface ProgramsOptions {
  readonly host: Host<Principal, Revocation>;
  /** Every agent on the roster now. */
  agents(): readonly { readonly id: string; readonly name: string }[];
  /** Told when the programs linked, or whether an agent is reachable, changed. */
  onChange(): void;
  /** The parent of the routes' work, ended when the gateway closes. */
  readonly context: Context;
}

/**
 * The programs linked to the gateway: each one's link, which is its route, and
 * whether each agent is reachable. A program has one link at a time.
 */
export interface Programs {
  /** Hold the presence of the chat server and of every agent on the roster. After the host has loaded. */
  start(): void;
  /** Whether a program is linked as the agent `member` now. */
  agentLinked(member: string): boolean;
  /** Whether a chat server is linked now. */
  chatLinked(): boolean;
  /** Take the link of the agent `principal` is, whose hello was welcomed, as the route to it while it lasts. */
  takeAgent(principal: Extract<Principal, { kind: "agent" }>, name: string, shrimpy: string, linked: Linked): void;
  /** Take the chat server's link, whose hello was welcomed, as the route to it while it lasts. */
  takeChat(shrimpy: string, linked: Linked): void;
  /** The programs linked now, oldest first. */
  list(): Program[];
  /** The gateway turned `program` away for the release it runs: keep it until it links, or its agent leaves the roster. */
  turnAway(program: TurnedAwayProgram): void;
  /** The programs turned away for the release they run, each as it last tried. */
  turnedAway(): TurnedAwayProgram[];
  /** Whether the gateway's hold of the agent's presence is live. */
  reachable(member: string): boolean;
  /** The roster changed: hold the presence of every agent on it, by its ID. */
  followRoster(): void;
  /** Drop the agent's own link at once, as when its token is taken back. */
  dropAgent(member: string): void;
  /** Whether a route refused `error` because its program isn't linked, which is no failure of the gateway's. */
  notLinked(error: unknown): boolean;
  /** Let go of every presence and drop every link. */
  close(): void;
}

/** A program's link, from its welcome until its socket closes. */
interface ProgramLink {
  readonly kind: "agent" | "chat";
  readonly member: string | null;
  readonly name: string;
  readonly shrimpy: string;
  readonly address: Address;
  readonly principal: Principal;
  readonly linked: Linked;
}

/** The gateway's hold of one program's presence, and whether it is live. */
interface Presence {
  readonly held: Held<typeof AgentPresence> | Held<typeof ChatPresence>;
  watch: NativeWatchHandle<RefState> | undefined;
  live: boolean;
  released: boolean;
}

/** The key of the chat server's link among the agents' member IDs. */
const CHAT = "chat";

/**
 * Set up the routes to agents and the chat server on `host`, before it loads.
 * A route resolves an address to the link waiting for it, and with none it
 * refuses with words, which every holder waits with. The gateway holds the
 * presence of every program it knows, so a route is resolved the moment its
 * program links, and a hold made before that binds then.
 */
export function createPrograms(options: ProgramsOptions): Programs {
  const { host, context } = options;
  const linkedNow = new Map<string, ProgramLink>();
  /** The link each address waits to be resolved to, until its route takes it. */
  const waiting = new Map<string, ProgramLink>();
  const presences = new Map<string, Presence>();
  /** The programs turned away for their release, by the agent's member ID, or `CHAT`. */
  const awayNow = new Map<string, TurnedAwayProgram>();
  const refusals = new WeakSet<object>();
  let closed = false;

  const agentName = (id: string): string | undefined => options.agents().find((each) => each.id === id)?.name;

  const resolve = (address: Address) => {
    const entry = waiting.get(address.key);
    if (entry === undefined) {
      const refusal = notConnected(address, agentName);
      refusals.add(refusal);
      // Thrown at once, not as a rejection, so the route has settled before a link that arrives next asks it again.
      throw refusal;
    }
    waiting.delete(address.key);
    return Promise.resolve({ link: entry.linked.link, principal: entry.principal });
  };
  const agents: RouteHandle<typeof agent> = host.route(agent, { authorize: () => true, resolve }, context);
  const chats: RouteHandle<typeof chat> = host.route(chat, { authorize: () => true, resolve }, context);

  const take = (id: string, entry: ProgramLink): void => {
    linkedNow.set(id, entry);
    awayNow.delete(id);
    waiting.set(entry.address.key, entry);
    void entry.linked.closed.then(() => {
      if (linkedNow.get(id) === entry) linkedNow.delete(id);
      if (waiting.get(entry.address.key) === entry) waiting.delete(entry.address.key);
      if (!closed) options.onChange();
    });
    if (entry.kind === "chat") chats.retry(chat());
    else agents.retry(agent({ id }));
    options.onChange();
  };

  const hold = (held: Presence["held"]): Presence => {
    const presence: Presence = { held, watch: undefined, live: held.state.value.kind === "live", released: false };
    const now = (live: boolean): void => {
      if (live === presence.live) return;
      presence.live = live;
      if (!closed) options.onChange();
    };
    void held.state.watch(BACKGROUND_CONTEXT).then((watch) => {
      if (presence.released) return void watch.stop();
      presence.watch = watch;
      now(watch.value.kind === "live");
      watch.start(async (call) => {
        if (call.kind === "value") now(call.value.kind === "live");
      });
    });
    return presence;
  };

  const release = (presence: Presence): void => {
    presence.released = true;
    void presence.watch?.stop();
    presence.held.release();
  };

  const followRoster = (): void => {
    if (closed) return;
    const wanted = new Set(options.agents().map((each) => each.id));
    let changed = false;
    for (const [id, presence] of presences) {
      if (id === CHAT || wanted.has(id)) continue;
      release(presence);
      presences.delete(id);
      changed ||= presence.live;
    }
    for (const id of awayNow.keys()) {
      if (id === CHAT || wanted.has(id)) continue;
      awayNow.delete(id);
      changed = true;
    }
    for (const id of wanted) {
      if (presences.has(id)) continue;
      presences.set(id, hold(host.hold(AgentPresence, { agent: id }, BACKGROUND_CONTEXT)));
    }
    if (changed) options.onChange();
  };

  return {
    start() {
      presences.set(CHAT, hold(host.hold(ChatPresence, {}, BACKGROUND_CONTEXT)));
      followRoster();
    },
    agentLinked: (member) => linkedNow.has(member),
    chatLinked: () => linkedNow.has(CHAT),
    takeAgent(principal, name, shrimpy, linked) {
      take(principal.member, {
        kind: "agent",
        member: principal.member,
        name,
        shrimpy,
        address: agent({ id: principal.member }),
        principal,
        linked,
      });
    },
    takeChat(shrimpy, linked) {
      take(CHAT, { kind: "chat", member: null, name: CHAT, shrimpy, address: chat(), principal: { kind: "chat" }, linked });
    },
    list: () => [...linkedNow.values()].map(({ kind, name, member, shrimpy }) => ({ kind, name, member, shrimpy })),
    turnAway(program) {
      const id = program.member ?? CHAT;
      if (JSON.stringify(awayNow.get(id)) === JSON.stringify(program)) return;
      awayNow.set(id, program);
      options.onChange();
    },
    turnedAway: () => [...awayNow.values()],
    reachable: (member) => presences.get(member)?.live ?? false,
    followRoster,
    dropAgent(member) {
      linkedNow.get(member)?.linked.drop();
    },
    notLinked: (error) => typeof error === "object" && error !== null && refusals.has(error),
    close() {
      closed = true;
      for (const presence of presences.values()) release(presence);
      presences.clear();
      for (const entry of linkedNow.values()) entry.linked.drop();
    },
  };
}

/** What a hold of a program that isn't linked waits with. */
function notConnected(address: Address, agentName: (id: string) => string | undefined): ChordError {
  const id = typeof address.params.id === "string" ? address.params.id : undefined;
  return new ChordError({
    code: "unavailable",
    message:
      id === undefined
        ? "The chat server isn't connected to the gateway."
        : `${agentName(id) ?? id} isn't connected to the gateway.`,
  });
}
