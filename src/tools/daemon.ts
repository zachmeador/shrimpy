import { join } from "node:path";
import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import type { ChannelBus } from "../channels/bus.js";
import {
  createStoredSessionDescriptor,
  openSession,
  runSessionTurn,
  type SessionBootstrap,
} from "../sessions/index.js";
import {
  type ResolvedToolRuntimeConfig,
  resolveToolRuntimeConfig,
} from "../config/index.js";
import {
  getToolProse,
  renderReadChannelResult,
  renderRunChildResult,
  renderSendMessageResult,
  TOOL_PARAMETER_PROSE,
} from "../context/index.js";
import {
  DAEMON_TOOL_NAMES,
  type DaemonToolName,
} from "./names.js";
import type { SessionToolPolicy } from "./policy.js";

const SendMessageParams = Type.Object({
  channel: Type.String({
    description: TOOL_PARAMETER_PROSE.sendMessageChannel,
  }),
  text: Type.String({ description: TOOL_PARAMETER_PROSE.sendMessageText }),
});

const ReadChannelParams = Type.Object({
  channel: Type.String({
    description: TOOL_PARAMETER_PROSE.readChannelChannel,
  }),
  limit: Type.Optional(
    Type.Number({ description: TOOL_PARAMETER_PROSE.readChannelLimit }),
  ),
});

const RunChildParams = Type.Object({
  prompt: Type.String({
    description: TOOL_PARAMETER_PROSE.runChildPrompt,
  }),
});

const COLLAPSED_LIMIT = 96;

interface ToolRenderTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

interface ToolRenderContext {
  isPartial?: boolean;
  executionStarted?: boolean;
  isError?: boolean;
  expanded?: boolean;
}

interface ToolResultContent {
  type?: string;
  text?: string;
}

interface ToolResultLike {
  content?: ToolResultContent[];
}

function clip(value: unknown, limit = COLLAPSED_LIMIT): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function emptyToolRender(): Container {
  return new Container();
}

function compactToolCall(
  name: string,
  summary: string,
  theme: ToolRenderTheme,
  context: ToolRenderContext,
): Text {
  const running = context.isPartial || !context.executionStarted;
  const failed = context.isError;
  const color = running ? "warning" : failed ? "error" : "success";
  const marker = running ? "..." : failed ? "x" : "ok";
  const suffix = context.expanded ? "" : theme.fg("muted", "  (ctrl+o)");
  return new Text(
    `${theme.fg(color, marker)} ${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("accent", summary)}${suffix}`,
    0,
    0,
  );
}

function renderExpandedResult(result: ToolResultLike, theme: ToolRenderTheme): Text {
  const content = result.content?.find?.((entry) => entry.type === "text");
  return new Text(theme.fg("toolOutput", content?.text ?? ""), 0, 0);
}

export interface DaemonToolDeps {
  channelBus: ChannelBus;
  bootstrap: SessionBootstrap;
  toolConfig?: ResolvedToolRuntimeConfig;
  agentId?: string;
  sendMessageActorId?: string;
  sessionFactory?: typeof openSession;
  toolNames?: DaemonToolName[];
  toolPolicy?: SessionToolPolicy;
}

