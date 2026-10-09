import type { SessionSummary } from "../../../contracts/agent/index.ts";
import type { Transports } from "../../../contracts/gateway/index.ts";
import type { Backoff } from "../../../lib/retry/index.ts";
import { type AgentLink, converge, keepAgent, type RegistryLink } from "../network/index.ts";

export interface RollCallOptions {
  registry: RegistryLink;
  transports: Transports;
  /** How often a link looks again for a session it was asked to watch. The roll call watches none, so this only paces the link. */
  pollMs: number;
  /** How long an agent that was asked for its sessions is waited for. Past that, what it last said is let go of, as if it said nothing. */
  answerMs: number;
  /** The pauses between attempts to reach an agent. Tests shorten them. */
  backoff?: Backoff;
  /** Told after each change what the agents are working in, as `Model.workingSessions` has it. */
  onChange(working: Record<string, SessionSummary[]>): void;
}

/** A link to each of the agents the person's list shows as running, and what each said of its sessions. */
export interface RollCall {
  /** Keep a link to each of these agents and to no other. The link to one that is not here is let go, and so is what it said. */
  keep(names: string[]): void;
  /** Ask each agent that is kept and reached for its sessions, once more. Only the ones it is working in are kept. */
  ask(): void;
  /** Let go of every link. */
  close(): Promise<void>;
}

/**
 * Hold a link to each agent that is named, and ask each for its sessions when
 * told to, so the console can say which of them are working and where, wherever
 * that is. An agent that is not reached, does not answer in time or refuses is
 * left out, and says nothing here: the list shows it as chat's marks on the
 * person's own threads show it.
 */
export function keepRollCall(options: RollCallOptions): RollCall {
  const kept = new Map<string, { link: AgentLink; ask: () => Promise<void> }>();
  const closing = new Set<Promise<void>>();
  let working: Record<string, SessionSummary[]> = {};

  /** What `name` is working in. With nothing, it is working in nothing the console knows of: it said none, or could not say. */
  function remember(name: string, sessions: SessionSummary[] | undefined): void {
    const now = sessions?.filter((session) => session.working) ?? [];
    // An agent that was there keeps its place in the record, so that saying the same again is no change.
    const next =
      now.length === 0
        ? Object.fromEntries(Object.entries(working).filter(([each]) => each !== name))
        : { ...working, [name]: now };
    if (JSON.stringify(next) === JSON.stringify(working)) return;
    working = next;
    options.onChange(working);
  }

  /** `remember(name, undefined)`, unless the link that could not say is no longer the one kept. */
  function forget(name: string, link: AgentLink): void {
    if (kept.get(name)?.link === link) remember(name, undefined);
  }

  function open(name: string): { link: AgentLink; ask: () => Promise<void> } {
    const link = keepAgent({
      name,
      registry: options.registry,
      transports: options.transports,
      pollMs: options.pollMs,
      backoff: options.backoff,
      onSession: () => undefined,
    });
    const ask = converge(
      async () => {
        if (link.status().state !== "up") return;
        // No second question is asked while one is out, so an agent that stopped answering is asked no more than once.
        const silent = setTimeout(() => forget(name, link), options.answerMs);
        silent.unref();
        try {
          const sessions = await link.sessions();
          if (kept.get(name)?.link === link) remember(name, sessions);
        } finally {
          clearTimeout(silent);
        }
      },
      () => forget(name, link),
    );
    link.onStatus((status) => {
      if (status.state === "up") void ask();
      else forget(name, link);
    });
    return { link, ask };
  }

  function letGo(link: AgentLink): void {
    const closed = link.close();
    closing.add(closed);
    void closed.finally(() => closing.delete(closed));
  }

  return {
    keep(names) {
      const wanted = new Set(names);
      for (const [name, each] of kept) {
        if (wanted.has(name)) continue;
        kept.delete(name);
        letGo(each.link);
        remember(name, undefined);
      }
      for (const name of wanted) {
        if (!kept.has(name)) kept.set(name, open(name));
      }
    },
    ask() {
      for (const each of kept.values()) void each.ask();
    },
    async close() {
      for (const each of kept.values()) letGo(each.link);
      kept.clear();
      await Promise.all(closing);
    },
  };
}
