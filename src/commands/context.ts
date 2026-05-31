import { exec } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import {
  assembleSessionPrompt,
  createGatewaySessionDescriptor,
  createStoredSessionDescriptor,
} from "../sessions/index.js";
import { createAppRuntime } from "../app/index.js";
import {
  makeMessage,
  textContent,
} from "../channels/index.js";
import {
  buildTurnContext,
  composePromptWithBriefing,
  commandMatchesChannel,
  expandDirectoryResource,
  formatChannelMessage,
  findContextViewOverrides,
  isCommandSource,
  isDirectoryResource,
  parseContextResource,
  resolveContextSource,
  clipBriefingWithMarker,
  renderTurnContext,
  renderPromptSectionManifest,
  summarizePromptSection,
  type ContextSourceConfig,
  type ResolvedContextCommandSource,
} from "../context/index.js";
import {
  parseCommandArgs,
  type CommandHandler,
} from "./framework.js";

const execAsync = promisify(exec);

const USAGE = `usage:
  shrimpy context [--agent <id>] [--skill <id>] [prompt]
  shrimpy context --channel <name> [prompt]
  shrimpy context --turn --channel <name> [prompt]
  shrimpy context turn [--agent <id>] [--channel <name>] [prompt]
  shrimpy context --briefing --channel <name>
  shrimpy context --sections [--json]
  shrimpy context --config
  shrimpy context files list [--agent <id>] [--older-than <dur>] [--json]
  shrimpy context files show [--agent <id>] <path>
  shrimpy context sources list [--agent <id>] [--channel <name>] [--json]
  shrimpy context sources run <id> [--agent <id>] [--channel <name>]`;

export const cmdContext: CommandHandler = async (argv, config) => {
  // files subcommand splits off early — no session bootstrap needed
  if (argv[0] === "files") {
    return cmdContextFiles(argv.slice(1), config);
  }
  if (argv[0] === "sources") {
    return cmdContextSources(argv.slice(1), config);
  }
  if (argv[0] === "turn") {
    return cmdContext(["--turn", ...argv.slice(1)], config);
  }

  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      channel: { type: "string", short: "c" },
      skill: { type: "string", short: "k" },
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      "session-type": { type: "string", short: "s" },
      config: { type: "boolean", default: false },
      sections: { type: "boolean", default: false },
      turn: { type: "boolean", default: false },
      briefing: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(values.agent);
  const agentPaths = runtime.getAgentPaths(agent.id);

  // --config: just dump the resolved config
  if (values.config) {
    console.log(JSON.stringify(runtime.resolved.context, null, 2));
    return 0;
  }

  const cwd = process.cwd();
  const bootstrap = await runtime.createBootstrap({
    agentId: agent.id,
    cwd,
  });
  const sessionType = values["session-type"]
    ?? (values.channel ? "gateway" : "preview");
  const descriptor = values.channel
    ? {
      ...createGatewaySessionDescriptor({
        workspacePath: agentPaths.root,
        agentId: agent.id,
        channel: values.channel,
        cwd,
      }),
      kind: sessionType,
    }
    : createStoredSessionDescriptor({
      workspacePath: agentPaths.root,
      agentId: agent.id,
      sessionName: join("context-preview", agent.id),
      kind: sessionType,
      cwd,
    });
  const plan = {
    descriptor,
    model: runtime.resolveModel(
      bootstrap,
      values.provider,
      values.model,
      agent.model,
      { allowMissingDefault: true },
    ),
    defaultThinking: agent.thinking,
    prompt: {
      skills: values.skill ? [values.skill] : undefined,
    },
  };

  const assembly = assembleSessionPrompt(bootstrap, plan);
  const prompt = positionals.join(" ").trim();
  const previewMessage = values.channel
    ? makeMessage({
      sender: {
        kind: "human",
        actorId: "human:preview",
        displayName: "(user)",
      },
      origin: {
        transport: "cli",
        sourceChannel: values.channel,
      },
      content: textContent(prompt),
    })
    : undefined;
  const userMessage = previewMessage && values.channel
    ? formatChannelMessage(values.channel, previewMessage)
    : prompt;
  const briefing = (prompt || values.briefing || values.turn)
    ? await buildTurnContext({
      runtime,
      descriptor,
      currentMessage: previewMessage,
      preview: true,
    })
    : undefined;
  const briefingText = briefing ? renderTurnContext(briefing) : undefined;
  const turnPrompt = prompt
    ? composePromptWithBriefing(userMessage, briefingText)
    : undefined;

  if (values.briefing && values.json) {
    console.log(JSON.stringify(
      briefing ? { ...briefing, text: briefingText } : undefined,
      null,
      2,
    ));
    return 0;
  }

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          systemPrompt: assembly.systemPrompt,
          promptSections: assembly.sections.map(summarizePromptSection),
          briefing: briefing ? { ...briefing, text: briefingText } : undefined,
          turnPrompt,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (values.briefing) {
    console.log(briefingText ?? "");
    return 0;
  }

  if (values.sections || values.turn) {
    console.log(renderPromptSectionManifest(assembly.sections));
    if (briefingText) console.log(`\n${briefingText}`);
    if (!values.turn) return 0;
    console.log("\n=== System Prompt ===\n");
  }

  console.log(assembly.systemPrompt);

  if (prompt) {
    console.log(
      `\n=== User Message ===\n\n${turnPrompt}`,
    );
  }

  return 0;
};

