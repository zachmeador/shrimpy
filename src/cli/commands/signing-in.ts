import { dirname } from "node:path";
import {
  type Dialogue,
  type Notice,
  openSignIns,
  type ProviderToSignIn,
  providerPaths,
  readDefaultModel,
  saveDefaultModel,
  type SignIns,
  type SignInWay,
} from "../../agent/index.ts";
import type { Io } from "../io/index.ts";
import { UsageError } from "../usage/index.ts";

/** How many of a provider's model IDs are listed when a person is asked which to start with. */
const LISTED_MODELS = 12;

/** How wide a list of IDs is made. */
const WIDTH = 78;

/**
 * Sign the folder in to a provider, as a person at a terminal answers it: the
 * provider named, or chosen from a list, the way to sign in when there is more
 * than one, whatever the provider's own flow asks, and then the model agents
 * start with when theirs names none. `providers` is the folder's `providers/`.
 * The result is the exit code. Stopping it before the sign-in is saved changes
 * nothing.
 */
export async function signInAtTerminal(io: Io, providers: string, wanted: string | undefined): Promise<number> {
  const signIns = await openSignIns(providers);
  const all = await signIns.providers();
  const named = wanted === undefined ? undefined : findProvider(all, wanted);
  const stopped = new AbortController();
  const { signal } = stopped;
  let stopListening = (): void => undefined;
  // A second request ends the command at once, as it does for any command: it is no longer listened for.
  stopListening = io.onStop(() => {
    stopped.abort();
    stopListening();
  });
  const folder = dirname(providers);
  let signedIn = false;
  try {
    const provider = named ?? (await chooseProvider(io, all, folder, signal));
    if (named !== undefined) io.out(`Signing in to ${provider.name}, for every agent started in ${folder}.`);
    if (provider.saved !== undefined) {
      const how = provider.saved === "key" ? " with an API key" : "";
      io.out(`The folder is signed in to ${provider.name}${how} already. Signing in again replaces that.`);
    }
    const way = await chooseWay(io, provider, signal);
    await signIns.signIn(provider.id, way, terminalDialogue(io), signal);
    signedIn = true;
    io.out(
      `Signed in to ${provider.name}. Every agent started in ${folder} can use it, ` +
        "and agents that are already running need no restart.",
    );
    await chooseDefaultModel(io, signIns, provider, providerPaths(providers).defaultModel, signal);
    return 0;
  } catch (error) {
    if (signal.aborted) {
      io.err(signedIn ? "Stopped. The sign-in is saved, and no default model was set." : "Stopped. Nothing was signed in.");
    } else {
      io.err(error instanceof Error ? error.message : String(error));
      io.err(signedIn ? "The sign-in is saved." : "Nothing was signed in.");
    }
    return 1;
  } finally {
    stopListening();
  }
}

function findProvider(all: readonly ProviderToSignIn[], id: string): ProviderToSignIn {
  const found = all.find((provider) => provider.id === id);
  if (found !== undefined) return found;
  throw new UsageError(`No provider has the ID "${id}". Run shrimpy providers login with no ID to see them.`);
}

/** The list of subscriptions and the IDs of the other providers, and which one a person means. */
async function chooseProvider(
  io: Io,
  all: readonly ProviderToSignIn[],
  folder: string,
  signal: AbortSignal,
): Promise<ProviderToSignIn> {
  const subscriptions = all.filter((provider) => provider.subscription !== undefined);
  const others = all.filter((provider) => provider.subscription === undefined);
  io.out(`Sign in to a model provider for every agent started in ${folder}.`);
  io.out("");
  io.out("Subscriptions:");
  const names = subscriptions.map((provider) => provider.subscription ?? provider.name);
  const nameWidth = Math.max(...names.map((name) => name.length));
  const idWidth = Math.max(...subscriptions.map((provider) => provider.id.length));
  subscriptions.forEach((provider, index) => {
    const marker = provider.saved === undefined ? "" : provider.saved === "key" ? "  (API key saved)" : "  (signed in)";
    io.out(`  ${index + 1}. ${(names[index] ?? "").padEnd(nameWidth)}  ${provider.id.padEnd(idWidth)}${marker}`.trimEnd());
  });
  io.out("");
  io.out("Any other provider signs in by its ID, with an API key or an account:");
  for (const line of wrapped(others.map((provider) => provider.id))) io.out(`  ${line}`);
  io.out("");
  for (;;) {
    const answer = (await io.ask("Which one? Type a number or an ID: ", { signal })).trim();
    const chosen = /^\d+$/.test(answer)
      ? subscriptions[Number(answer) - 1]
      : all.find((provider) => provider.id === answer.toLowerCase());
    if (chosen !== undefined) return chosen;
    io.out(
      /^\d+$/.test(answer)
        ? `There is no number ${answer}. Type a number from 1 to ${subscriptions.length}, or an ID.`
        : `No provider has the ID "${answer}". Type a number from 1 to ${subscriptions.length}, or an ID from the list.`,
    );
  }
}

