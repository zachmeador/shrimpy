import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, createProvider, type Model, type Models } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { type Conversation, createRegistry, Harness, type ModelRef } from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { createScriptedFaux } from "./faux-script.ts";
import { takeOwnerLock } from "./owner-lock.ts";

export const ctx = BACKGROUND_CONTEXT;

export interface Host {
	readonly home: string;
	readonly harness: Harness;
	/** The one thread: the Harness's root conversation. */
	readonly conversation: Conversation;
	close(): Promise<void>;
}

/** Log the JSON body of every outgoing model request, so a test can see exactly what history the adapter sends. */
function logHttpBodies(file: string): void {
	const original = globalThis.fetch;
	globalThis.fetch = (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
		appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, url, body })}\n`);
		return original(input, init);
	};
}

/**
 * A local OpenAI-compatible server when SPIKE_LOCAL_URL is set (base URL including /v1; SPIKE_LOCAL_MODEL names the model);
 * otherwise pi-ai's scripted faux provider. The compat flags keep a Qwen-style server from receiving OpenAI-only fields.
 */
function createModelRuntime(home: string): { models: Models; model: ModelRef } {
	const models = createModels();
	const url = process.env.SPIKE_LOCAL_URL;
	if (process.env.SPIKE_LOG_HTTP !== undefined) logHttpBodies(process.env.SPIKE_LOG_HTTP);
	if (url !== undefined) {
		const id = process.env.SPIKE_LOCAL_MODEL ?? "local-model";
		const model: Model<"openai-completions"> = {
			id,
			name: id,
			api: "openai-completions",
			provider: "local",
			baseUrl: url,
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 262144,
			maxTokens: 65536,
			compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false },
		};
		models.setProvider(
			createProvider({
				id: "local",
				name: "Local",
				baseUrl: url,
				// The adapter refuses to send a request without a key; "local" is a placeholder, not a credential.
				auth: { apiKey: { name: "Local", resolve: async () => ({ auth: { apiKey: "local" } }) } },
				models: [model],
				api: openAICompletionsApi(),
			}),
		);
		return { models, model: { provider: "local", modelId: id } };
	}
	const faux = createScriptedFaux(home, process.env.SPIKE_SCENARIO ?? "chat", Number(process.env.SPIKE_TPS ?? 60));
	models.setProvider(faux.provider);
	const model = faux.getModel();
	return { models, model: { provider: model.provider, modelId: model.id } };
}

export interface OpenOptions {
	/** Start the scheduler so unfinished work continues. Read-only viewers pass false. */
	readonly resume?: boolean;
	readonly onReport?: (error: unknown) => void;
}

export async function openHost(home: string, options: OpenOptions = {}): Promise<Host> {
	// Before anything touches storage. SPIKE_NO_LOCK only exists so scripts/second-opener.ts can show what happens without it.
	const lock = process.env.SPIKE_NO_LOCK === undefined ? takeOwnerLock(home) : undefined;
	try {
		const work = join(home, "work");
		mkdirSync(join(home, "state"), { recursive: true });
		mkdirSync(work, { recursive: true });
		const { models, model } = createModelRuntime(home);
		const registry = createRegistry();
		registry.install(CodingTools);
		const harness = await Harness.open(
			await openNodeSqliteStorage(join(home, "state", "agent.sqlite")),
			{
				models,
				registry,
				env: () => new NodeExecutionEnv({ cwd: work }),
				onReport: options.onReport ?? ((error) => console.error("[harness report]", error)),
			},
			ctx,
		);
		const conversation = await harness.root(ctx, {
			agent: { model, cwd: work, instructions: "You are the Shrimpy spike agent. Use the bash tool when asked." },
		});
		if (options.resume ?? true) harness.resume();
		return {
			home,
			harness,
			conversation,
			async close() {
				await harness.close(ctx);
				lock?.release();
			},
		};
	} catch (error) {
		lock?.release();
		throw error;
	}
}
