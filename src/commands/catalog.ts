export type CliCommandCategory =
  | "Session Commands"
  | "Workspace And Runtime"
  | "Channels And Surfaces"
  | "Agents, Skills, Users"
  | "Gateway"
  | "Plumbing";

export interface CliOptionSpec {
  name: string;
  short?: string;
  takesValue?: boolean;
}

export interface CliCommandEntry {
  path: readonly string[];
  args?: string;
  summary: string;
  category: CliCommandCategory;
  options?: readonly CliOptionSpec[];
  reference?: boolean;
  topLevelHelp?: boolean;
}

const jsonOption = { name: "--json" };
const agentOption = { name: "--agent", short: "-a", takesValue: true };
const providerOption = { name: "--provider", short: "-p", takesValue: true };
const modelOption = { name: "--model", short: "-m", takesValue: true };
const thinkingOption = { name: "--thinking", takesValue: true };
const skillOption = { name: "--skill", short: "-k", takesValue: true };

export const ROOT_OPTIONS: readonly CliOptionSpec[] = [
  agentOption,
  providerOption,
  modelOption,
  thinkingOption,
  skillOption,
  { name: "--help", short: "-h" },
  { name: "--version", short: "-v" },
];

export const CLI_COMMAND_CATALOG: readonly CliCommandEntry[] = [
  entry([], undefined, "Open the default agent's TUI session.", "Session Commands"),
  entry([], "\"prompt\"", "Open the TUI session with an initial prompt.", "Session Commands"),
  entry(["run"], "[--agent <id>] [--skill <id>] <prompt> [--provider <p>] [--model <m>] [--thinking <level>]", "Run a one-shot prompt and print the response.", "Session Commands", [agentOption, skillOption, providerOption, modelOption, thinkingOption]),
  entry(["agent", "tui"], "<id> [prompt] [--provider <p>] [--model <m>] [--thinking <level>]", "Open a TUI session as a specific agent.", "Session Commands", [providerOption, modelOption, thinkingOption]),
  entry(["agent", "run"], "<id> <prompt>", "Run a one-shot prompt as a specific agent.", "Session Commands"),
  entry(["sessions", "new"], "<channel> [--agent <id>]", "Archive/reset a session.", "Session Commands", [agentOption]),
  entry(["sessions", "clear"], "<channel> [--agent <id>]", "Alias for session reset.", "Session Commands", [agentOption]),
  entry(["sessions", "restore"], "<channel> [--agent <id>] [--archive <name>]", "Restore an archived session.", "Session Commands", [agentOption, { name: "--archive", takesValue: true }]),
  entry(["sessions", "thinking"], "<channel> <level> [--agent <id>]", "Change reasoning effort for a session.", "Session Commands", [agentOption]),
  entry(["sessions", "list"], "[channel] [--agent <id>] [--json]", "Inspect active and archived sessions.", "Session Commands", [agentOption, jsonOption]),
  entry(["sessions", "compaction"], "<channel> [--agent <id>] [--session-type <type>] [--json]", "Inspect effective compaction policy and recorded session settings.", "Session Commands", [agentOption, { name: "--session-type", takesValue: true }, jsonOption]),
  entry(["models"], "[--json]", "Inspect agent default models and Pi-visible provider models.", "Session Commands", [jsonOption]),
  entry(["models", "resolve"], "[--agent <id>] [--session <name>|--channel <name>] [--provider <p>] [--model <m>] [--json]", "Explain model precedence for CLI, session, channel, or agent defaults.", "Session Commands", [agentOption, { name: "--session", short: "-s", takesValue: true }, { name: "--channel", short: "-c", takesValue: true }, providerOption, modelOption, jsonOption]),

  entry(["setup"], undefined, "Initialize and launch setup flow.", "Workspace And Runtime"),
  entry(["setup", "init"], undefined, "Create baseline workspace files.", "Workspace And Runtime"),
  entry(["setup", "telegram"], undefined, "Run guided Telegram bot setup.", "Workspace And Runtime"),
  entry(["status"], undefined, "Show workspace, gateway, channel, schedule, and Telegram status.", "Workspace And Runtime"),
  entry(["schedules"], "[list] [--agent <id>] [--one-time] [--status <status>] [--json]", "Inspect configured recurring and one-time schedules.", "Workspace And Runtime", [agentOption, { name: "--one-time" }, { name: "--status", takesValue: true }, jsonOption]),
  entry(["schedules", "list"], "[--agent <id>] [--one-time] [--status <status>] [--json]", "Inspect recurring and one-time schedules with optional filters.", "Workspace And Runtime", [agentOption, { name: "--one-time" }, { name: "--status", takesValue: true }, jsonOption]),
  entry(["schedules", "once"], "(--at <time> | --in <duration>) --channel <name> --text <text> [--agent <id>] [--timezone <tz>] [--json]", "Create a durable one-time scheduled channel message.", "Workspace And Runtime", [{ name: "--at", takesValue: true }, { name: "--in", takesValue: true }, { name: "--channel", takesValue: true }, { name: "--text", takesValue: true }, agentOption, { name: "--timezone", takesValue: true }, { name: "--id", takesValue: true }, jsonOption]),
  entry(["schedules", "cancel"], "<schedule-id> [--json]", "Cancel a pending one-time schedule.", "Workspace And Runtime", [{ name: "--reason", takesValue: true }, jsonOption]),
  entry(["schedules", "show"], "<schedule-id> [--json]", "Show one resolved recurring or one-time schedule.", "Workspace And Runtime", [jsonOption]),
  entry(["context"], "[--agent <id>] [--skill <id>] [prompt]", "Render assembled session context.", "Workspace And Runtime", [agentOption, skillOption, providerOption, modelOption, { name: "--session-type", short: "-s", takesValue: true }, { name: "--config" }, { name: "--sections" }, { name: "--turn" }, jsonOption]),
  entry(["context"], "--channel <name> [prompt]", "Render channel context for an agent.", "Workspace And Runtime", [{ name: "--channel", short: "-c", takesValue: true }, agentOption, jsonOption]),
  entry(["context"], "--turn --channel <name> [prompt]", "Render the full turn preview, including prompt sections and turn context.", "Workspace And Runtime", [{ name: "--turn" }, { name: "--channel", short: "-c", takesValue: true }, agentOption, jsonOption]),
  entry(["context", "turn"], "[--agent <id>] [--channel <name>] [prompt]", "Render only turn context for a channel/session.", "Workspace And Runtime", [agentOption, { name: "--channel", short: "-c", takesValue: true }, jsonOption]),
  entry(["context"], "--sections [--json]", "Inspect prompt sections with provenance.", "Workspace And Runtime", [{ name: "--sections" }, jsonOption]),
  entry(["context"], "--config", "Show resolved context config.", "Workspace And Runtime", [{ name: "--config" }]),
  entry(["context", "files", "list"], "[--agent <id>] [--older-than <dur>] [--json]", "List agent context Markdown files.", "Workspace And Runtime", [agentOption, { name: "--older-than", takesValue: true }, jsonOption]),
  entry(["context", "files", "show"], "[--agent <id>] <path>", "Print one agent context file.", "Workspace And Runtime", [agentOption]),
  entry(["context", "sources", "list"], "[--agent <id>] [--channel <name>] [--json]", "Inspect configured file, directory, command, and runtime sources.", "Workspace And Runtime", [agentOption, { name: "--channel", short: "-c", takesValue: true }, jsonOption]),
  entry(["context", "sources", "run"], "<id> [--agent <id>] [--channel <name>]", "Render one context source for debugging.", "Workspace And Runtime", [agentOption, { name: "--channel", short: "-c", takesValue: true }]),

  entry(["channels"], "[--json]", "List channels.", "Channels And Surfaces", [jsonOption]),
  entry(["channels", "show"], "<name> [--json]", "Inspect one channel.", "Channels And Surfaces", [jsonOption]),
  entry(["channels", "read"], "<name> [--limit N] [--json]", "Read recent channel messages.", "Channels And Surfaces", [{ name: "--limit", takesValue: true }, jsonOption]),
  entry(["channels", "search"], "<name> [query] [--kind <kind>] [--sender <kind>] [--transport <name>] [--limit N] [--json]", "Search and filter channel messages.", "Channels And Surfaces", [{ name: "--text", takesValue: true }, { name: "--kind", takesValue: true }, { name: "--sender", takesValue: true }, { name: "--actor-id", takesValue: true }, { name: "--transport", takesValue: true }, { name: "--content-type", takesValue: true }, { name: "--addressed", takesValue: true }, { name: "--schedule", takesValue: true }, { name: "--source-kind", takesValue: true }, { name: "--limit", takesValue: true }, jsonOption]),
  entry(["channels", "tail"], "<name>", "Watch a channel log.", "Channels And Surfaces"),
  entry(["channels", "create"], "<name> [--json]", "Create or bootstrap channel membership.", "Channels And Surfaces", [jsonOption]),
  entry(["channels", "post"], "<name> [--agent <id>] <text> [--json]", "Post a CLI human message into a channel log.", "Channels And Surfaces", [agentOption, jsonOption]),
  entry(["channels", "dm"], "<agent-a> <agent-b> [--json]", "Create a deterministic agent DM channel.", "Channels And Surfaces", [jsonOption]),
  entry(["channels", "members"], "<name> [--json]", "Show channel members.", "Channels And Surfaces", [jsonOption]),
  entry(["channels", "join"], "<name> --agent <id> [--json]", "Add an agent to channel membership.", "Channels And Surfaces", [agentOption, jsonOption]),
  entry(["channels", "leave"], "<name> --agent <id> [--json]", "Remove an agent from channel membership.", "Channels And Surfaces", [agentOption, jsonOption]),
  entry(["surface"], "[--json]", "List surface thread state.", "Channels And Surfaces", [jsonOption]),
  entry(["surface", "show"], "<surface> <thread-id>", "Show one surface thread state entry.", "Channels And Surfaces"),
  entry(["surface", "set-agent"], "<surface> <thread-id> <agent-id> [--json]", "Set addressed agent for a surface thread.", "Channels And Surfaces", [jsonOption]),
  entry(["surface", "clear-agent"], "<surface> <thread-id> [--json]", "Clear addressed agent for a surface thread.", "Channels And Surfaces", [jsonOption]),

  entry(["agent", "list"], "[--json]", "List configured agents.", "Agents, Skills, Users", [jsonOption]),
  entry(["agent", "show"], "<id>", "Show resolved agent config and paths.", "Agents, Skills, Users"),
  entry(["agent", "inspect"], "<id> [--json]", "Show effective tool capability view.", "Agents, Skills, Users", [jsonOption]),
  entry(["agent", "add"], "<id> [--root <path>] [--provider <p>] [--model <m>] [--tools a,b] [--disable-tools a,b] [--thinking <level>] [--attention <mode>] [--json]", "Add an agent and scaffold docs.", "Agents, Skills, Users", [{ name: "--root", takesValue: true }, providerOption, modelOption, { name: "--tools", takesValue: true }, { name: "--disable-tools", takesValue: true }, thinkingOption, { name: "--attention", takesValue: true }, jsonOption]),
  entry(["agent", "set"], "<id> [--root <path>] [--provider <p>] [--model <m>] [--tools a,b] [--disable-tools a,b] [--thinking <level>] [--attention <mode>] [--json]", "Update agent root, model defaults, tools, thinking, or attention mode.", "Agents, Skills, Users", [{ name: "--root", takesValue: true }, providerOption, modelOption, { name: "--tools", takesValue: true }, { name: "--disable-tools", takesValue: true }, thinkingOption, { name: "--attention", takesValue: true }, jsonOption]),
  entry(["agent", "attention"], "<id> [--channel <name>] [--json]", "Inspect base and effective attention policy.", "Agents, Skills, Users", [{ name: "--channel", takesValue: true }, jsonOption]),
  entry(["agent", "attention", "set"], "<id> [--channel <pattern>] [--mode <all|mentions|addressed|none>] [--senders a,b] [--actor-ids a,b] [--user-ids a,b] [--json]", "Set base or per-channel attention fields.", "Agents, Skills, Users", [{ name: "--channel", takesValue: true }, { name: "--mode", takesValue: true }, { name: "--senders", takesValue: true }, { name: "--actor-ids", takesValue: true }, { name: "--user-ids", takesValue: true }, jsonOption]),
  entry(["agent", "attention", "clear"], "<id> [--channel <pattern>] [--mode] [--senders] [--actor-ids] [--user-ids] [--json]", "Clear base or per-channel attention fields.", "Agents, Skills, Users", [{ name: "--channel", takesValue: true }, { name: "--mode" }, { name: "--senders" }, { name: "--actor-ids" }, { name: "--user-ids" }, jsonOption]),
  entry(["agent", "attention", "test"], "<id> --channel <name> --sender <human|agent|system> --text <text> [--actor-id <id>] [--user-id <id>] [--addressed <id>] [--json]", "Explain whether a sample message would become a turn.", "Agents, Skills, Users", [{ name: "--channel", takesValue: true }, { name: "--sender", takesValue: true }, { name: "--text", takesValue: true }, { name: "--actor-id", takesValue: true }, { name: "--user-id", takesValue: true }, { name: "--addressed", takesValue: true }, jsonOption]),
  entry(["agent", "schedules"], "<id> [--json]", "List one agent's schedule definitions.", "Agents, Skills, Users", [jsonOption]),
  entry(["agent", "schedule"], "<id> <schedule-id> [--json]", "Show one agent schedule definition.", "Agents, Skills, Users", [jsonOption]),
  entry(["agent", "rename"], "<old-id> <new-id> [--json]", "Rename an agent and update local state.", "Agents, Skills, Users", [jsonOption]),
  entry(["agent", "remove"], "<id> [--delete-files] [--json]", "Remove an agent from config and state.", "Agents, Skills, Users", [{ name: "--delete-files" }, jsonOption]),
  entry(["skills", "list"], "[--agent <id>] [--json]", "List effective agent and workspace skills.", "Agents, Skills, Users", [agentOption, jsonOption]),
  entry(["skills", "show"], "<id> [--agent <id>]", "Print a skill's SKILL.md.", "Agents, Skills, Users", [agentOption]),
  entry(["skills", "add"], "<id> [--agent <id>|--workspace] [--description <text>] [--force]", "Scaffold a valid workspace or agent skill bundle.", "Agents, Skills, Users", [agentOption, { name: "--workspace" }, { name: "--description", short: "-d", takesValue: true }, { name: "--force" }]),
  entry(["skills", "install"], "<source> [--agent <id>|--workspace] [--id <id>] [--force]", "Copy a local skill bundle or Markdown entrypoint into the workspace.", "Agents, Skills, Users", [agentOption, { name: "--workspace" }, { name: "--id", takesValue: true }, { name: "--force" }]),
  entry(["skills", "validate"], "[id] [--agent <id>] [--json]", "Validate skill metadata, layout, loading, and shadowing.", "Agents, Skills, Users", [agentOption, jsonOption]),
  entry(["users", "list"], "[--json]", "List identity links and resolved owner.", "Agents, Skills, Users", [jsonOption]),
  entry(["users", "get-owner"], "[--json]", "Print the resolved owner identity.", "Agents, Skills, Users", [jsonOption]),
  entry(["users", "set-owner"], "<userId>", "Set the workspace owner.", "Agents, Skills, Users"),

  entry(["gateway", "status"], undefined, "Show gateway activity and scheduler status.", "Gateway"),
  entry(["gateway", "logs"], "[--lines N|--tail N] [--follow] [--path]", "Print or follow recent workspace gateway log lines.", "Gateway", [{ name: "--lines", takesValue: true }, { name: "--tail", takesValue: true }, { name: "--follow" }, { name: "--path" }]),
  entry(["gateway", "install"], undefined, "Install the systemd user service.", "Gateway"),
  entry(["gateway", "uninstall"], undefined, "Uninstall the systemd user service.", "Gateway"),
  entry(["gateway", "start"], undefined, "Start the gateway service.", "Gateway"),
  entry(["gateway", "stop"], undefined, "Stop the gateway service.", "Gateway"),
  entry(["gateway", "restart"], undefined, "Restart the gateway service.", "Gateway"),

  entry(["completion", "bash"], undefined, "Print Bash completion generated from the CLI catalog.", "Plumbing"),
  entry(["completion", "zsh"], undefined, "Print Zsh completion generated from the CLI catalog.", "Plumbing"),
];

