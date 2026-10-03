import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRemoteServiceEndpoint,
  createServiceSubscribeCall,
  type MutableReplicatedState,
  RemoteServiceProvider,
  replicatedState,
  type ServiceProviderUpdate,
} from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type Message, type Receipt, ThreadService, type ThreadView } from "../../contracts/chat/index.ts";
import { agent, person } from "../testing/index.ts";
import { publishThreadView } from "./publish.ts";

const context = BACKGROUND_CONTEXT;

const message = (seq: number, receipts: Receipt[] = []): Message => ({
  id: `msg_${seq}`,
  seq,
  channelId: "ch_1",
  threadId: "th_1",
  author: seq % 2 === 0 ? agent("Shrimpy") : person("Zach"),
  text: `message ${seq}`,
  sentAt: 1000 + seq,
  addressed: [],
  receipts,
});

const silent: Receipt = { memberId: "agent:shrimpy", status: "silent", reply: null, detail: null };
const answered = (reply: string): Receipt => ({ ...silent, status: "answered", reply });

function view(
  messages: Message[],
  extra: { earlier?: number; name?: string | null; working?: ThreadView["thread"]["working"] } = {},
): ThreadView {
  return {
    thread: {
      id: "th_1",
      channelId: "ch_1",
      main: true,
      name: extra.name ?? null,
      preview: messages[0]?.text ?? null,
      archived: false,
      updatedAt: messages.at(-1)?.sentAt ?? 1000,
      working: extra.working ?? [],
    },
    messages,
    earlier: extra.earlier ?? 0,
  };
}

const range = (from: number, to: number): Message[] =>
  Array.from({ length: to - from + 1 }, (_, index) => message(from + index));

/** Publish each view in turn, and return what subscribers saw after each one. */
function publishAll(first: ThreadView, rest: ThreadView[]): ThreadView[] {
  const state = replicatedState(structuredClone(first));
  const seen: ThreadView[] = [];
  for (const next of rest) {
    publishThreadView(state, structuredClone(next), context);
    seen.push(structuredClone(state.value));
  }
  return seen;
}

test("the published view always equals the latest view", () => {
  const steps = [
    view([message(1)]),
    view([message(1), message(2)]),
    view([message(1), message(2, [silent])]),
    view([message(1), message(2, [answered("msg_3")]), message(3)]),
    view(range(1, 3), { name: "Renamed" }),
    view(range(1, 3), { name: "Renamed", working: [{ memberId: "agent:shrimpy", since: 5000 }] }),
    view(range(2, 4), { earlier: 1, name: "Renamed" }),
    view(range(4, 4), { earlier: 3 }),
    view([message(9)], { earlier: 8 }),
    view(range(7, 9), { earlier: 6 }),
    view([]),
  ];

  assert.deepEqual(publishAll(view([]), steps), steps);
});

test("a view that does not line up with the last one replaces its messages", () => {
  const steps = [view(range(5, 8), { earlier: 4 }), view(range(1, 3))];

  assert.deepEqual(publishAll(view(range(2, 6)), steps), steps);
});

test("publishing the same view again makes no new revision", () => {
  const state = replicatedState(view(range(1, 3)));
  let revisions = 0;
  state.subscribe(() => {
    revisions += 1;
  });
  const before = revisions;

  publishThreadView(state, view(range(1, 3)), context);

  assert.equal(revisions, before);
});

/** What a watching client is sent when `state` changes. */
function updatesTo(state: MutableReplicatedState<ThreadView>): ServiceProviderUpdate[] {
  const provider = new RemoteServiceProvider([{ service: ThreadService, mode: "singleton" }]);
  provider.provide(ThreadService, { state });
  const updates: ServiceProviderUpdate[] = [];
  void createRemoteServiceEndpoint(provider).invoke(
    createServiceSubscribeCall("watch", ThreadService.id, "singleton"),
    (_subscription, update) => {
      updates.push(update);
    },
    context,
  );
  return updates;
}

test("a new message in a full view travels as a small update, not a copy of the thread", () => {
  const full = view(range(1, 200), { earlier: 50 });
  const state = replicatedState(structuredClone(full));
  const updates = updatesTo(state);

  publishThreadView(state, view(range(2, 201), { earlier: 51 }), context);
  publishThreadView(state, view([...range(2, 200), message(201, [silent])], { earlier: 51 }), context);

  assert.equal(updates.length, 2);
  for (const update of updates) {
    assert.equal(update.type, "state");
    assert.ok(JSON.stringify(update).length < 1500, JSON.stringify(update).slice(0, 300));
  }
  assert.ok(JSON.stringify(full).length > 30_000);
});
