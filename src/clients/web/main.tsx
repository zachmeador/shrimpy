/*
 * The page's entry. Opened with an invitation's link, it shows the door the
 * code, which lets the browser in as a device of yours. Then it keeps the page
 * linked to the gateway through the state both clients share, dialing again
 * after a loss with pauses that grow, and draws the page.
 */
import { render } from "preact";
import { PAGE_JOIN, type PageJoin, pageLinkUrl, readAnswer, readPageCode } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { createListeners } from "../../lib/listeners/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { dialPage } from "../network/index.ts";
import { createClientState } from "../state/index.ts";
import { browserLabel, unreadableJoin } from "../view/index.ts";
import { App, type Retry } from "./app.tsx";

/** Show the door an invitation's `code`: its refusal in its words, or undefined once the browser is let in. */
async function letIn(code: string): Promise<string | undefined> {
  const shown: PageJoin = { code, label: browserLabel(navigator.userAgent) };
  const response = await fetch(PAGE_JOIN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shown) });
  const answer = readAnswer(await response.json().catch(() => undefined));
  if (answer === undefined) return unreadableJoin(response.status);
  return answer.kind === "refused" ? answer.words : undefined;
}

/**
 * The pauses between tries to reach the gateway, from a second up to half a
 * minute, and when the next try is, for the page to say.
 */
function retrying(): Retry & { backoff: Backoff } {
  const pauses = backoff({ firstMs: 1000, maxMs: 30_000 });
  const listeners = createListeners<undefined>(() => undefined);
  let at: number | undefined;
  const set = (next: number | undefined): void => {
    at = next;
    listeners.notify(undefined);
  };
  return {
    backoff: {
      next() {
        const ms = pauses.next();
        set(Date.now() + ms);
        return ms;
      },
      reset() {
        pauses.reset();
        set(undefined);
      },
    },
    at: () => at,
    subscribe: (listener) => listeners.add(() => listener()),
  };
}

async function start(root: HTMLElement): Promise<void> {
  const code = readPageCode(location.hash);
  let refusal: string | undefined;
  if (code !== undefined) {
    // A code is good once, so the address keeps it no longer than this.
    history.replaceState(null, "", location.pathname + location.search);
    refusal = await letIn(code).catch((error: unknown) => asError(error).message);
  }
  const retry = retrying();
  const state = await createClientState({ dial: dialPage(pageLinkUrl(location)), token: null, backoff: retry.backoff });
  render(<App state={state} retry={retry} refusal={refusal} />, root);
}

const root = document.getElementById("shrimpy");
if (root !== null) {
  start(root).catch((error: unknown) => render(<p class="note">{asError(error).message}</p>, root));
}
