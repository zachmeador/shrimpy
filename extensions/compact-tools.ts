import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";

type AnyTool = ToolDefinition<any, any, any>;

interface CompactToolRenderContext {
  isPartial?: boolean;
  executionStarted?: boolean;
  isError?: boolean;
  expanded?: boolean;
}

const COLLAPSED_LIMIT = 96;

function clip(value: unknown, limit = COLLAPSED_LIMIT): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function status(context: CompactToolRenderContext): "running" | "ok" | "error" {
  if (context.isPartial || !context.executionStarted) return "running";
  return context.isError ? "error" : "ok";
}

function compactLine(
  toolName: string,
  summary: string,
  theme: any,
  context: CompactToolRenderContext,
): Text {
  const state = status(context);
  const color =
    state === "running" ? "warning" : state === "error" ? "error" : "success";
  const prefix = theme.fg(color, state === "running" ? "..." : state === "error" ? "x" : "ok");
  const title = theme.fg("toolTitle", theme.bold(toolName));
  const suffix = context.expanded ? "" : theme.fg("muted", "  (ctrl+o)");
  return new Text(`${prefix} ${title} ${theme.fg("accent", summary)}${suffix}`, 0, 0);
}

function empty(): Container {
  return new Container();
}

function compactBuiltInTool(
  createTool: (cwd: string) => AnyTool,
  summarize: (args: any) => string,
): AnyTool {
  const original = createTool(process.cwd());
  return {
    ...original,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createTool(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderCall(args, theme, context) {
      return compactLine(original.name, summarize(args), theme, context);
    },
    renderResult(result, options, theme, context) {
      if (!options.expanded) return empty();
      return original.renderResult?.(result, options, theme, context) ?? empty();
    },
  };
}

export default function (pi: ExtensionAPI) {
  const tools = [
    compactBuiltInTool(createReadTool, (args) => clip(args.path)),
    compactBuiltInTool(createWriteTool, (args) => {
      const lines = String(args.content ?? "").split("\n").length;
      return `${clip(args.path)} (${lines} lines)`;
    }),
    compactBuiltInTool(createEditTool, (args) => clip(args.path)),
    compactBuiltInTool(createBashTool, (args) => clip(args.command)),
    compactBuiltInTool(createGrepTool, (args) =>
      `${clip(args.pattern)} in ${clip(args.path ?? ".")}`
    ),
    compactBuiltInTool(createFindTool, (args) =>
      `${clip(args.pattern ?? args.name ?? "*")} in ${clip(args.path ?? ".")}`
    ),
    compactBuiltInTool(createLsTool, (args) => clip(args.path ?? ".")),
  ];

  for (const tool of tools) {
    pi.registerTool(tool);
  }
}
