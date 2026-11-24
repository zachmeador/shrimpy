import type { Held, Host } from "@earendil-works/chord";
import type { Context } from "@earendil-works/chord/context";
import { type Principal, type Revocation, WorkspaceContext, type WorkspaceFile } from "../../contracts/gateway/index.ts";

/** The workspace context as the agent holds it at the gateway. */
export interface LiveWorkspace {
  /** Hold the workspace context at the gateway through `host`, once it has loaded, and follow it from then on. */
  follow(host: Host<Principal, Revocation>, context: Context): void;
  /** Let go of it. */
  close(): void;
}

/**
 * The workspace context, held at the gateway once `follow` gives a host, with
 * `take` told its files when they are first heard and after each change. The
 * hold goes up the agent's own link to the gateway, so it waits while the link
 * is down, and nothing is told meanwhile.
 */
export function followWorkspace(take: (files: readonly WorkspaceFile[]) => void): LiveWorkspace {
  let currentHost: Host<Principal, Revocation> | undefined;
  let held: Held<typeof WorkspaceContext> | undefined;
  let watching: { stop(): unknown } | undefined;
  let closed = false;

  const letGo = (): void => {
    void watching?.stop();
    watching = undefined;
    held?.release();
    held = undefined;
  };

  return {
    follow(host, context) {
      if (closed || currentHost === host) return;
      currentHost = host;
      letGo();
      const workspace = host.hold(WorkspaceContext, {}, context);
      held = workspace;
      void workspace.files.watch(context).then(
        (watch) => {
          if (closed || held !== workspace) return void watch.stop();
          watching = watch;
          take(watch.value);
          watch.start(async (call) => {
            if (call.kind === "value" && held === workspace) take(call.value);
          });
        },
        () => undefined,
      );
    },
    close() {
      closed = true;
      currentHost = undefined;
      letGo();
    },
  };
}
