import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRemoteServiceEndpoint, RemoteServiceProvider } from "@earendil-works/chord";
import { type RoutedServerServiceHost, Server, type ServerHost, SessionNotFoundError } from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { Sessions, THREAD_ID, Thread } from "./contract.ts";
import { type Endpoint, endpointFile } from "./endpoint.ts";
import { ctx, openHost } from "./host.ts";
import { createWsListener } from "./ws-listener.ts";

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const PAGE: Record<string, { file: string; type: string }> = {
	"/": { file: join(web, "index.html"), type: "text/html; charset=utf-8" },
	"/page.js": { file: join(web, "dist", "page.js"), type: "text/javascript; charset=utf-8" },
};

export async function serve(options: { home: string; port?: number }): Promise<number> {
	const runtime = join(options.home, "runtime");
	mkdirSync(runtime, { recursive: true });
	const previous = existsSync(endpointFile(options.home)) ? (JSON.parse(readFileSync(endpointFile(options.home), "utf8")) as Endpoint) : undefined;
	const serverId = previous?.serverId ?? randomUUID();

	const host = await openHost(options.home);
	const view = await host.conversation.viewState(ctx);

	// One provider for the session scope, shared by every attachment; each attachment gets its own endpoint over it.
	const threadProvider = new RemoteServiceProvider([{ service: Thread, mode: "singleton" }]);
	threadProvider.provide(Thread, {
		state: view,
		async send(text, whenBusy, requestId, context) {
			const submission = await host.conversation.submit({ type: "input", content: text, whenBusy, requestId: requestId ?? undefined }, context);
			return { submission: submission.id };
		},
		abort: (context) => host.conversation.abort(context),
	});

	const serverServices: RoutedServerServiceHost = {
		attachClient(presentation) {
			const provider = new RemoteServiceProvider([{ service: Sessions, mode: "singleton" }]);
			provider.provide(Sessions, {
				attach: (sessionId, context) => presentation.attachSession(sessionId, context),
				detach: (context) => presentation.detachSession(context),
			});
			const endpoint = createRemoteServiceEndpoint(provider);
			return {
				invokeService: (call, publish, context) => endpoint.invoke(call, publish, context),
				release() {
					endpoint.dispose();
					provider.dispose();
				},
			};
		},
	};
	const serverHost: ServerHost = {
		serverServices,
		async resolveSession(sessionId) {
			if (sessionId !== THREAD_ID) throw new SessionNotFoundError(`Unknown session: ${sessionId}`);
			return { id: sessionId };
		},
		async openSession() {
			return {
				attachClient() {
					const endpoint = createRemoteServiceEndpoint(threadProvider);
					return { invokeService: (call, publish, context) => endpoint.invoke(call, publish, context), release: () => endpoint.dispose() };
				},
				async close() {},
			};
		},
	};

	const respond = (request: IncomingMessage, response: ServerResponse): void => {
		const path = new URL(request.url ?? "/", "http://localhost").pathname;
		if (path === "/config.json") {
			response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ serverId, sessionId: THREAD_ID }));
			return;
		}
		const page = PAGE[path];
		if (page === undefined || !existsSync(page.file)) {
			response.writeHead(404).end("not found");
			return;
		}
		response.writeHead(200, { "content-type": page.type, "cache-control": "no-store" }).end(readFileSync(page.file));
	};

	// Short socket path: bind relative to the runtime directory.
	process.chdir(runtime);
	const ws = createWsListener({ host: "127.0.0.1", port: options.port ?? 0, http: respond });
	const server = new Server(serverHost, {
		serverId,
		listeners: [createUnixListener({ path: "s.sock" }), ws],
		onError: (error) => console.error("[server]", error.message),
	});
	try {
		await server.start();
	} catch (error) {
		// Without this the Harness keeps the process alive and working after the listener failed to bind.
		view.dispose();
		await host.close();
		throw error;
	}
	const endpoint: Endpoint = { serverId, socket: "s.sock", dir: runtime, port: ws.port };
	writeFileSync(endpointFile(options.home), JSON.stringify(endpoint));
	process.stdout.write(`${JSON.stringify({ event: "listening", pid: process.pid, url: `http://127.0.0.1:${ws.port}/`, ...endpoint })}\n`);

	await new Promise<void>((resolve) => {
		process.once("SIGINT", resolve);
		process.once("SIGTERM", resolve);
	});
	await server.close();
	view.dispose();
	await host.close();
	process.stdout.write(`${JSON.stringify({ event: "closed" })}\n`);
	return 0;
}
