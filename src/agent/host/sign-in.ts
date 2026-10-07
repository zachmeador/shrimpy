import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type AuthEvent, type AuthPrompt, createModels, ModelsError, type Provider } from "@earendil-works/pi-ai";
import { type ProviderPaths, providerPaths } from "../home/index.ts";
import { credentialStore, NO_AMBIENT_AUTH } from "./credentials.ts";

/** The two ways to sign in to a provider: with an account, or with an API key. */
export type SignInWay = "account" | "key";

/** One way to sign in to a provider, and what to call it. */
export interface WayToSignIn {
  readonly way: SignInWay;
  readonly label: string;
}

/** A provider the folder can be signed in to. */
export interface ProviderToSignIn {
  readonly id: string;
  /** What the provider is called, such as "Anthropic". */
  readonly name: string;
  /** What its subscription is called, when signing in to it with an account is one, such as "Anthropic (Claude Pro/Max)". */
  readonly subscription: string | undefined;
  /** The ways to sign in to it, the account first. */
  readonly ways: readonly WayToSignIn[];
  /** The way the folder is signed in to it already, if it is. */
  readonly saved: SignInWay | undefined;
}

/** What a sign-in asks the person. */
export type Question =
  | {
      readonly kind: "choose";
      readonly message: string;
      readonly options: readonly { readonly id: string; readonly label: string; readonly description?: string }[];
    }
  /** One line, which may be empty. */
  | { readonly kind: "line"; readonly message: string }
  /** One line that is not shown as it is typed. */
  | { readonly kind: "secret"; readonly message: string };

/** What a sign-in tells the person. */
export type Notice =
  /** A link to open in a browser, which may be on another machine. */
  | { readonly kind: "link"; readonly url: string; readonly instructions: string | undefined }
  /** A code to enter at a page. */
  | { readonly kind: "code"; readonly code: string; readonly url: string; readonly seconds: number | undefined }
  | {
      readonly kind: "info";
      readonly message: string;
      readonly links: readonly { readonly label?: string; readonly url: string }[];
    }
  | { readonly kind: "progress"; readonly message: string };

/** The person at the other end of a sign-in: what it asks them, and what it tells them. */
export interface Dialogue {
  /**
   * Put the question to the person and wait for the answer. Rejects when
   * `signal` aborts, having stopped waiting: a sign-in aborts a question when
   * something else settled it, such as the browser coming back by itself.
   */
  ask(question: Question, signal: AbortSignal): Promise<string>;
  tell(notice: Notice): void;
}

/** Signing the folder in to providers. It asks the person through a dialogue, and never opens a browser. */
export interface SignIns {
  /** The providers, in Pi's order. */
  providers(): Promise<ProviderToSignIn[]>;
  /** The IDs of the models a provider has. */
  modelIds(provider: string): string[];
  /**
   * Sign the folder in to a provider this way, and save it where every agent
   * started in the folder looks. Nothing is saved when it fails, or `signal`
   * aborts, and the folder is left as it was.
   */
  signIn(provider: string, way: SignInWay, dialogue: Dialogue, signal: AbortSignal): Promise<void>;
}

/** Sign in to Pi's own providers, keeping what is signed in to in the `providers/` directory at `providers`. */
export async function openSignIns(providers: string): Promise<SignIns> {
  // Loaded here because it brings in every provider's model list.
  const { builtinProviders } = await import("@earendil-works/pi-ai/providers/all");
  return signInsOver(builtinProviders(), providers);
}

/** `openSignIns` with the providers to offer given, which a test makes up. */
export function signInsOver(offered: readonly Provider[], providers: string): SignIns {
  const paths = providerPaths(providers);
  const credentials = credentialStore(paths.auth);
  const models = createModels({ credentials, authContext: NO_AMBIENT_AUTH });
  for (const provider of offered) models.setProvider(provider);
  const deviceId = deviceIdIn(paths);
  return {
    async providers() {
      const saved = new Map<string, SignInWay>();
      for (const { providerId, type } of await credentials.list()) saved.set(providerId, type === "oauth" ? "account" : "key");
      return offered.map((provider) => describe(provider, saved.get(provider.id)));
    },
    modelIds: (provider) => models.getModels(provider).map(({ id }) => id),
    async signIn(provider, way, dialogue, signal) {
      try {
        await models.login(
          provider,
          way === "account" ? "oauth" : "api_key",
          {
            signal,
            prompt: (prompt) =>
              dialogue.ask(questionOf(prompt), prompt.signal === undefined ? signal : AbortSignal.any([signal, prompt.signal])),
            notify: (event) => dialogue.tell(noticeOf(event)),
          },
          { getDeviceId: deviceId },
        );
      } catch (error) {
        throw explained(error);
      }
    },
  };
}

function describe(provider: Provider, saved: SignInWay | undefined): ProviderToSignIn {
  const { oauth, apiKey } = provider.auth;
  const ways: WayToSignIn[] = [];
  if (oauth !== undefined) ways.push({ way: "account", label: oauth.loginLabel ?? oauth.name });
  if (apiKey?.login !== undefined) ways.push({ way: "key", label: apiKey.name });
  const subscription = oauth?.isSubscription === true ? oauth.name : undefined;
  return { id: provider.id, name: provider.name, subscription, ways, saved };
}

function questionOf(prompt: AuthPrompt): Question {
  switch (prompt.type) {
    case "select":
      return {
        kind: "choose",
        message: prompt.message,
        options: prompt.options.map(({ id, label, description }) => ({
          id,
          label,
          ...(description === undefined ? {} : { description }),
        })),
      };
    case "secret":
      return { kind: "secret", message: prompt.message };
    case "text":
    case "manual_code":
      return { kind: "line", message: prompt.message };
  }
}

function noticeOf(event: AuthEvent): Notice {
  switch (event.type) {
    case "auth_url":
      return { kind: "link", url: event.url, instructions: event.instructions };
    case "device_code":
      return { kind: "code", code: event.userCode, url: event.verificationUri, seconds: event.expiresInSeconds };
    case "info":
      return { kind: "info", message: event.message, links: event.links ?? [] };
    case "progress":
      return { kind: "progress", message: event.message };
  }
}

/** What a person is told when a sign-in fails: when saving it was refused, why. */
function explained(error: unknown): unknown {
  if (error instanceof ModelsError && error.code === "auth" && error.cause instanceof Error) {
    return new Error(`The sign-in could not be saved. ${error.cause.message}`, { cause: error });
  }
  return error;
}

/**
 * The folder's device ID, which a provider is told when it signs in: made the
 * first time a sign-in asks for it, and the same ever after.
 */
function deviceIdIn(paths: ProviderPaths): () => string {
  let known: string | undefined;
  return () => {
    known ??= readDeviceId(paths.deviceId) ?? makeDeviceId(paths.deviceId);
    return known;
  };
}

function readDeviceId(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8").trim() || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function makeDeviceId(file: string): string {
  const id = randomUUID();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(file, `${id}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // Another sign-in made one first, and that one is the folder's. An empty file is one nobody finished.
    const existing = readDeviceId(file);
    if (existing !== undefined) return existing;
    writeFileSync(file, `${id}\n`, { mode: 0o600 });
  }
  return id;
}
