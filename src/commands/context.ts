import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createAppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
  prefixPromptWithTurnContext,
  renderPromptSectionManifest,
  summarizePromptSection,
} from "../context/index.js";
import {
  buildContextTurnPreview,
  buildSessionContextPreview,
  collectContextSources,
  runContextSource,
  type ContextSourceRunResult,
  type ContextSourceView,
} from "../context/preview.js";
import { tryParseDurationMs } from "../util/time-format.js";
import {
  createCommandGroup,
  parseCommandArgs,
  requireArg,
  usage as printUsage,
  type CommandHandler,
} from "./framework.js";
import {
  renderCommandUsage,
  renderGroupUsage,
} from "./catalog.js";

const USAGE = renderGroupUsage("context");
const CONTEXT_FILES_USAGE = [
  renderCommandUsage(["context", "files", "list"]),
  renderCommandUsage(["context", "files", "show"]),
].join("\n");
const CONTEXT_SOURCES_USAGE = [
  renderCommandUsage(["context", "sources", "list"]),
  renderCommandUsage(["context", "sources", "run"]),
].join("\n");

const cmdContextFiles: CommandHandler = createCommandGroup({
  name: "files",
  path: ["context", "files"],
  usage: CONTEXT_FILES_USAGE,
  default: ({ usage }) => printUsage(usage, "files subcommand required"),
  commands: {
    list: ({ argv, config }) => cmdContextFilesList(argv, config),
    show: ({ argv, config }) => cmdContextFilesShow(argv, config),
  },
});

const cmdContextSources: CommandHandler = createCommandGroup({
  name: "sources",
  path: ["context", "sources"],
  usage: CONTEXT_SOURCES_USAGE,
  default: ({ usage }) => printUsage(usage, "sources subcommand required"),
  commands: {
    list: ({ argv, config }) => cmdContextSourcesList(argv, config),
    run: ({ argv, config }) => cmdContextSourcesRun(argv, config),
  },
});

export const cmdContext: CommandHandler = createCommandGroup({
  name: "context",
  usage: USAGE,
  default: ({ argv, config }) => cmdContextPreview(argv, config),
  defaultWhen: () => true,
  commands: {
    files: ({ argv, config }) => cmdContextFiles(argv, config),
    sources: ({ argv, config }) => cmdContextSources(argv, config),
    turn: ({ argv, config }) => cmdContextTurn(argv, config),
  },
});

async function cmdContextPreview(argv: string[], config: ShrimpyConfig): Promise<number> {
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
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const runtime = createAppRuntime(config);
  // --config: just dump the resolved config
  if (values.config) {
    console.log(JSON.stringify(runtime.resolved.context, null, 2));
    return 0;
  }

  const prompt = positionals.join(" ").trim();
  const preview = await buildSessionContextPreview(runtime, {
    agentId: values.agent,
    channel: values.channel,
    sessionType: values["session-type"],
    provider: values.provider,
    model: values.model,
    skill: values.skill,
    prompt,
    includeTurn: Boolean(prompt || values.turn),
  });

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          systemPrompt: preview.assembly.systemPrompt,
          shrimpySystemPrompt: preview.assembly.baseSystemPrompt,
          promptSections: preview.assembly.sections.map(summarizePromptSection),
          turnContext: preview.turnContext
            ? { ...preview.turnContext, text: preview.turnContextText }
            : undefined,
          userMessage: preview.userMessage,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (values.sections || values.turn) {
    console.log(renderPromptSectionManifest(preview.assembly.sections));
    if (!values.turn) return 0;
    console.log("");
  }

  const userMessage = preview.userMessage && preview.turnContextText
    ? prefixPromptWithTurnContext(preview.userMessage, preview.turnContextText)
    : preview.userMessage;
  const blocks = [
    preview.assembly.systemPrompt,
    userMessage ?? (values.turn ? preview.turnContextText : undefined),
  ].filter(Boolean);
  console.log(blocks.join("\n\n"));

  return 0;
}

async function cmdContextTurn(argv: string[], config: ShrimpyConfig): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      channel: { type: "string", short: "c" },
      "session-type": { type: "string", short: "s" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const runtime = createAppRuntime(config);
  const prompt = positionals.join(" ").trim();
  const preview = await buildContextTurnPreview(runtime, {
    agentId: values.agent,
    channel: values.channel,
    sessionType: values["session-type"],
    prompt,
  });

  if (values.json) {
    console.log(JSON.stringify({ ...preview.turnContext, text: preview.text }, null, 2));
  } else {
    console.log(preview.text);
  }
  return 0;
}

async function cmdContextSourcesList(argv: string[], config: ShrimpyConfig): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      channel: { type: "string", short: "c" },
      "session-type": { type: "string", short: "s" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: CONTEXT_SOURCES_USAGE,
  });

  const runtime = createAppRuntime(config);
  const sources = collectContextSources({
    runtime,
    agentId: values.agent,
    channel: values.channel,
  });

  if (values.json) {
    console.log(JSON.stringify(sources.map(sourceToJson), null, 2));
    return 0;
  }
  for (const source of sources) {
    console.log(`${source.id}  [${source.type}/${source.scope}]  ${source.summary}`);
  }
  return 0;
}

async function cmdContextSourcesRun(argv: string[], config: ShrimpyConfig): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      channel: { type: "string", short: "c" },
      "session-type": { type: "string", short: "s" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: renderCommandUsage(["context", "sources", "run"]),
  });

  const runtime = createAppRuntime(config);
  const sources = collectContextSources({
    runtime,
    agentId: values.agent,
    channel: values.channel,
  });
  const id = requireArg(
    positionals[0],
    renderCommandUsage(["context", "sources", "run"]),
    "context source id",
  );
  const source = sources.find((candidate) => candidate.id === id);
  if (!source) {
    console.error(`unknown context source: ${id}`);
    return 1;
  }

  const result = await runContextSource({
    source,
    runtime,
    agentId: values.agent,
    channel: values.channel,
    sessionType: values["session-type"],
  });
  if (values.json) {
    console.log(JSON.stringify({
      id: source.id,
      output: result.output,
      ...(result.items ? { items: result.items } : {}),
      ...(result.error ? { error: result.error } : {}),
    }, null, 2));
  } else {
    if (result.error) {
      console.error(renderContextSourceError(result));
    } else {
      console.log(result.output);
    }
  }
  return result.error ? 1 : 0;
}

function sourceToJson(source: ContextSourceView): Record<string, unknown> {
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

function renderContextSourceError(result: ContextSourceRunResult): string {
  if (!result.items || result.items.length === 0) {
    return result.error ?? "context source failed";
  }
  return result.items.map((item) =>
    item.inspect ? `${item.summary}\n  inspect: ${item.inspect}` : item.summary
  ).join("\n");
}

async function cmdContextFilesList(argv: string[], config: ShrimpyConfig): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      "older-than": { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: CONTEXT_FILES_USAGE,
  });

  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(values.agent);
  const agentPaths = runtime.getAgentPaths(agent.id);
  const contextDir = agentPaths.contextDir;

  const olderThanMs = tryParseDurationMs(values["older-than"]);
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

async function cmdContextFilesShow(argv: string[], config: ShrimpyConfig): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      "older-than": { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: renderCommandUsage(["context", "files", "show"]),
  });

  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(values.agent);
  const agentPaths = runtime.getAgentPaths(agent.id);
  const target = requireArg(
    positionals[0],
    renderCommandUsage(["context", "files", "show"]),
    "context file path",
  );
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