/** With a sign-in and an API key to choose between, which one, the sign-in first. With one way, that one, unasked. */
async function chooseWay(io: Io, provider: ProviderToSignIn, signal: AbortSignal): Promise<SignInWay> {
  const [only, ...more] = provider.ways;
  if (only === undefined) throw new Error(`${provider.name} can't be signed in to from here.`);
  if (more.length === 0) return only.way;
  const options = provider.ways.map(({ way, label }) => ({ id: way, label }));
  return (await choose(io, `${provider.name} signs in with an account or an API key. Which do you want?`, options, signal)) as SignInWay;
}

/** A numbered list, answered by number or by ID, asked again until it is answered with one of them. Returns the ID. */
async function choose(
  io: Io,
  message: string,
  options: readonly { id: string; label: string; description?: string }[],
  signal: AbortSignal,
): Promise<string> {
  io.out(message);
  options.forEach((option, index) => {
    io.out(`  ${index + 1}. ${option.label} [${option.id}]`);
    if (option.description !== undefined) io.out(`     ${option.description}`);
  });
  for (;;) {
    const answer = (await io.ask("Number or ID: ", { signal })).trim();
    const chosen = /^\d+$/.test(answer) ? options[Number(answer) - 1] : options.find((option) => option.id === answer);
    if (chosen !== undefined) return chosen.id;
    io.out(`That is not one of the choices. Type a number from 1 to ${options.length}, or an ID.`);
  }
}

/** What a provider's own sign-in says and asks, on the terminal. */
function terminalDialogue(io: Io): Dialogue {
  return {
    tell(notice) {
      for (const line of noticeLines(notice)) io.out(line);
    },
    ask(question, signal) {
      switch (question.kind) {
        case "secret":
          return io.ask(asking(question.message), { secret: true, signal });
        case "line":
          return io.ask(asking(question.message), { signal });
        case "choose":
          return choose(io, question.message, question.options, signal);
      }
    },
  };
}

/** A message as a question: it ends in one colon and a space, whether it came with a colon or not. */
function asking(message: string): string {
  const text = message.trim();
  return `${/[:?]$/.test(text) ? text : `${text}:`} `;
}

function noticeLines(notice: Notice): string[] {
  switch (notice.kind) {
    case "link":
      return [
        "",
        "Open this link in a browser and sign in:",
        notice.url,
        ...(notice.instructions === undefined ? [] : ["", notice.instructions]),
        "",
      ];
    case "code": {
      const minutes = notice.seconds === undefined ? undefined : Math.max(1, Math.round(notice.seconds / 60));
      return [
        "",
        `Open ${notice.url} in a browser and enter this code: ${notice.code}`,
        ...(minutes === undefined ? [] : [`It works for ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`]),
        "Waiting for you to finish there.",
        "",
      ];
    }
    case "info":
      return [notice.message, ...notice.links.map((link) => `  ${link.label === undefined ? "" : `${link.label}: `}${link.url}`)];
    case "progress":
      return [notice.message];
  }
}

/** The model agents start with when theirs names none, unless the folder has one already: asked for from the provider's own. */
async function chooseDefaultModel(
  io: Io,
  signIns: SignIns,
  provider: ProviderToSignIn,
  file: string,
  signal: AbortSignal,
): Promise<void> {
  if (readDefaultModel(file) !== undefined) return;
  io.out("");
  const ids = signIns.modelIds(provider.id);
  const later = `Set one later by writing {"provider": "${provider.id}", "id": "<model ID>"} in ${file}.`;
  if (ids.length === 0) {
    io.out(`No default model is set, and ${provider.name} has no models to choose from yet. ${later}`);
    return;
  }
  const listed = ids.slice(0, LISTED_MODELS);
  const more = ids.length - listed.length;
  io.out(`Agents that name no model start with a default one. ${provider.name} has:`);
  for (const line of wrapped([...listed, ...(more > 0 ? [`and ${more} more`] : [])])) io.out(`  ${line}`);
  for (;;) {
    const answer = (await io.ask("Which model? Type its ID, or press Enter to choose later: ", { signal })).trim();
    if (answer === "") {
      io.out(`No default model is set, so an agent that names none won't start. ${later}`);
      return;
    }
    if (ids.includes(answer)) {
      saveDefaultModel(file, { provider: provider.id, id: answer });
      io.out(`Agents that name no model now start with ${provider.id}/${answer}. That is set in ${file}.`);
      return;
    }
    io.out(`Unknown model "${answer}": ${provider.name} has no model with that ID.`);
  }
}

/** Items in a list that runs over lines no wider than the terminal is likely to be, each line but the last ending in a comma. */
function wrapped(items: readonly string[]): string[] {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    if (line !== "" && line.length + item.length + 3 > WIDTH) {
      lines.push(`${line},`);
      line = item;
    } else {
      line = line === "" ? item : `${line}, ${item}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}
