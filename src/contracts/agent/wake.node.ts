import { readFileSync } from "node:fs";
import { saveFile } from "../../lib/files/node.ts";
import { parseConfig } from "../../lib/json-config/index.ts";
import { nameKey } from "../gateway/index.ts";
import { AGENT_CONFIG, formatAgentConfig } from "./agent-config.ts";
import { loadHome } from "./load.node.ts";
import type { WakePolicy, WakeSettings } from "./wake.ts";

/**
 * Set the policy of a room under `wake` in the home's `agent.json`, in place of
 * any it had, written whole so that nobody reading it at the same moment sees
 * half of it. The rest of the file is kept as it is. Wake settings that don't
 * check out are not written over: the error says why, and the file is for a
 * person to fix. Gives the settings as they are now.
 */
export function saveWake(home: string, room: string, policy: WakePolicy): { file: string; settings: WakeSettings } {
  const { paths, wake, leftOut } = loadHome(home);
  if (leftOut.wake !== undefined) {
    throw new Error(
      `${AGENT_CONFIG} was not changed, because its "wake" does not check out: ${leftOut.wake.reason}. Fix it by hand, or remove "wake".`,
    );
  }
  const wanted = nameKey(room);
  const others = Object.entries(wake ?? {}).filter(([name]) => nameKey(name) !== wanted);
  const settings: WakeSettings = { ...Object.fromEntries(others), [room]: policy };
  // Everything else in the file is written back as it was read, a sigil that doesn't check out included.
  const rest = parseConfig(readFileSync(paths.config, "utf8"), paths.config).rest();
  saveFile(paths.config, formatAgentConfig({ ...rest, wake: settings }));
  return { file: paths.config, settings };
}
