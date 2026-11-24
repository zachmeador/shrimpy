import { constant, defineFacet, nul, remote, str } from "@earendil-works/chord";
import { agent, type Principal } from "../../gateway/index.ts";

/** Another build's `Agent`: the same name and number as this one's, with other members. */
const OtherAgent = remote("shrimpy.agent", {
  version: 2,
  params: { agent: str() },
  hostAddress: ({ agent: id }) => agent({ id }),
  variants: { all: { state: { refusal: nul() } } },
});

/** What an agent's program of another build serves in place of this build's `Agent`, so that a holder of this one waits on it. */
export const servingAnotherAgent = defineFacet<Principal>((host) => host.serve(OtherAgent, () => ({ variant: "all", members: { refusal: constant(null) } })));
