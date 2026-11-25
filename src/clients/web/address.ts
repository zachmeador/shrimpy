/*
 * Where the page is, as its address says it: how far in, whose list, and what
 * in it, so that a thread can be linked to, a reload opens it again, and Back
 * goes where it was. An address is a path, one part to each step:
 *
 *   /                                      agents and rooms
 *   /agents/<id>, /rooms/<id>, /reading/<id>   a list: an agent's, a room's, a channel only read
 *   …/observe                               an agent's other tab
 *   …/page                                  an agent's page
 *   …/home/<path>                           a file of its home
 *   …/threads/<id>, …/threads/<id>/view     a thread, and the agent's view of it
 *   …/new                                   a thread not started yet
 *   …/sessions/<address>                    a session behind no thread
 *   /threads/<id>                           a thread by its ID alone, as a notification opens it
 */
import type { Place } from "../state/index.ts";
import type { AgentTab } from "../view/index.ts";

/** What is on show beside a list. A thread's address doesn't name the tab of an agent's list, since the thread opens the tab that holds it. */
type Shown =
  /** A thread, or a new one with no ID yet, and whether the agent's view of it is on show. */
  | { kind: "thread"; thread: string | undefined; view: boolean }
  | { kind: "session"; session: string }
  /** The agent's page, which stands where a thread would. */
  | { kind: "page" }
  /** A file of the agent's home, by its path there, where its page was. */
  | { kind: "file"; path: string };

export type Route =
  | { kind: "agents" }
  | { kind: "list"; list: Place; tab: AgentTab; shown: Shown | undefined }
  /** A thread whose list is not known yet: the page finds it, and its address becomes the thread's in that list. */
  | { kind: "thread"; thread: string };

const LISTS: Record<Place["kind"], string> = { agent: "agents", room: "rooms", "read-only": "reading" };

const part = (text: string): string => encodeURIComponent(text);

/** The address of `route`. */
export function addressOf(route: Route): string {
  if (route.kind === "agents") return "/";
  if (route.kind === "thread") return `/threads/${part(route.thread)}`;
  const base = `/${LISTS[route.list.kind]}/${part(route.list.id)}`;
  const { shown } = route;
  if (shown === undefined) return route.tab === "chat" ? base : `${base}/${route.tab}`;
  switch (shown.kind) {
    case "thread":
      return shown.thread === undefined ? `${base}/new` : `${base}/threads/${part(shown.thread)}${shown.view ? "/view" : ""}`;
    case "session":
      return `${base}/sessions/${part(shown.session)}`;
    case "page":
      return `${base}/page`;
    case "file":
      return `${base}/home/${shown.path.split("/").map(part).join("/")}`;
  }
}

/** The route an address stands for: agents and rooms, for one the page doesn't know. */
export function routeOf(address: string): Route {
  let parts: string[];
  try {
    parts = address.split("/").filter((each) => each !== "").map(decodeURIComponent);
  } catch {
    return { kind: "agents" };
  }
  const [first, id, step, ...rest] = parts;
  if (first === "threads" && id !== undefined && step === undefined) return { kind: "thread", thread: id };
  const kind = (Object.keys(LISTS) as Place["kind"][]).find((each) => LISTS[each] === first);
  if (kind === undefined || id === undefined) return { kind: "agents" };
  const list: Place = { kind, id };
  const chat = { kind: "list", list, tab: "chat" } as const;
  if (step === undefined) return { ...chat, shown: undefined };
  if (kind === "agent" && step === "observe") return { ...chat, tab: "observe", shown: undefined };
  if (kind === "agent" && step === "page") return { ...chat, shown: { kind: "page" } };
  if (kind === "agent" && step === "home" && rest.length > 0) return { ...chat, shown: { kind: "file", path: rest.join("/") } };
  if (step === "new" && kind !== "read-only") return { ...chat, shown: { kind: "thread", thread: undefined, view: false } };
  const [named, more] = rest;
  if (step === "threads" && named !== undefined) return { ...chat, shown: { kind: "thread", thread: named, view: more === "view" } };
  if (step === "sessions" && named !== undefined && kind === "agent") return { ...chat, tab: "observe", shown: { kind: "session", session: named } };
  return { ...chat, shown: undefined };
}
