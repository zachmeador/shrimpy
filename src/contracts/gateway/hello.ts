import { compile, lit, map, nul, str, union } from "@earendil-works/pi-schema";
import type { Linked } from "../../lib/link/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { capitalize } from "../../lib/text/index.ts";
import { PI_PACKAGES, SHRIMPY_VERSION } from "../../lib/version/index.ts";
import type { Reason, Refused } from "./answers.ts";
import { openObject } from "./open.ts";
import { type Member, ON_THE_ROSTER, type TurnedAwayProgram } from "./roster.ts";

/** The exact Pi packages a program runs, each at its version. */
export type PiPackages = Readonly<Record<string, string>>;

/** Who a hello says the caller is. */
export type Who =
  /**
   * An agent's program. `name` names it only when it first joins. On the
   * gateway's socket, a token the gateway doesn't know joins it unless `roster`
   * matches this roster's ID, in which case its token was taken back or
   * replaced, or the agent was removed, and it is turned away as unknown.
   */
  | { kind: "agent"; name: string; token: string; roster: string | null }
  /** The chat server, which shows no token, on the gateway's socket. */
  | { kind: "chat" }
  /**
   * A client: you with no token, which only the gateway's socket takes, or with a device's token, and an agent with its
   * token. An agent's home socket takes it with no token, and stamps the client `home`.
   */
  | { kind: "client"; token: string | null }
  /**
   * Joining with an invitation, over the gateway's entry: the agent `name`, or
   * a device of yours when it is null, labelled with `machine`, the joining
   * machine's name. The connection closes after the answer.
   */
  | { kind: "join"; name: string | null; token: string; code: string; machine: string };

/** The first frame a caller sends, before any of Chord's: its Shrimpy version, its Pi packages and who it is. */
export type Hello = { shrimpy: string; pi: PiPackages; who: Who };

/** The gateway lets the caller in, as `you` (or nobody for a program that isn't a member), with its roster's ID (null on an agent's home socket). */
export type Welcome = { kind: "welcome"; you: Member | null; roster: string | null; shrimpy: string; pi: PiPackages };

/** The gateway turns the caller away, and closes the connection. */
export type TurnedAway = Refused & { shrimpy: string; pi: PiPackages };

/** The one frame the gateway sends back, with its own Shrimpy version and Pi packages either way. */
export type HelloAnswer = Welcome | TurnedAway;

const PiSchema = map(str());

const HelloSchema = openObject({
  shrimpy: str(),
  pi: PiSchema,
  who: union([
    openObject({ kind: lit("agent"), name: str(), token: str(), roster: union([str(), nul()]) }),
    openObject({ kind: lit("chat") }),
    openObject({ kind: lit("client"), token: union([str(), nul()]) }),
    openObject({ kind: lit("join"), name: union([str(), nul()]), token: str(), code: str(), machine: str() }),
  ]),
});

const AnswerSchema = union([
  openObject({ kind: lit("welcome"), you: union([openObject(ON_THE_ROSTER), nul()]), roster: union([str(), nul()]), shrimpy: str(), pi: PiSchema }),
  openObject({ kind: lit("refused"), words: str(), reason: union([str(), nul()]), shrimpy: str(), pi: PiSchema }),
]);

const checkHello = compile(HelloSchema).check;
const checkAnswer = compile(AnswerSchema).check;

/** This code's hello, as `who`. */
export function hello(who: Who): Hello {
  return { shrimpy: SHRIMPY_VERSION, pi: PI_PACKAGES, who };
}

/** This code's welcome, for `you`, on the roster `roster` (null when there is no roster, as on an agent's home socket). */
export function welcome(you: Member | null, roster: string | null = null): Welcome {
  return { kind: "welcome", you, roster, shrimpy: SHRIMPY_VERSION, pi: PI_PACKAGES };
}

/** This code's refusal of a hello. */
export function turnAway(words: string, reason: Reason | null = null): TurnedAway {
  return { kind: "refused", words, reason, shrimpy: SHRIMPY_VERSION, pi: PI_PACKAGES };
}

/** A hello from `value`, which arrived as JSON from anyone, or undefined when it isn't one. */
export function readHello(value: unknown): Hello | undefined {
  return checkHello(value) ? (value as Hello) : undefined;
}

