import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createAppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
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
import {
  parseCommandArgs,
  type CommandHandler,
} from "./framework.js";
import {
  renderCommandUsage,
  renderGroupUsage,
} from "./catalog.js";

const USAGE = renderGroupUsage("context");

export const cmdContext: CommandHandler = async (argv, config) => {
  // files subcommand splits off early — no session bootstrap needed
  if (argv[0] === "files") {
    return cmdContextFiles(argv.slice(1), config);
  }
  if (argv[0] === "sources") {
    return cmdContextSources(argv.slice(1), config);
  }
  if (argv[0] === "turn") {
    return cmdContextTurn(argv.slice(1), config);
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
    if (preview.turnContextText) console.log(`\n${preview.turnContextText}`);
    if (!values.turn) return 0;
    console.log("\n=== System Prompt ===\n");
  }

  console.log(preview.assembly.systemPrompt);

  if (prompt && preview.turnContextText && !values.turn) {
    console.log(
      `\n=== Turn Context ===\n\n${preview.turnContextText}`,
    );
  }

  if (preview.userMessage) {
    console.log(
      `\n=== User Message ===\n\n${preview.userMessage}`,
    );
  }

  return 0;
};

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

async function cmdContextSources(argv: string[], config: ShrimpyConfig): Promise<number> {
  const sub = argv[0];
  if (sub !== "list" && sub !== "run") {
    console.error([
      renderCommandUsage(["context", "sources", "list"]),
      renderCommandUsage(["context", "sources", "run"]),
    ].join("\n"));
    return 2;
  }

  const { values, positionals } = parseCommandArgs({
    args: argv.slice(1),
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
  const sources = collectContextSources({
    runtime,
    agentId: values.agent,
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
    console.error(renderCommandUsage(["context", "sources", "run"]));
    return 2;
  }
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

async function cmdContextFiles(argv: string[], config: ShrimpyConfig): Promise<number> {
  const sub = argv[0];
  if (sub !== "list" && sub !== "show") {
    console.error([
      renderCommandUsage(["context", "files", "list"]),
      renderCommandUsage(["context", "files", "show"]),
    ].join("\n"));
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

  const runtime = createAppRuntime(config);
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
    console.error(renderCommandUsage(["context", "files", "show"]));
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
