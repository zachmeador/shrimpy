import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** One chat-completions request that reached the server. */
export interface ModelRequest {
  headers: IncomingMessage["headers"];
  body: { model: string; messages: { role: string; content?: unknown }[] };
}

export interface ModelServer {
  /** The base URL, ending in /v1, as models.json wants it. */
  readonly url: string;
  readonly requests: ModelRequest[];
  close(): Promise<void>;
}

/**
 * A model on a local port that speaks OpenAI's chat-completions protocol, for
 * tests that run the whole CLI. What it does depends on the latest user message:
 *
 * - "run": call the bash tool to echo `shrimpy-ok`, then report what it printed
 * - "slow": stream words for several seconds, until the client hangs up
 * - "refuse": answer with an HTTP 400 error
 * - anything else: say hello
 */
export async function startModelServer(): Promise<ModelServer> {
  const requests: ModelRequest[] = [];
  const server = createServer((request, response) => {
    let text = "";
    request.on("data", (chunk: Buffer) => void (text += chunk.toString()));
    request.on("end", () => {
      const body = JSON.parse(text) as ModelRequest["body"];
      requests.push({ headers: request.headers, body });
      respond(body, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    close: () => closeServer(server),
  };
}

function respond(body: ModelRequest["body"], response: ServerResponse): void {
  const messages = body.messages;
  const last = messages.at(-1);
  const user = [...messages].reverse().find((message) => message.role === "user");
  const asked = typeof user?.content === "string" ? user.content : "";

  if (asked.includes("refuse")) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "The test model refuses this request.", type: "invalid_request_error" } }));
    return;
  }
  response.writeHead(200, { "content-type": "text/event-stream" });
  if (asked.includes("slow")) streamWords(response);
  else if (asked.includes("run") && last?.role === "tool") {
    say(response, `The command printed: ${String(last.content).trim()}`);
  } else if (asked.includes("run")) callTool(response);
  else say(response, "Hello from the test model.");
}

function chunk(response: ServerResponse, choices: object[], usage?: object): void {
  response.write(`data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test", choices, usage })}\n\n`);
}

function finish(response: ServerResponse, reason: string): void {
  chunk(response, [{ index: 0, delta: {}, finish_reason: reason }]);
  chunk(response, [], { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 });
  response.end("data: [DONE]\n\n");
}

function say(response: ServerResponse, text: string): void {
  chunk(response, [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }]);
  finish(response, "stop");
}

function callTool(response: ServerResponse): void {
  const call = { index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: JSON.stringify({ command: "echo shrimpy-ok" }) } };
  chunk(response, [{ index: 0, delta: { role: "assistant", tool_calls: [call] }, finish_reason: null }]);
  finish(response, "tool_calls");
}

function streamWords(response: ServerResponse): void {
  let sent = 0;
  const timer = setInterval(() => {
    if (sent === 200) {
      clearInterval(timer);
      return finish(response, "stop");
    }
    sent += 1;
    chunk(response, [{ index: 0, delta: { role: "assistant", content: `word${sent} ` }, finish_reason: null }]);
  }, 50);
  response.on("close", () => clearInterval(timer));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
    server.closeAllConnections();
  });
}