/** An answer from `value`, which arrived as JSON, or undefined when it isn't one. */
export function readAnswer(value: unknown): HelloAnswer | undefined {
  return checkAnswer(value) ? (value as HelloAnswer) : undefined;
}

/** What a program runs: its Shrimpy version and its Pi packages. */
export type Versions = { shrimpy: string; pi: PiPackages };

/**
 * The versions a hello or an answer names, read even from one whose other
 * fields this code doesn't know, so that a program of another release can
 * still be told what to run where. Undefined when it names none.
 */
export function readVersions(value: unknown): Versions | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { shrimpy, pi } = value as Record<string, unknown>;
  if (typeof shrimpy !== "string" || typeof pi !== "object" || pi === null || Array.isArray(pi)) return undefined;
  const entries = Object.entries(pi);
  if (!entries.every(([, version]) => typeof version === "string")) return undefined;
  return { shrimpy, pi: Object.fromEntries(entries) as PiPackages };
}

/**
 * The other end turned the hello away: the gateway, or an agent on its home's
 * socket, which takes the same hello. Its message is their words, and
 * `versions` what the other end runs, which tells whether it was turned away
 * for the release it runs.
 */
export class HelloRefusedError extends Error {
  /** One of `Reason`, which a reader acts on, one a later release of the major added, or null. */
  readonly reason: string | null;
  readonly versions: Versions;

  constructor(words: string, reason: string | null, versions: Versions) {
    super(words);
    this.name = "HelloRefusedError";
    this.reason = reason;
    this.versions = versions;
  }
}

/**
 * The other end answered the hello with something this code can't read, as one
 * of another release may. Its message says what each side runs, when it said.
 */
export class UnknownAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownAnswerError";
  }
}

/** The welcome, and the link that follows it. */
export interface Welcomed {
  readonly welcome: Welcome;
  readonly linked: Linked;
}

/**
 * The welcome in `raw`, the answer to a hello that came before `linked`: a
 * refusal is a `HelloRefusedError`, and an answer this code can't read is an
 * `UnknownAnswerError`, and either way the link is dropped. `answering` is who
 * answered, as the words name it when its answer can't be read.
 */
export function welcomeIn(raw: unknown, linked: Linked, answering?: string): Welcomed {
  const answer = readAnswer(raw);
  if (answer?.kind === "welcome") return { welcome: answer, linked };
  linked.drop();
  if (answer === undefined) throw new UnknownAnswerError(unreadableAnswer(raw, answering));
  throw new HelloRefusedError(answer.words, answer.reason, { shrimpy: answer.shrimpy, pi: answer.pi });
}

/**
 * Why an answer this code can't read was turned down, with what the other end
 * runs when it says. `who` is what answered, such as "The gateway".
 */
export function unreadableAnswer(value: unknown, who = "The gateway"): string {
  const theirs = readVersions(value);
  const what = `${who} answered the hello with something this Shrimpy doesn't know.`;
  if (theirs === undefined) return what;
  return `${what} It runs Shrimpy ${theirs.shrimpy} on ${describePi(theirs.pi)}, and this runs Shrimpy ${SHRIMPY_VERSION} on ${describePi(PI_PACKAGES)}.`;
}

/** What this code runs: its Shrimpy version and its Pi packages. */
const OURS: Versions = { shrimpy: SHRIMPY_VERSION, pi: PI_PACKAGES };

/**
 * Whether a program that runs `theirs` links with this code: the same Pi
 * packages, since Chord's wire changes with them, and the same major of
 * Shrimpy, since a major may stop serving what the one before it shipped.
 */
export function linksWith(theirs: Versions): boolean {
  return gapBetween(theirs, OURS) === undefined;
}

/** What whoever answers says to a hello it can't read: `answerer` is what it calls itself, such as "this gateway". */
export const notAHello = (answerer: string): string =>
  `That isn't a hello ${answerer} knows, so the other end may be another version of Shrimpy, or not Shrimpy at all.`;

/** Who answers a hello and where it runs, as the words for a caller of another release name them: "The gateway", "on the gateway's machine". */
export type Answering = { who: string; where: string };

/**
 * What whoever answers says to a caller that links with it, runs `caller`, and
 * said a hello it can't read: one that asks for something added in a later
 * release of the major, such as a new kind of caller. The words say which side
 * to update, and to what.
 */
