import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createProvider, type OAuthCredential } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { tempDir, until } from "../../lib/testing/index.ts";
import { type Dialogue, type Notice, type Question, signInsOver } from "./sign-in.ts";

/**
 * A provider that is made up, so that no sign-in reaches a real one. Its sign-in
 * opens a link and takes a code, from the person who pastes it or from the
 * browser coming back by itself, whichever is first, as the flows that listen on
 * a local port do. It asks for the folder's device ID twice, and keeps it. Its
 * credential has no refresh token, as OpenRouter's has none.
 */
function madeUp() {
  let comeBack = (_code: string): void => undefined;
  const browser = new Promise<string>((resolve) => {
    comeBack = resolve;
  });
  const provider = createProvider({
    id: "made-up",
    name: "Made Up",
    auth: {
      oauth: {
        name: "Made Up (subscription)",
        isSubscription: true,
        async login(interaction, options) {
          interaction.notify({ type: "auth_url", url: "https://made-up.invalid/authorize", instructions: "Sign in there." });
          const settled = new AbortController();
          const pasted = interaction
            .prompt({ type: "manual_code", message: "Paste the code:", signal: settled.signal })
            .catch(() => undefined);
          const code = await Promise.race([browser, pasted]);
          settled.abort();
          if (code === undefined) throw new Error("No code came.");
          const device = options?.getDeviceId?.();
          if (device === undefined || device !== options?.getDeviceId?.()) throw new Error("The device ID changed.");
          return { type: "oauth", access: `access-for-${code}`, refresh: "", expires: Number.MAX_SAFE_INTEGER, device };
        },
        refresh: (credential) => Promise.resolve(credential),
        toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
      },
    },
    models: [],
    api: openAICompletionsApi(),
  });
  return { provider, comeBack };
}

/** The person at the other end of a sign-in: what it asks and tells them, and the answers a test gives. */
function person() {
  const questions: { question: Question; signal: AbortSignal; answer: (text: string) => void }[] = [];
  const notices: Notice[] = [];
  const dialogue: Dialogue = {
    ask(question, signal) {
      return new Promise((resolve, reject) => {
        questions.push({ question, signal, answer: resolve });
        signal.addEventListener("abort", () => reject(new Error("The question was let go of.")), { once: true });
      });
    },
    tell: (notice) => void notices.push(notice),
  };
  return { dialogue, questions, notices };
}

test("a sign-in takes the code that is pasted or the one the browser brings, lets go of the question that lost, and keeps one device ID; stopped, it leaves the folder as it was", async (t) => {
  const providers = join(tempDir(t, "sign-in"), "providers");
  const stored = (): Record<string, OAuthCredential> =>
    JSON.parse(readFileSync(join(providers, "auth.json"), "utf8")) as Record<string, OAuthCredential>;
  const running = new AbortController().signal;

  // The person pastes the code.
  const pasting = madeUp();
  const first = person();
  const signIns = signInsOver([pasting.provider], providers);
  assert.deepEqual(await signIns.providers(), [
    {
      id: "made-up",
      name: "Made Up",
      subscription: "Made Up (subscription)",
      ways: [{ way: "account", label: "Made Up (subscription)" }],
      saved: undefined,
    },
  ]);
  const signingIn = signIns.signIn("made-up", "account", first.dialogue, running);
  await until(() => first.questions.length === 1, "the question for the code");
  assert.deepEqual(first.notices, [
    { kind: "link", url: "https://made-up.invalid/authorize", instructions: "Sign in there." },
  ]);
  first.questions[0]?.answer("pasted");
  await signingIn;
  assert.equal(stored()["made-up"]?.access, "access-for-pasted");
  assert.equal((await signIns.providers())[0]?.saved, "account");
  const device = readFileSync(join(providers, "device-id"), "utf8").trim();
  assert.equal(stored()["made-up"]?.device, device);

  // The browser comes back before anything is pasted: the question that was waiting is let go of, and the sign-in finishes.
  const coming = madeUp();
  const second = person();
  const signingInAgain = signInsOver([coming.provider], providers).signIn("made-up", "account", second.dialogue, running);
  await until(() => second.questions.length === 1, "the question for the code");
  coming.comeBack("from-the-browser");
  await signingInAgain;
  assert.equal(second.questions[0]?.signal.aborted, true);
  assert.equal(stored()["made-up"]?.access, "access-for-from-the-browser");
  assert.equal(stored()["made-up"]?.device, device, "and the folder has the one device ID it had");

  // Stopped while the question waits, in a folder that has nothing yet: the sign-in ends and nothing is made.
  const stopping = madeUp();
  const third = person();
  const empty = join(tempDir(t, "stopped"), "providers");
  const stop = new AbortController();
  const stopped = signInsOver([stopping.provider], empty).signIn("made-up", "account", third.dialogue, stop.signal);
  await until(() => third.questions.length === 1, "the question for the code");
  stop.abort();
  await assert.rejects(stopped);
  assert.equal(existsSync(empty), false);
});
