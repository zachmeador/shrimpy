import { basename, join } from "node:path";
import { type HomePaths as SharedPaths, homePaths as sharedPaths } from "../../contracts/agent/node.ts";

/** Where everything lives inside one agent home: the files it shares with the `shrimpy` command, and its own. */
export interface HomePaths extends SharedPaths {
  /** The engine's storage. Only the owner process opens it. */
  readonly database: string;
  /** Where the owner puts the `shrimpy` command its agent's shell runs. */
  readonly bin: string;
  /** The copy of the workspace context the gateway last gave the agent, each file at its path on the gateway's machine. Only the agent writes it. */
  readonly workspaceContext: string;
}

export function homePaths(home: string): HomePaths {
  const paths = sharedPaths(home);
  return {
    ...paths,
    database: join(paths.state, "agent.sqlite"),
    bin: join(paths.runtime, "bin"),
    workspaceContext: join(paths.state, "workspace-context"),
  };
}

/**
 * What to tell a person whose home keeps its Pi storage at `database`, written
 * by another version of Shrimpy, which nothing converts: which files to move
 * into an archive folder, and what goes with them.
 */
export function storageOfAnotherVersion(database: string): string {
  const file = basename(database);
  return (
    `The agent's Pi storage in ${database} was written by another version of Shrimpy, and nothing converts it. ` +
    `Move ${database} into an archive folder, with ${file}-wal and ${file}-shm if they are beside it, and start the agent again. ` +
    "Its sessions go with it, and the rest of the home stays."
  );
}
