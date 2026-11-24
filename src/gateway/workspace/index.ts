/**
 * The workspace context the gateway hosts: the Markdown files of `context/` in
 * the Shrimpy folder it runs in, kept up with by looking at them every couple
 * of seconds. It must not know who is shown them or how they are served.
 */
export { hostWorkspace, type Workspace } from "./workspace.ts";
