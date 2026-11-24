import { join } from "node:path";
import type { Address } from "../../contracts/gateway/index.ts";
import { formatAddress } from "../../lib/link/index.ts";
import type { Io } from "../io/index.ts";
import { askLocalGateway } from "../talk/index.ts";
import { warnIfNewerThanGateway } from "../versions/index.ts";
import { launch, type Started } from "./launch.ts";
import type { Plan } from "./plan.ts";
import type { StopWatch } from "./stop.ts";

/** Start the gateway and the chat server, whichever is not already running, in that order. */
export async function startGatewayAndChat(io: Io, here: NonNullable<Plan["here"]>, crew: Started[], stop: StopWatch): Promise<void> {
  const found = await askLocalGateway(stop.signal);
  if (found === undefined) {
    const data = join(here.data, "gateway");
    const listen = (here.listen ?? []).flatMap((address) => ["--listen", formatAddress(address)]);
    const program = await launch(io, { text: "gateway" }, "the gateway", ["gateway", "serve", "--data", data, ...listen]);
    crew.push({ role: "gateway", what: "the gateway", program });
    io.out(`Started the gateway (pid ${program.pid}), keeping its roster in ${data}.`);
    const { listen: listening = [], listenKept = null, page = null } = program.listening;
    if (listening.length > 0) io.out(listeningLine(listening, listenKept));
    if (page !== null) io.out(`The gateway serves the web client at ${page}`);
  } else {
    warnIfNewerThanGateway(io, found.versions.shrimpy);
    io.out("The gateway is already running; using it as it is.");
    if (here.listen !== undefined) io.err(cannotChangeListening(here.listen));
  }
  if (stop.requests() > 0) return;

  const chat = found?.programs.findLast((program) => program.kind === "chat");
  if (chat === undefined) {
    const program = await launch(io, { text: "chat" }, "the chat server", ["chat", "serve", join(here.data, "chat")]);
    crew.push({ role: "chat", what: "the chat server", program });
    io.out(`Started the chat server (pid ${program.pid}), keeping its data in ${join(here.data, "chat")}.`);
  } else {
    io.out("The chat server is already running; using it as it is.");
  }
}

/** Where the gateway it started listens for agents apart from it, and, when it was given no addresses, where it got them. */
function listeningLine(addresses: Address[], keptIn: string | null): string {
  const where = addresses.map(formatAddress).join(", ");
  return keptIn === null
    ? `The gateway listens for agents apart from it on ${where}, and keeps that for its next start.`
    : `The gateway listens for agents apart from it on ${where}, where it listened last time. ` +
        `That is kept in ${keptIn}: --listen replaces it, and deleting the file stops it.`;
}

/** What to tell someone who gave --listen to a gateway that is running already, which keeps the addresses it started with. */
function cannotChangeListening(addresses: Address[]): string {
  const listen = addresses.map((address) => `--listen ${formatAddress(address)}`).join(" ");
  return (
    `The gateway is already running, so ${listen} changes nothing: it listens where it was started. ` +
    `To make it listen there, stop it and run shrimpy up ${listen} again.`
  );
}
