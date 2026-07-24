import type {
  Api,
  AssistantMessage,
  Context,
  Message,
  Model,
} from "@earendil-works/pi-ai";
import {
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import {
  convertToLlm,
  type AgentSession,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionBootstrap } from "./bootstrap.js";
import {
  disposeSession,
  openSessionForContextInspection,
} from "./open.js";
import type { SessionOpenPlan } from "./spec.js";
import type { SessionDescriptor } from "./spec.js";
import { normalizeTurnContextMessages } from "./turn-context.js";
import {
  findActiveSessionFile,
  openSessionManager,
} from "./transcript-store.js";
import { runSessionTurn } from "./turn-output.js";

export interface ContextToolSchema {
  name: string;
  description: string;
  parameters: unknown;
}

export interface SessionContextView {
  systemPrompt: string;
  messages: Message[];
  tools: ContextToolSchema[];
}

export interface InspectedSessionContext {
  context: SessionContextView;
  activeToolNames: string[];
  historyMessageCount: number;
}

let inspectionSequence = 0;

export async function inspectSessionContext(input: {
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  prompt?: string;
  turnContextText?: string;
  channelDelivery?: boolean;
  sessionManager?: SessionManager;
}): Promise<InspectedSessionContext> {
  const captureModel = createCaptureModel();
  let captured: SessionContextView | undefined;
  input.bootstrap.authStorage.setRuntimeApiKey(
    captureModel.provider,
    "shrimpy-context-inspection",
  );
  input.bootstrap.modelRegistry.registerProvider(captureModel.provider, {
    api: captureModel.api,
    baseUrl: captureModel.baseUrl,
    apiKey: "shrimpy-context-inspection",
    streamSimple: (_model, context) => {
      captured = copyContext(context);
      return createDoneStream(captureModel);
    },
    models: [{
      id: captureModel.id,
      name: captureModel.name,
      api: captureModel.api,
      baseUrl: captureModel.baseUrl,
      reasoning: captureModel.reasoning,
      input: [...captureModel.input],
      cost: captureModel.cost,
      contextWindow: captureModel.contextWindow,
      maxTokens: captureModel.maxTokens,
    }],
  });

  let session: AgentSession | undefined;
  try {
    session = await openSessionForContextInspection(
      input.bootstrap,
      input.plan,
      captureModel,
      input.sessionManager,
    );
    const activeToolNames = session.getActiveToolNames();
    const historyMessageCount = convertToLlm(
      normalizeTurnContextMessages(session.messages),
    ).length;
    if (input.prompt !== undefined) {
      await runSessionTurn(session, input.prompt, {
        turnContextText: input.turnContextText,
        channelDelivery: input.channelDelivery,
      });
      if (!captured) {
        throw new Error("context inspection did not capture a model call");
      }
      return {
        context: captured,
        activeToolNames,
        historyMessageCount,
      };
    }

    return {
      context: {
        systemPrompt: session.systemPrompt,
        messages: convertToLlm(session.messages),
        tools: activeToolSchemas(session),
      },
      activeToolNames,
      historyMessageCount,
    };
  } finally {
    if (session) disposeSession(session);
    input.bootstrap.modelRegistry.unregisterProvider(captureModel.provider);
    input.bootstrap.authStorage.removeRuntimeApiKey(captureModel.provider);
  }
}

export function cloneSessionManagerForContextInspection(
  descriptor: SessionDescriptor,
  cwd: string,
): SessionManager | undefined {
  if (descriptor.storage.kind !== "durable") return undefined;
  const activePath = findActiveSessionFile(descriptor.storage.dir);
  if (!activePath) return undefined;
  const source = openSessionManager(cwd, descriptor.storage.dir);
  const context = source.buildSessionContext();
  const clone = SessionManager.inMemory(cwd);
  if (context.model) {
    clone.appendModelChange(context.model.provider, context.model.modelId);
  }
  if (context.thinkingLevel) {
    clone.appendThinkingLevelChange(context.thinkingLevel);
  }
  for (const message of context.messages) {
    clone.appendMessage(message as Exclude<
      AgentMessage,
      { role: "compactionSummary" | "branchSummary" }
    >);
  }
  return clone;
}

function createCaptureModel(): Model<Api> {
  inspectionSequence += 1;
  const provider = `shrimpy-context-inspection-${process.pid}-${inspectionSequence}`;
  return {
    id: "capture",
    name: "Shrimpy Context Inspection",
    api: "openai-completions",
    provider,
    baseUrl: "https://context-inspection.invalid",
    reasoning: false,
    input: ["text", "image"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 1_000_000,
    maxTokens: 1,
  };
}

function createDoneStream(model: Model<Api>) {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
  stream.end(message);
  return stream;
}

function copyContext(context: Context): SessionContextView {
  return {
    systemPrompt: context.systemPrompt ?? "",
    messages: structuredClone(context.messages),
    tools: context.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: structuredClone(tool.parameters),
    })) ?? [],
  };
}

function activeToolSchemas(session: AgentSession): ContextToolSchema[] {
  return session.getActiveToolNames().flatMap((name) => {
    const definition = session.getToolDefinition(name);
    return definition
      ? [{
        name: definition.name,
        description: definition.description,
        parameters: structuredClone(definition.parameters),
      }]
      : [];
  });
}
