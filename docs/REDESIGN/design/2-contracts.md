# 🦐 The contracts between them

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

A contract says what a message, a session view and a registration are. Agents on other machines, other versions and other clients depend on these.

**The design**

Clients use two APIs, each the same for local and gateway-routed use. The chat server's API covers channels, threads, members, posting and reading messages with their attachments, and subscriptions. Each agent's API is a set of concrete operations:

- session inspection and selection
- reset, fork, steer, status, wait, withdraw and stop
- model, thinking, defaults and reload
- raw and effective context, entry queries and committed subscriptions
- completion against the agent's filesystem
- publication and chat-provider status, trigger and delegation controls
- receiving the attachments of offered messages into the agent's home

Commands, clients and tools call the same operations. Which of them get a command follows the [rule for commands](using-it.md). For transport, use `pi-server`, `pi-client` and `pi-protocol` over a restricted local Unix socket first, where their public APIs fit. Coding-agent's experimental controller isn't reused wholesale because it drops durable request IDs. Pi's protocol carries everything Shrimpy ships: the console, the web client, the CLI, the chat server, and each agent's link to the gateway. Plain HTTP is added only when a program that can't speak Pi's protocol needs in, and not yet. Only a Unix socket transport ships, so the web client needs a small WebSocket bridge; the spike's was 69 lines. Sockets live in a short runtime directory, because macOS caps Unix socket paths at 104 bytes. `pi-client` never reconnects on its own, so clients reconnect with backoff and mark a disconnected view as stale. The browser bundle is about 200 KB minified and 53 KB gzipped, mostly TypeBox. The protocol makes no compatibility promises, so Shrimpy pins Pi exactly, agents and clients upgrade together, and a version mismatch between peers is reported clearly.

Contracts carry Shrimpy-owned shapes only: the agent builds the session view that clients draw, so no client depends on Pi's record types. Clients talk through threads and watch through sessions. Attaching straight to an agent covers watching, steering and stopping, including while the gateway is down. Clients render committed views. Help, status and editor state stay local and never enter the transcript. Completion and shell input run against the agent's paths, never the client's cwd, so an attached console asks the agent for completions instead of reading a local directory. Clipboard files and images attach to the message you send, like any other attachment, with provenance and size limits.

**A contract carries facts.** What a fact means to whoever reads it is the reader's decision. You confirmed this on 2026-10-05.

- **A fact** is something that happened or is so. It stays true whoever reads it and whenever: who wrote a message, when, and which members its text names.
- **A decision** is what one reader does about a fact: whether a message is for it, whether to wake, whether it can't wait. Two readers can decide differently about the same fact, and one reader can change its mind later.

It matters most in contracts for two reasons. Programs on other machines and of other versions read them, so a decision in a contract is made for all of them at once. And the chat store keeps what the chat contract carries, so a decision written into a message stays as it was worked out on the day the message was written.

A question to ask of any new field in a contract: could two readers want to treat it differently, or could one want to change how it treats it later? Then the contract carries the fact, and each reader decides.

*The case that showed it.* The chat server marks every message with who it is `addressed` to: the other member in a DM, and in a room those the text mentions. That is one field doing two jobs.

| Where | What `addressed` holds | What that is |
|---|---|---|
| In a room | The members the text mentions | A fact about the message |
| In a DM | The other member, whatever the text says | The chat server's decision that a DM message is for the other member |

Five messages from you show the difference. Scout and bob are agents.

| You write | Where | `addressed` | `mentions` |
|---|---|---|---|
| `hello` | Your DM with scout | scout | nobody |
| `@scout stop that` | Your DM with scout | scout | scout |
| `hello` | A room with scout and bob | nobody | nobody |
| `@scout hello` | The room | scout | scout |
| `@all hello` | The room | scout, bob | scout, bob |

In a DM the first two rows look the same, so the fact is lost there. Your rule that a person's mention joins the turn an agent is running needs to know whether a DM message mentions the agent, and the event can't say, so the agent reads the text again with a function the chat server and the agent share through the contract. `addressed` came in with the first contract on 2026-10-03, when only DMs existed and the two jobs looked the same. The plan had said only that the chat server owns "addressing and mentions" and that agents decide what wakes them. A builder filled the gap, and nobody raised it.

