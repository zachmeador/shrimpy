import { createRemoteServiceBinding } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { type ByteTransportFactory, Client, createClientServiceTransport } from "@earendil-works/pi-client";
import { Sessions, Thread, type ThreadSource } from "./contract.ts";

/** A byte transport over the platform WebSocket: a browser, or Node 22+. Chunks go out and come in as binary frames. */
export function webSocketTransport(url: string): ByteTransportFactory {
	return (handlers) =>
		new Promise((resolve, reject) => {
			const socket = new WebSocket(url);
			socket.binaryType = "arraybuffer";
			socket.onopen = () => resolve({ send: async (chunk) => socket.send(chunk), close: () => socket.close() });
			socket.onmessage = (event) => handlers.onData(new Uint8Array(event.data as ArrayBuffer));
			socket.onclose = () => handlers.onClose();
			socket.onerror = () => {
				const error = new Error(`WebSocket error (${url})`);
				reject(error);
				handlers.onError(error);
			};
		});
}

export interface RemoteThread extends ThreadSource {
	readonly client: Client;
	onDisconnect(listener: (reason: Error | undefined) => void): void;
}

/** Connect, attach to one session, and bind its Thread service. Only the public pi-client and Chord APIs are used. */
export async function connectThread(options: { serverId: string; sessionId: string; transportFactory: ByteTransportFactory }): Promise<RemoteThread> {
	const { serverId, sessionId } = options;
	const client = await Client.connect({ serverId, transportFactory: options.transportFactory, onListenerError: (error) => console.error("client listener error", error) });
	const sessions = createRemoteServiceBinding({ services: [Sessions], transport: createClientServiceTransport(client, () => ({ serverId })), bound: true });
	const management = sessions.use(Sessions);
	await sessions.ready(ctx);
	await management.attach(sessionId, ctx);
	// The server publishes the live route out of band, so wait for it before addressing the session.
	if (client.attachment === undefined) {
		await new Promise<void>((resolve) => {
			const off = client.onAttachmentChange((attachment) => {
				if (attachment === undefined) return;
				off();
				resolve();
			});
		});
	}
	const session = createRemoteServiceBinding({ services: [Thread], transport: createClientServiceTransport(client, () => client.attachment), bound: true });
	// ready() waits only for services already acquired with use(), so acquire first.
	const thread = session.use(Thread);
	await session.ready(ctx);
	const disconnects: ((reason: Error | undefined) => void)[] = [];
	client.onConnectionStateChange(({ state, error }) => {
		if (state === "disconnected") for (const listener of disconnects) listener(error);
	});
	return {
		client,
		get view() {
			return thread.state.value!;
		},
		subscribe(listener) {
			if (thread.state.value !== undefined) listener(thread.state.value);
			return thread.state.subscribe((value) => listener(value));
		},
		send: (text, whenBusy, requestId) => thread.send(text, whenBusy, requestId ?? null, ctx),
		abort: () => thread.abort(ctx),
		onDisconnect: (listener) => void disconnects.push(listener),
		async close() {
			await session.dispose(ctx).catch(() => {});
			await sessions.dispose(ctx).catch(() => {});
			await client.dispose();
		},
	};
}
