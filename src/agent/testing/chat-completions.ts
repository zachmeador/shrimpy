import type { TestContext } from "node:test";

/** One request that reached the stubbed server. */
export interface ChatRequest {
  url: string;
  headers: Record<string, string>;
  body: { model: string; messages: { role: string; content: unknown }[]; [field: string]: unknown };
}

/**
 * Play an OpenAI-compatible server without a network: every chat-completions
 * request is recorded and answered with `answer`, streamed the way servers
 * stream. The real `fetch` comes back when the test ends.
 */
export function stubChatCompletions(t: TestContext, answer: string): ChatRequest[] {
  const requests: ChatRequest[] = [];
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    return request.text().then((text) => {
      requests.push({
        url: request.url,
        headers: Object.fromEntries(request.headers),
        body: JSON.parse(text) as ChatRequest["body"],
      });
      return stream(answer);
    });
  });
  return requests;
}

function stream(answer: string): Response {
  const chunk = (choices: object[], usage?: object): string => {
    const body = { id: "stub", object: "chat.completion.chunk", created: 1, model: "stub", choices, usage };
    return `data: ${JSON.stringify(body)}\n\n`;
  };
  const body =
    chunk([{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }]) +
    chunk([{ index: 0, delta: {}, finish_reason: "stop" }]) +
    chunk([], { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 }) +
    "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