export function unservedHello(caller: Versions, answering: Answering): string {
  const theirs = oneLine(caller.shrimpy);
  const order = compareShrimpy(caller.shrimpy, SHRIMPY_VERSION);
  const what =
    order === undefined || order === 0
      ? `update Shrimpy ${answering.where} or here, so both run the same build`
      : order > 0
        ? `update Shrimpy ${answering.where} to ${theirs}`
        : `update Shrimpy here to ${SHRIMPY_VERSION}`;
  return `${answering.who} doesn't serve what this hello asks for. It runs Shrimpy ${SHRIMPY_VERSION}, and this runs Shrimpy ${theirs}: ${what}.`;
}

/**
 * What whoever answers a hello says to a caller that runs `caller` and can't
 * link with it, or undefined when it can. They say which side to update, and
 * to what, when the versions tell.
 */
export function otherRelease(caller: Versions, answering: Answering): string | undefined {
  return apart({ name: answering.who, where: answering.where, versions: OURS }, { name: "this", where: "here", versions: caller });
}

/**
 * Why the gateway, which runs `gateway`, turned `program` away, or undefined
 * when they link: which side to update, and to what, when the versions tell.
 */
export function whyTurnedAway(program: TurnedAwayProgram, gateway: Versions): string | undefined {
  const name = program.kind === "chat" ? "the chat server" : `the agent ${oneLine(program.name)}`;
  const why = apart({ name: "it", where: `where ${name} runs`, versions: program }, { name: "the gateway", where: "on the gateway's machine", versions: gateway });
  return why === undefined ? undefined : `The gateway turned ${name} away: ${why}`;
}

/**
 * What a client that calls itself `self`, such as "this page", says when what
 * it holds of `what`, such as "the agent scout", waits because `what` serves
 * another version of it. `version` is the Shrimpy `what` runs, or undefined
 * when the gateway doesn't say. The words say where to update, and to what.
 */
export function waitingOnVersion(what: string, version: string | undefined, self: string): string {
  const name = oneLine(what);
  const subject = capitalize(name);
  if (version === undefined) {
    return `${subject} runs another release of Shrimpy than ${self}, which runs ${SHRIMPY_VERSION}, and the two disagree on what it shows. Update both to the same release.`;
  }
  const order = compareShrimpy(version, SHRIMPY_VERSION);
  if (order === undefined || order === 0) {
    return `${subject} runs Shrimpy ${oneLine(version)}, as ${self} does, but another build of it, and the two disagree on what it shows. Update both to the same build.`;
  }
  return order < 0
    ? `${subject} runs Shrimpy ${oneLine(version)}, older than ${self}'s ${SHRIMPY_VERSION}, and can't show what changed since. Update Shrimpy where ${name} runs to ${SHRIMPY_VERSION}.`
    : `${subject} runs Shrimpy ${oneLine(version)}, newer than ${self}'s ${SHRIMPY_VERSION}, and no longer shows what ${self} asks for. Update Shrimpy here to ${oneLine(version)}.`;
}

/** One of two programs, as the words for why they don't link name it: who, and where it runs, as in "update Shrimpy here". */
type Party = { name: string; where: string; versions: Versions };

/** Why `first` and `second` don't link, and which to update to what, or undefined when they link. */
function apart(first: Party, second: Party): string | undefined {
  const gap = gapBetween(second.versions, first.versions);
  if (gap === undefined) return undefined;
  const runs = (party: Party): string =>
    `Shrimpy ${oneLine(party.versions.shrimpy)}${gap.pi ? ` on ${describePi(party.versions.pi)}` : ""}`;
  const why = gap.pi ? "Programs that link need the same Pi packages" : "Releases of different majors don't link";
  const what =
    gap.order === undefined || gap.order === 0
      ? `update Shrimpy ${second.where} or ${first.where}, so both run the same`
      : gap.order > 0
        ? `update Shrimpy ${first.where} to ${oneLine(second.versions.shrimpy)}`
        : `update Shrimpy ${second.where} to ${oneLine(first.versions.shrimpy)}`;
  return `${first.name} runs ${runs(first)}, and ${second.name} runs ${runs(second)}. ${why}: ${what}.`;
}