Leaving it had four costs. An agent's rule for DMs was written in the chat server, though agents decide what wakes them. Stored messages held the decision as the rule of their day worked it out. Two programs shared a rule for reading text. And each new reader had to work the fact out again.

*What the rule leaves alone.* The three contracts were read for another field that mixes a fact and a decision, and `addressed` is the only one. A receipt's status is the agent's own statement of what it did. Whether a member is an admin, or reachable, is a fact. The chat server refusing a room to someone who isn't an admin is a permission it enforces over what it owns, which is not the same as deciding what a message means to its reader.

*Ways it wasn't done.* Carrying both fields would fix the lost fact and leave the chat server deciding what a DM message is for, with two fields that mostly agree. Recording neither and letting each reader read the text can't be done right later: names change and members come and go, so who `@maya` or `@all` meant is known only when the message is written, by the program that has the room's members then. That is why mentions are a fact the chat server records.

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Who a message is for | The chat server marks each message with who it is `addressed` to: in a room the members its text mentions, and in a DM the other member, whatever the text says. | A message records `mentions`: the members its text names as `@name`, and everyone in the channel but the author when it says `@all`, in a DM as in a room. What a mention means, and what a DM means, is each reader's decision: an agent's wake policy, its rule for a mention that joins a running turn, `/stop`, and what a client marks as for you. | Confirmed and built on 2026-10-05. |

**Open**

**Decide first:** how peers stay compatible across machines. Pi's protocol makes no compatibility promises, so every program upgrades together today. That works on one machine. With agents on other machines, updating one side breaks every agent that hasn't updated yet. The link that crosses machines is small: an agent talking to chat and the gateway. Either that link gets a stable protocol of its own, or lockstep upgrades are accepted with a clear report of the mismatch. The MVP takes the second: every program runs the same version, and a mismatch is reported.

**Built on 2026-10-05**

- In the contract, a message has `mentions`: the IDs of the members its text names as `@name`, and everyone in the channel but the author when it says `@all`, as the members were when it was written or last edited. Never its author. In a DM it is empty unless the text names the other member, and `@all` there mentions the other member. Only the chat server reads text for mentions, so the function that finds one is its own.
- The chat server works out mentions the same way in a DM and a room. The store's version is 7: it has `mentions`, lost the unused `answers_seq` column of `messages`, and has an ID. A store of another version is refused, and the refusal says to move the folder aside.
- In the agent, each rule says what it means:

| Rule | Before, with `addressed` | Now, with `mentions` |
|---|---|---|
| What wakes it in a DM | `addressed` includes it, which is always, because the chat server put it there | It is a DM and the other member wrote the message |
| What wakes it in a room | `addressed` includes it. Or the policy is `people`, a person wrote it and `addressed` is empty. Or the policy is `all` | The same, read from `mentions` |
| A person's mention joins the running turn | In a room, `addressed` includes it. In a DM, the text is read again | `mentions` includes it, in a room and a DM alike. Later the same day the rule became that any message a person writes joins it, which reads no mentions |
| `/stop` | For the agent when `addressed` is empty or includes it | In a DM, always. In a room, when `mentions` is empty or includes it |
| An answer wakes whoever asked | The agent's own message was `addressed` to the member who answered | In a room, its own message mentioned them. In a DM the reply wakes it anyway, so chat isn't asked for it |
| Who a message in a room was for, as the model is told | Worked out from `addressed` | Worked out from `mentions`, in the same words |

- The terminal doesn't read the field. `shrimpy read --json` prints every message whole, so its output has the new name.
- **The store's ID.** The chat store gets an ID when it is made, and the chat contract answers it with `store`. An agent keeps, with its place in the feed, the ID of the store that place is for, and asks for the ID each time it connects. A place kept for another store, or for none, is dropped: the agent reads the new store from its start and says so. A place past the end of the same store means the store went back to an earlier state, as when restored from a backup, and the agent reads it from the start too. So replacing the chat store needs nothing done to an agent's records.

**Left for the provider interface:** request IDs on edits, deletes and reactions, and a version on renaming and archiving a thread. Both are on the [status list](../STATUS.md#the-contracts-between-them), and their shape gets decided there.
