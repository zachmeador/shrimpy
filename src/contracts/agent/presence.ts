import { remote, str } from "@earendil-works/chord";
import { agent } from "../gateway/index.ts";

/**
 * An agent being there, at `agent({ name: agent })`. The gateway holds it for
 * every agent on the roster, which keeps the route to the agent resolved while
 * it is linked, and its hold being live is what `reachable` says. It has no
 * members, so it never needs a new version.
 */
export const AgentPresence = remote("shrimpy.agent.presence", {
  version: 1,
  params: { agent: str() },
  hostAddress: ({ agent: name }) => agent({ name }),
  variants: { present: {} },
});
