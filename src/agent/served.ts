import { defineFacet, type Facet, type FollowAttach } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import {
  Agent,
  AgentPresence,
  type ModelId,
  type Reloaded,
  Session,
  type SessionPage,
  type TriggerSummary,
} from "../contracts/agent/index.ts";
import { type Answer, done, type LiveRoster, type Principal, type Refused, refused } from "../contracts/gateway/index.ts";
import { follow } from "../lib/follow/index.ts";
import { isRefusal, refuse } from "../lib/refusal/index.ts";
import { type Caller, callerOf, check, type Permission, refusalFor } from "./access/index.ts";
import { fileAt, folderAt, type HomePaths } from "./home/index.ts";
import type { KeptLook } from "./look.ts";
import type { Processes } from "./processes/durable.ts";
import type { Requests } from "./requests/durable.ts";
import { noSessionYet, type Sessions, shownOf } from "./sessions/durable.ts";
import type { Triggers } from "./triggers/durable.ts";
import type { Watches } from "./watches/durable.ts";

/** What the agent's objects are served from. */
export interface ServedParts {
  sessions: Sessions;
  requests: Requests;
  triggers: Triggers;
  processes: Processes;
  watches: Watches;
  look: Pick<KeptLook, "sigil" | "pigment">;
  paths: HomePaths;
  reload(): Promise<Reloaded>;
  setModel(model: ModelId | null): Promise<Reloaded>;
  switchTrigger(name: string, on: boolean): Promise<TriggerSummary>;
  roster: LiveRoster;
  takingInput(): boolean;
}

const EMPTY: SessionPage = { items: [], before: null };

const STOPPING = "The agent is stopping and is not taking new input.";

async function answering<T>(work: () => Promise<T>): Promise<Answer<T>> {
  try {
    return done(await work());
  } catch (error) {
    if (isRefusal(error)) return refused(error.message);
    throw error;
  }
}