export function createDaemonTools(deps: DaemonToolDeps): ToolDefinition[] {
  const {
    channelBus,
    bootstrap,
    toolConfig: rawToolConfig,
    agentId: _agentId,
    sendMessageActorId,
    sessionFactory = openSession,
    toolNames,
    toolPolicy,
  } = deps;
  const toolConfig = rawToolConfig ?? resolveToolRuntimeConfig();
  const resolvedSendMessageActorId =
    sendMessageActorId ?? toolConfig.sendMessage.defaultActorId;
  const sendMessageProse = getToolProse("send_message");
  const readChannelProse = getToolProse("read_channel");
  const runChildProse = getToolProse("run_child");

  const sendMessageTool: ToolDefinition<typeof SendMessageParams> = {
    name: "send_message",
    label: "Send Message",
    description: sendMessageProse.description,
    ["promptSnippet"]: sendMessageProse.promptSnippet,
    parameters: SendMessageParams,
    renderShell: "self",
    renderCall(params, theme, context) {
      return compactToolCall(
        "send_message",
        `${params.channel}: ${clip(params.text)}`,
        theme,
        context,
      );
    },
    renderResult(result, options, theme) {
      return options.expanded ? renderExpandedResult(result, theme) : emptyToolRender();
    },
    async execute(_toolCallId, params) {
      const delivered = await channelBus.sendAgentText({
        channel: params.channel,
        text: params.text,
        actorId: resolvedSendMessageActorId,
      });

      return {
        content: [{
          type: "text" as const,
          text: renderSendMessageResult({
            channel: params.channel,
            delivered,
          }),
        }],
        details: undefined,
      };
    },
  };

  const readChannelTool: ToolDefinition<typeof ReadChannelParams> = {
    name: "read_channel",
    label: "Read Channel",
    description: readChannelProse.description,
    ["promptSnippet"]: readChannelProse.promptSnippet,
    parameters: ReadChannelParams,
    renderShell: "self",
    renderCall(params, theme, context) {
      return compactToolCall(
        "read_channel",
        `${params.channel}${params.limit ? ` (${params.limit})` : ""}`,
        theme,
        context,
      );
    },
    renderResult(result, options, theme) {
      return options.expanded ? renderExpandedResult(result, theme) : emptyToolRender();
    },
    async execute(_toolCallId, params) {
      const { messages } = channelBus.read(params.channel);
      const limit = params.limit ?? toolConfig.readChannel.defaultLimit;
      const recent = messages.slice(-limit);
      return {
        content: [
          { type: "text" as const, text: renderReadChannelResult({ messages: recent }) },
        ],
        details: undefined,
      };
    },
  };

  const runChildTool: ToolDefinition<typeof RunChildParams> = {
    name: "run_child",
    label: "Run Child",
    description: runChildProse.description,
    ["promptSnippet"]: runChildProse.promptSnippet,
    parameters: RunChildParams,
    renderShell: "self",
    renderCall(params, theme, context) {
      return compactToolCall("run_child", clip(params.prompt), theme, context);
    },
    renderResult(result, options, theme) {
      return options.expanded ? renderExpandedResult(result, theme) : emptyToolRender();
    },
    async execute(_toolCallId, params, signal) {
      const session = await sessionFactory(
        bootstrap,
        {
          descriptor: createStoredSessionDescriptor({
            workspacePath: bootstrap.agentRootPath,
            agentId: bootstrap.agentId,
            sessionName: resolveChildRunSessionName(),
            kind: "run",
            channel: "run",
          }),
          toolPolicy,
        },
      );

      try {
        const result = await runSessionTurn(session, params.prompt, {
          signal,
          abortMessage: "run_child aborted",
        });
        return {
          content: [
            {
              type: "text" as const,
              text: renderRunChildResult({ assistantText: result.assistantText }),
            },
          ],
          details: undefined,
        };
      } finally {
        try {
          session.dispose();
        } catch (err) {
          console.error("[run_child] child session dispose error:", err);
        }
      }
    },
  };

  const allTools = [sendMessageTool, readChannelTool, runChildTool] as unknown as ToolDefinition[];
  const allowedNames = toolNames?.length ? Array.from(new Set(toolNames)) : undefined;

  if (!allowedNames) return allTools;

  const byName = new Map(allTools.map((tool) => [tool.name, tool]));
  for (const name of allowedNames) {
    if (!byName.has(name)) {
      throw new Error(
        `unknown daemon tool "${name}". Known tools: ${DAEMON_TOOL_NAMES.join(", ")}`,
      );
    }
  }

  return allowedNames.map((name) => byName.get(name)!);
}

function resolveChildRunSessionName(): string {
  return join(
    "children",
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
}