export const CLI_CATEGORIES: readonly CliCommandCategory[] = [
  "Session Commands",
  "Workspace And Runtime",
  "Channels And Surfaces",
  "Agents, Skills, Users",
  "Gateway",
  "Plumbing",
];

export function formatCommandUsage(command: CliCommandEntry): string {
  const base = ["shrimpy", ...command.path].join(" ");
  return command.args ? `${base} ${command.args}` : base;
}

export function usageEntriesForGroup(group: string): CliCommandEntry[] {
  return CLI_COMMAND_CATALOG.filter((command) => command.path[0] === group);
}

export function entriesForPath(path: readonly string[]): CliCommandEntry[] {
  return CLI_COMMAND_CATALOG.filter((command) => pathsEqual(command.path, path));
}

export function renderGroupUsage(group: string): string {
  const lines = usageEntriesForGroup(group).map((command) => `  ${formatCommandUsage(command)}`);
  return lines.length > 0 ? `usage:\n${lines.join("\n")}` : `usage: shrimpy ${group}`;
}

export function renderCommandUsage(path: readonly string[]): string {
  const command = entriesForPath(path)[0];
  return `usage: ${command ? formatCommandUsage(command) : ["shrimpy", ...path].join(" ")}`;
}

export function childCommandNames(path: readonly string[]): string[] {
  const names = new Set<string>();
  for (const command of CLI_COMMAND_CATALOG) {
    if (command.path.length <= path.length || !pathIsPrefix(path, command.path)) continue;
    names.add(command.path[path.length]);
  }
  return [...names].sort();
}