export function agentFacet(parts: ServedParts): Facet<Principal> {
  const { sessions, requests, triggers, processes, watches, look, paths, roster } = parts;

  const callerNow = async (principal: Principal, signal: AbortSignal | undefined): Promise<Caller> => {
    if (principal.kind === "agent") await roster.known(signal);
    return callerOf(principal, roster.now());
  };

  const allow = async (principal: Principal, permission: Permission, context: Context): Promise<void> =>
    check(await callerNow(principal, context.abortSignal), permission);

  const watching = (principal: Principal): FollowAttach<Refused | null> =>
    follow({
      read: async () => refusalFor(await callerNow(principal, undefined), "watch"),
      watch: (changed) => roster.subscribe(changed),
    });

  return defineFacet<Principal>((host) => {
    host.serve(AgentPresence, () => ({ variant: "present", members: {} }));

    host.serve(
      Agent,
      (_params, principal, self) => {
        const refusal = self.follow(watching(principal));
        const listed = self.follow(sessions.listed);
        const standing = self.follow(triggers.listed);
        const once = self.follow(triggers.onceListed);
        const procs = self.follow(processes.listed);
        const openWatches = self.follow(watches.listed);
        return {
          variant: "all",
          members: {
            refusal,
            sessions: self.derive([refusal, listed], ([no, list]) => (no === null ? list : [])),
            triggers: self.derive([refusal, standing], ([no, list]) => (no === null ? list : [])),
            onceTriggers: self.derive([refusal, once], ([no, list]) => (no === null ? list : [])),
            processes: self.derive([refusal, procs], ([no, list]) => (no === null ? list : [])),
            watches: self.derive([refusal, openWatches], ([no, list]) => (no === null ? list : [])),
            sigil: self.follow(look.sigil),
            pigment: self.follow(look.pigment),
            model: self.derive([refusal, self.follow(sessions.homeModel)], ([no, home]) =>
              no === null ? { provider: home.model.provider, id: home.model.modelId, fromHome: home.fromHome } : null,
            ),
            models: async (ctx) =>
              answering(async () => {
                await allow(principal, "watch", ctx);
                return sessions.models();
              }),
            trigger: async ({ name }, ctx) =>
              answering(async () => {
                await allow(principal, "watch", ctx);
                return triggers.show(name);
              }),
            fire: async ({ name }, ctx) =>
              answering(async () => {
                await allow(principal, "control", ctx);
                if (!parts.takingInput()) refuse(STOPPING);
                return triggers.fire(name);
              }),
            reload: async (ctx) =>
              answering(async () => {
                await allow(principal, "administer", ctx);
                return parts.reload();
              }),
            setModel: async ({ model }, ctx) =>
              answering(async () => {
                await allow(principal, "control", ctx);
                return parts.setModel(model);
              }),
            switchTrigger: async ({ name, on }, ctx) =>
              answering(async () => {
                await allow(principal, "control", ctx);
                return parts.switchTrigger(name, on);
              }),
            processOutput: async ({ id, lines }, ctx) =>
              answering(async () => {
                await allow(principal, "watch", ctx);
                return processes.output(id, lines);
              }),
            killProcess: async ({ id }, ctx) =>
              answering(async () => {
                await allow(principal, "control", ctx);
                await processes.kill(id);
                return null;
              }),
            cancelTrigger: async ({ id }, ctx) =>
              answering(async () => {
                await allow(principal, "control", ctx);
                await triggers.cancelOnce(id);
                return null;
              }),
            cancelWatch: async ({ id }, ctx) =>
              answering(async () => {
                await allow(principal, "control", ctx);
                await watches.cancel(id);
                return null;
              }),
            folder: async ({ path }, ctx) =>
              answering(async () => {
                await allow(principal, "watch", ctx);
                return folderAt(paths, path);
              }),
            file: async ({ path }, ctx) =>
              answering(async () => {
                await allow(principal, "watch", ctx);
                return fileAt(paths, path);
              }),
          },
        };
      },
    );

    host.serve(Session, ({ session: address }, principal, self) => {
      const allowed = self.follow(watching(principal));
      const shown = self.derive(
        [
          self.follow(sessions.view(address)),
          self.follow(processes.listed),
          self.follow(watches.listed),
          self.follow(triggers.onceListed),
          self.follow(sessions.homeModel),
        ],
        ([view, procs, openWatches, once, home]) =>
          shownOf(
            view,
            {
              processes: procs.filter((p) => p.threadId === address),
              watches: openWatches.filter((w) => w.fromThread === address),
              onceTriggers: once.filter((t) => t.threadId === address),
            },
            home.model,
          ),
      );
      const refusal = self.derive([allowed, shown], ([no, view]) =>
        no ?? (view.made ? null : refused(noSessionYet(address))),
      );
      return {
        variant: "all",
        members: {
          refusal,
          window: self.derive([refusal, shown], ([no, view]) => (no === null ? view.window : EMPTY)),
          status: self.derive([refusal, shown], ([no, view]) => (no === null ? view.status : null)),
          read: async ({ before, limit }, ctx) =>
            answering(async () => {
              await allow(principal, "watch", ctx);
              return sessions.read(address, before, limit, ctx);
            }),
          steer: async ({ text, request }, ctx) =>
            answering(async () => {
              await allow(principal, "control", ctx);
              if (!parts.takingInput()) refuse(STOPPING);
              return sessions.steer(address, text, request, BACKGROUND_CONTEXT);
            }),
          wait: async ({ submission }, ctx) =>
            answering(async () => {
              await allow(principal, "watch", ctx);
              return sessions.wait(address, submission, ctx);
            }),
          stop: async (ctx) =>
            answering(async () => {
              await allow(principal, "control", ctx);
              await sessions.stop(address, BACKGROUND_CONTEXT);
              return null;
            }),
          requests: async ({ before, limit }, ctx) =>
            answering(async () => {
              await allow(principal, "watch", ctx);
              return requests.list(address, { ...(before === undefined ? {} : { before }), limit }, ctx);
            }),
          request: async ({ id, entry }, ctx) =>
            answering(async () => {
              await allow(principal, "watch", ctx);
              return requests.inspect(
                address,
                { ...(id === undefined ? {} : { id }), ...(entry === undefined ? {} : { entry }) },
                ctx,
              );
            }),
        },
      };
    });
  });
}
