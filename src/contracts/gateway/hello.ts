import { lit, map, nul, obj, str, union } from "@earendil-works/chord";
import { compile } from "@earendil-works/pi-schema";
import { PI_PACKAGES, SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { type Reason, ReasonSchema, type Refused } from "./answers.ts";
import { type Member, MemberSchema } from "./roster.ts";

/** The exact Pi packages a program runs, each at its version. */
export type PiPackages = Readonly<Record<string, string>>;

/** Who a hello says the caller is. */
export type Who =
  /** An agent's program. A name that differs from the roster's renames it. A token the gateway doesn't know joins it, on the gateway's socket only. */
  | { kind: "agent"; name: string; token: string }
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

/** The gateway lets the caller in, as `you`, or as nobody for a program that isn't a member. */
export type Welcome = { kind: "welcome"; you: Member | null; shrimpy: string; pi: PiPackages };

/** The gateway turns the caller away, and closes the connection. */
export type TurnedAway = Refused & { shrimpy: string; pi: PiPackages };

/** The one frame the gateway sends back, with its own Shrimpy version and Pi packages either way. */
export type HelloAnswer = Welcome | TurnedAway;

const PiSchema = map(str());

const HelloSchema = obj({
  shrimpy: str(),
  pi: PiSchema,
  who: union([
    obj({ kind: lit("agent"), name: str(), token: str() }),
    obj({ kind: lit("chat") }),
    obj({ kind: lit("client"), token: union([str(), nul()]) }),
    obj({ kind: lit("join"), name: union([str(), nul()]), token: str(), code: str(), machine: str() }),
  ]),
});

const AnswerSchema = union([
  obj({ kind: lit("welcome"), you: union([MemberSchema, nul()]), shrimpy: str(), pi: PiSchema }),
  obj({ kind: lit("refused"), words: str(), reason: union([ReasonSchema, nul()]), shrimpy: str(), pi: PiSchema }),
]);

const checkHello = compile(HelloSchema).check;
const checkAnswer = compile(AnswerSchema).check;

/** This code's hello, as `who`. */
export function hello(who: Who): Hello {
  return { shrimpy: SHRIMPY_VERSION, pi: PI_PACKAGES, who };
}

/** This code's welcome, for `you`. */
export function welcome(you: Member | null): Welcome {
  return { kind: "welcome", you, shrimpy: SHRIMPY_VERSION, pi: PI_PACKAGES };
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
 * Why an answer this code can't read was turned down, with what the other end
 * runs when it says. `who` is what answered, such as "The gateway".
 */
export function unreadableAnswer(value: unknown, who = "The gateway"): string {
  const theirs = readVersions(value);
  const what = `${who} answered the hello with something this Shrimpy doesn't know.`;
  if (theirs === undefined) return what;
  return `${what} It runs Shrimpy ${theirs.shrimpy} on ${describePi(theirs.pi)}, and this runs Shrimpy ${SHRIMPY_VERSION} on ${describePi(PI_PACKAGES)}.`;
}

/** Whether `pi` is exactly the Pi packages this code runs. */
export function samePi(pi: PiPackages): boolean {
  const ours = Object.entries(PI_PACKAGES);
  return Object.keys(pi).length === ours.length && ours.every(([name, version]) => pi[name] === version);
}

/**
 * The words for a caller that runs other Pi packages than this code, said by
 * whoever answers its hello: `who` is what it calls itself, such as "The gateway", and
 * `where` where it runs, such as "on the gateway's machine". They say which
 * side to update, and to what, when the versions tell.
 */
export function otherPi(caller: Versions, answering: { who: string; where: string }): string {
  const ours = uniform(PI_PACKAGES);
  const theirs = uniform(caller.pi);
  const order = ours === undefined || theirs === undefined ? undefined : compareVersions(theirs, ours);
  const what =
    order === undefined || order === 0
      ? `update Shrimpy here or ${answering.where}, so both run the same`
      : order > 0
        ? `update Shrimpy ${answering.where} to ${caller.shrimpy}`
        : `update Shrimpy here to ${SHRIMPY_VERSION}`;
  return (
    `${answering.who} runs Shrimpy ${SHRIMPY_VERSION} on ${describePi(PI_PACKAGES)}, and this runs Shrimpy ${caller.shrimpy} ` +
    `on ${describePi(caller.pi)}. Programs that link need the same Pi packages: ${what}.`
  );
}

/** The one version every package is at, if they agree. */
function uniform(pi: PiPackages): string | undefined {
  const versions = new Set(Object.values(pi));
  return versions.size === 1 ? [...versions][0] : undefined;
}

function describePi(pi: PiPackages): string {
  const one = uniform(pi);
  if (one !== undefined) return `Pi ${one}`;
  const each = Object.entries(pi).map(([name, version]) => `${name.replace(/^@earendil-works\//, "")} ${version}`);
  return each.length === 0 ? "no Pi packages" : each.join(", ");
}

/** How `a` compares with `b` as plain versions such as `1.5.2`, or undefined when either is something else. */
function compareVersions(a: string, b: string): number | undefined {
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