export function optionsForPath(path: readonly string[]): CliOptionSpec[] {
  const options = new Map<string, CliOptionSpec>();
  if (path.length === 0) {
    for (const option of ROOT_OPTIONS) addOption(options, option);
  }
  for (const command of CLI_COMMAND_CATALOG) {
    if (!pathsEqual(command.path, path)) continue;
    for (const option of command.options ?? []) addOption(options, option);
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function completionPaths(): string[][] {
  const paths = new Map<string, string[]>();
  paths.set("", []);
  for (const command of CLI_COMMAND_CATALOG) {
    for (let index = 1; index <= command.path.length; index += 1) {
      const path = command.path.slice(0, index);
      paths.set(path.join(" "), path);
    }
  }
  return [...paths.values()].sort((a, b) => a.join(" ").localeCompare(b.join(" ")));
}

export function valueOptionNames(): string[] {
  const names = new Set<string>();
  for (const option of [...ROOT_OPTIONS, ...CLI_COMMAND_CATALOG.flatMap((command) => command.options ?? [])]) {
    if (!option.takesValue) continue;
    names.add(option.name);
    if (option.short) names.add(option.short);
  }
  return [...names].sort();
}

function entry(
  path: readonly string[],
  args: string | undefined,
  summary: string,
  category: CliCommandCategory,
  options: readonly CliOptionSpec[] = [],
  reference = true,
): CliCommandEntry {
  return {
    path,
    args,
    summary,
    category,
    options,
    reference,
    topLevelHelp: true,
  };
}

function addOption(options: Map<string, CliOptionSpec>, option: CliOptionSpec): void {
  options.set(option.name, option);
  if (option.short) {
    options.set(option.short, {
      name: option.short,
      takesValue: option.takesValue,
    });
  }
}

function pathsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function pathIsPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.every((part, index) => path[index] === part);
}