type SourceKind = "file" | "directory" | "command" | "runtime";

interface SourceView {
  id: string;
  type: SourceKind;
  scope: "session" | "turn";
  origin: string;
  summary: string;
  source?: ContextSourceConfig;
  path?: string;
  rootPath?: string;
  command?: ResolvedContextCommandSource;
}

async function cmdContextSources(argv: string[], config: unknown): Promise<number> {
  const sub = argv[0];
  if (sub !== "list" && sub !== "run") {
    console.error("usage: shrimpy context sources list|run ...");
    return 2;
  }

  const { values, positionals } = parseCommandArgs({
    args: argv.slice(1),
    options: {
      agent: { type: "string", short: "a" },
      channel: { type: "string", short: "c" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const runtime = createAppRuntime(config as any);
  const agent = runtime.getAgent(values.agent);
  const sources = collectContextSources({
    runtime,
    agentId: agent.id,
    channel: values.channel,
  });

  if (sub === "list") {
    if (values.json) {
      console.log(JSON.stringify(sources.map(sourceToJson), null, 2));
      return 0;
    }
    for (const source of sources) {
      console.log(`${source.id}  [${source.type}/${source.scope}]  ${source.summary}`);
    }
    return 0;
  }

  const id = positionals[0];
  if (!id) {
    console.error("usage: shrimpy context sources run <id> [--agent <id>] [--channel <name>]");
    return 2;
  }
  const source = sources.find((candidate) => candidate.id === id);
  if (!source) {
    console.error(`unknown context source: ${id}`);
    return 1;
  }

  const output = await runContextSource({
    source,
    runtime,
    agentId: agent.id,
    channel: values.channel,
  });
  if (values.json) {
    console.log(JSON.stringify({ id: source.id, output }, null, 2));
  } else {
    console.log(output);
  }
  return 0;
}

function collectContextSources(input: {
  runtime: ReturnType<typeof createAppRuntime>;
  agentId: string;
  channel?: string;
}): SourceView[] {
  const agentPaths = input.runtime.getAgentPaths(input.agentId);
  const out: SourceView[] = [];

  const addConfigured = (
    source: ContextSourceConfig,
    origin: string,
    index: number,
  ): void => {
    out.push(createSourceView({
      source,
      origin,
      index,
      agentRootPath: agentPaths.root,
      workspacePath: input.runtime.paths.workspace,
    }));
  };

  input.runtime.resolved.context.sources.forEach((source, index) =>
    addConfigured(source, "base", index)
  );

  const overrides = findContextViewOverrides(input.runtime.resolved.context, {
    agentId: input.agentId,
    channel: input.channel,
  });
  overrides.forEach((override, overrideIndex) => {
    override.sources?.forEach((source, sourceIndex) =>
      addConfigured(source, `view:${overrideIndex}`, sourceIndex)
    );
  });

  out.push({
    id: "runtime:turn-context",
    type: "runtime",
    scope: "turn",
    origin: "runtime",
    summary: "built-in turn context producers",
  });

  return dedupeSourceIds(out);
}

function createSourceView(input: {
  source: ContextSourceConfig;
  origin: string;
  index: number;
  agentRootPath: string;
  workspacePath: string;
}): SourceView {
  const resolved = resolveContextSource(input.source);
  if (isCommandSource(resolved)) {
    return {
      id: resolved.id,
      type: "command",
      scope: "turn",
      origin: input.origin,
      summary: `${resolved.command} channels=${resolved.channels.join(",")}`,
      source: input.source,
      command: resolved,
    };
  }

  const parsed = parseContextResource(resolved);
  const rootPath = parsed.scope === "agent" ? input.agentRootPath : input.workspacePath;
  const type = isDirectoryResource(input.source) ? "directory" : "file";
  return {
    id: `${type}:${parsed.scope}:${parsed.path}`,
    type,
    scope: "session",
    origin: input.origin,
    summary: resolved,
    source: input.source,
    path: parsed.path,
    rootPath,
  };
}

function dedupeSourceIds(sources: SourceView[]): SourceView[] {
  const seen = new Map<string, number>();
  return sources.map((source) => {
    const count = seen.get(source.id) ?? 0;
    seen.set(source.id, count + 1);
    return count === 0
      ? source
      : { ...source, id: `${source.id}#${count + 1}` };
  });
}

function sourceToJson(source: SourceView): Record<string, unknown> {
  return {
    id: source.id,
    type: source.type,
    scope: source.scope,
    origin: source.origin,
    summary: source.summary,
    ...(source.command
      ? {
        command: source.command.command,
        channels: source.command.channels,
        timeoutMs: source.command.timeoutMs,
        maxChars: source.command.maxChars,
        freshForMs: source.command.freshForMs,
      }
      : {}),
  };
}

async function runContextSource(input: {
  source: SourceView;
  runtime: ReturnType<typeof createAppRuntime>;
  agentId: string;
  channel?: string;
}): Promise<string> {
  if (input.source.command) {
    return runCommandContextSource(input.source.command, input);
  }
  if (input.source.type === "runtime") {
    return renderRuntimeTurnContext(input);
  }
  if (!input.source.rootPath || !input.source.path) {
    return "";
  }
  if (input.source.type === "directory") {
    const refs = expandDirectoryResource(input.source.rootPath, input.source.path);
    if (refs.length === 0) return "";
    return refs.map((ref) => {
      const path = join(ref.rootPath, ref.resourcePath);
      return `## ${ref.resourcePath}\n\n${readFileSync(path, "utf-8")}`;
    }).join("\n\n---\n\n");
  }
  const path = join(input.source.rootPath, input.source.path);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

async function runCommandContextSource(
  command: ResolvedContextCommandSource,
  input: {
    runtime: ReturnType<typeof createAppRuntime>;
    agentId: string;
    channel?: string;
  },
): Promise<string> {
  if (!commandMatchesChannel(command, input.channel)) {
    return "";
  }
  const { stdout } = await execAsync(command.command, {
    cwd: input.runtime.paths.workspace,
    timeout: command.timeoutMs,
    env: {
      ...process.env,
      SHRIMPY_BRIEFING_AGENT: input.agentId,
      SHRIMPY_BRIEFING_CHANNEL: input.channel ?? "",
      SHRIMPY_BRIEFING_SESSION_TYPE: input.channel ? "gateway" : "preview",
    },
    maxBuffer: Math.max(command.maxChars * 4, 4096),
  });
  return clipBriefingWithMarker(stdout.trim(), command.maxChars);
}

async function renderRuntimeTurnContext(input: {
  runtime: ReturnType<typeof createAppRuntime>;
  agentId: string;
  channel?: string;
}): Promise<string> {
  const agentPaths = input.runtime.getAgentPaths(input.agentId);
  const cwd = process.cwd();
  const descriptor = input.channel
    ? createGatewaySessionDescriptor({
      workspacePath: agentPaths.root,
      agentId: input.agentId,
      channel: input.channel,
      cwd,
    })
    : createStoredSessionDescriptor({
      workspacePath: agentPaths.root,
      agentId: input.agentId,
      sessionName: join("context-preview", input.agentId),
      kind: "preview",
      cwd,
    });
  const previewMessage = input.channel
    ? makeMessage({
      sender: {
        kind: "human",
        actorId: "human:preview",
        displayName: "(user)",
      },
      origin: {
        transport: "cli",
        sourceChannel: input.channel,
      },
      content: textContent(""),
    })
    : undefined;
  const context = await buildTurnContext({
    runtime: input.runtime,
    descriptor,
    currentMessage: previewMessage,
    preview: true,
  });
  return renderTurnContext(context);
}

async function cmdContextFiles(argv: string[], config: unknown): Promise<number> {
  const sub = argv[0];
  if (sub !== "list" && sub !== "show") {
    console.error("usage: shrimpy context files list|show ...");
    return 2;
  }

  const { values, positionals } = parseCommandArgs({
    args: argv.slice(1),
    options: {
      agent: { type: "string", short: "a" },
      "older-than": { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const runtime = createAppRuntime(config as any);
  const agent = runtime.getAgent(values.agent);
  const agentPaths = runtime.getAgentPaths(agent.id);
  const contextDir = agentPaths.contextDir;

  if (sub === "list") {
    const olderThanMs = parseDuration(values["older-than"]);
    const cutoff = olderThanMs !== undefined ? Date.now() - olderThanMs : undefined;
    const files = walkContextFiles(contextDir).filter((file) => {
      if (cutoff === undefined) return true;
      return file.mtime <= cutoff;
    });

    if (values.json) {
      console.log(JSON.stringify(files.map((file) => ({
        path: relative(agentPaths.root, file.path),
        bytes: file.bytes,
        mtime: new Date(file.mtime).toISOString(),
      })), null, 2));
      return 0;
    }

    if (files.length === 0) {
      console.log("(no context files)");
      return 0;
    }
    for (const file of files) {
      console.log(`  ${relative(agentPaths.root, file.path)}  ${file.bytes}b  ${new Date(file.mtime).toISOString()}`);
    }
    return 0;
  }

  // show
  const target = positionals[0];
  if (!target) {
    console.error("usage: shrimpy context files show [--agent <id>] <path>");
    return 2;
  }
  const fullPath = join(agentPaths.root, target);
  if (!existsSync(fullPath)) {
    console.error(`not found: ${target}`);
    return 1;
  }
  console.log(readFileSync(fullPath, "utf-8"));
  return 0;
}

function walkContextFiles(root: string): Array<{
  path: string;
  bytes: number;
  mtime: number;
}> {
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  const out: Array<{ path: string; bytes: number; mtime: number }> = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile() && name.endsWith(".md")) {
        out.push({ path: full, bytes: stat.size, mtime: stat.mtimeMs });
      }
    }
  };
  walk(root);
  return out;
}

/**
 * Parse simple durations: "30d", "2w", "6h", "45m". Returns milliseconds, or
 * undefined for unparseable input. Empty/undefined input returns undefined.
 */
function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^(\d+)([smhdw])$/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 7 * 86_400_000,
  };
  return n * (multipliers[unit] ?? 0);
}