/**
 * Why programs that run `a` and `b` don't link, or undefined when they do:
 * other Pi packages, which come first since nothing links across them, or
 * another major. `order` is above 0 when `a` is newer, and undefined when that
 * can't be told.
 */
function gapBetween(a: Versions, b: Versions): { pi: boolean; order: number | undefined } | undefined {
  if (!samePackages(a.pi, b.pi)) {
    const [left, right] = [uniform(a.pi), uniform(b.pi)];
    return { pi: true, order: left === undefined || right === undefined ? undefined : comparePlain(left, right) };
  }
  const [left, right] = [readRelease(a.shrimpy), readRelease(b.shrimpy)];
  if (left !== undefined && right !== undefined && left.major === right.major) return undefined;
  return { pi: false, order: compareShrimpy(a.shrimpy, b.shrimpy) };
}

/** Whether `a` and `b` are exactly the same Pi packages. */
function samePackages(a: PiPackages, b: PiPackages): boolean {
  const each = Object.entries(a);
  return Object.keys(b).length === each.length && each.every(([name, version]) => b[name] === version);
}

/**
 * The warning that `what`, such as "this command" or "the agent scout", runs
 * Shrimpy `version`, newer than the gateway's `gateway`, or undefined when it
 * isn't newer. The gateway serves chat and the roster to everyone, so its
 * machine updates first, and something newer than it may wait on it.
 */
export function newerThanGateway(what: string, version: string, gateway: string): string | undefined {
  const order = compareShrimpy(version, gateway);
  if (order === undefined || order <= 0) return undefined;
  return (
    `Warning: ${oneLine(what)} runs Shrimpy ${oneLine(version)}, newer than the gateway's ${oneLine(gateway)}. ` +
    `Update Shrimpy on the gateway's machine to ${oneLine(version)}: it serves chat and the roster, so nothing should be newer than it.`
  );
}

/** A Shrimpy version as its parts: `1.2.0`, or `1.3.0` and `dev` for a build between releases. */
type Release = { numbers: string; major: number; build: string | undefined };

function readRelease(version: string): Release | undefined {
  const parts = /^((\d+)\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (parts?.[1] === undefined) return undefined;
  return { numbers: parts[1], major: Number(parts[2]), build: parts[3] };
}

/**
 * How Shrimpy version `a` compares with `b`, or undefined when either isn't a
 * version: a build between releases, such as `1.3.0-dev`, comes after `1.2.x`
 * and before `1.3.0`.
 */
export function compareShrimpy(a: string, b: string): number | undefined {
  const [left, right] = [readRelease(a), readRelease(b)];
  if (left === undefined || right === undefined) return undefined;
  const numbers = comparePlain(left.numbers, right.numbers) ?? 0;
  if (numbers !== 0) return numbers;
  if (left.build === right.build) return 0;
  if (left.build === undefined) return 1;
  if (right.build === undefined) return -1;
  return left.build < right.build ? -1 : 1;
}

/** Which part of the version goes up from Shrimpy `from` to `to`, or undefined when either isn't a version. */
export function releaseStep(from: string, to: string): "major" | "minor" | "patch" | undefined {
  const [left, right] = [readRelease(from), readRelease(to)];
  if (left === undefined || right === undefined) return undefined;
  if (left.major !== right.major) return "major";
  return left.numbers.split(".")[1] === right.numbers.split(".")[1] ? "patch" : "minor";
}

/** The one version every package is at, if they agree. */
function uniform(pi: PiPackages): string | undefined {
  const versions = new Set(Object.values(pi));
  return versions.size === 1 ? [...versions][0] : undefined;
}

function describePi(pi: PiPackages): string {
  const one = uniform(pi);
  if (one !== undefined) return `Pi ${oneLine(one)}`;
  const each = Object.entries(pi).map(([name, version]) => `${oneLine(name.replace(/^@earendil-works\//, ""))} ${oneLine(version)}`);
  return each.length === 0 ? "no Pi packages" : each.join(", ");
}

/** How `a` compares with `b` as plain versions such as `1.5.2`, or undefined when either is something else. */
function comparePlain(a: string, b: string): number | undefined {
  const parse = (version: string): number[] | undefined =>
    /^\d+(\.\d+)*$/.test(version) ? version.split(".").map(Number) : undefined;
  const [left, right] = [parse(a), parse(b)];
  if (left === undefined || right === undefined) return undefined;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
