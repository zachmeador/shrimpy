import { arr, obj, remote, type Static, str } from "@earendil-works/chord";
import { gateway } from "./hosts.ts";

/** A file of the workspace context: its full path on the gateway's machine, which is how agents are shown it, and what it says. */
const WorkspaceFileSchema = obj({ path: str(), text: str() });
export type WorkspaceFile = Static<typeof WorkspaceFileSchema>;

/**
 * The workspace context, at `gateway()`: the Markdown files of `context/` in the
 * Shrimpy folder where the gateway runs, which every agent on the network is
 * shown. Its state follows the files, so an edit there reaches whoever holds it
 * within a few seconds. Every caller gets the same files.
 */
export const WorkspaceContext = remote("shrimpy.gateway.workspace-context", {
  version: 1,
  params: {},
  hostAddress: () => gateway(),
  variants: {
    all: {
      state: {
        /** The files with something in them, in order of path. */
        files: arr(WorkspaceFileSchema),
      },
    },
  },
});
