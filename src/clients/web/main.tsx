/*
 * The page's entry, a placeholder until the page is drawn. Opened with an
 * invitation's link, it shows the door the code, which lets the browser in.
 * Then it links to the gateway at the page's door and lists the names on the
 * roster, which shows the link holds.
 */
import { render } from "preact";
import {
  connectFromPage,
  contextOf,
  createLiveRoster,
  PAGE_JOIN,
  type PageJoin,
  pageLinkUrl,
  readAnswer,
  readPageCode,
  type RosterNow,
} from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { browserLabel, LINKING, LOST, ON_THE_ROSTER, READING, unreadableJoin } from "./words.ts";

/** What the page shows: words while it links, or when it can't, and the roster once it holds it. */
type Shown = { kind: "words"; words: string } | { kind: "roster"; roster: RosterNow | undefined };

function Page({ shown }: { shown: Shown }) {
  if (shown.kind === "words") return <p>{shown.words}</p>;
  if (shown.roster === undefined) return <p>{READING}</p>;
  return (
    <main>
      <p>{ON_THE_ROSTER}</p>
      <ul>
        {shown.roster.members.map((member) => (
          <li key={member.id}>{member.name}</li>
        ))}
      </ul>
    </main>
  );
}

/** Show the door an invitation's `code`: its refusal in its words, or undefined once the browser is let in. */
async function letIn(code: string): Promise<string | undefined> {
  const shown: PageJoin = { code, label: browserLabel(navigator.userAgent) };
  const response = await fetch(PAGE_JOIN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shown) });
  const answer = readAnswer(await response.json().catch(() => undefined));
  if (answer === undefined) return unreadableJoin(response.status);
  return answer.kind === "refused" ? answer.words : undefined;
}

async function start(show: (shown: Shown) => void): Promise<void> {
  const code = readPageCode(location.hash);
  if (code !== undefined) {
    // A code is good once, so the address keeps it no longer than this.
    history.replaceState(null, "", location.pathname + location.search);
    const refusal = await letIn(code);
    if (refusal !== undefined) return show({ kind: "words", words: refusal });
  }
  const linked = await connectFromPage({ url: pageLinkUrl(location) });
  if (linked.kind === "refused") return show({ kind: "words", words: linked.words });
  const client = linked.value;
  const roster = createLiveRoster(() => undefined);
  roster.subscribe(() => show({ kind: "roster", roster: roster.now() }));
  roster.follow(client.host, contextOf());
  show({ kind: "roster", roster: roster.now() });
  void client.closed.then(() => {
    roster.close();
    show({ kind: "words", words: LOST });
  });
}

const root = document.getElementById("shrimpy");
if (root !== null) {
  const show = (shown: Shown): void => render(<Page shown={shown} />, root);
  show({ kind: "words", words: LINKING });
  start(show).catch((error: unknown) => show({ kind: "words", words: asError(error).message }));
}
