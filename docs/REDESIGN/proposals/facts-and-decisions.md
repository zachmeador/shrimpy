# 🦐 Facts and decisions, proposed

**State:** proposed on 2026-10-05 and waiting on you. You asked for more detail the same day, and this is it. Nothing changes until you decide.

## The rule

A contract carries facts. What a fact means to whoever reads it is the reader's decision.

- **A fact** is something that happened or is so. It stays true whoever reads it and whenever: who wrote a message, when, and which members its text names.
- **A decision** is what one reader does about a fact: whether a message is for it, whether to wake, whether it can't wait. Two readers can decide differently about the same fact, and one reader can change its mind later.

It matters most in contracts for two reasons. Programs on other machines and of other versions read them, so a decision in a contract is made for all of them at once. And the chat store keeps what the chat contract carries, so a decision written into a message stays as it was worked out on the day the message was written.

## The case that showed it

The chat server marks every message with who it is `addressed` to. The contract says: "In a DM that is the other member. In a room it is those the text mentions as `@name`, and everyone but the author when it says `@all`."

That is one field doing two jobs:

| Where | What `addressed` holds | What that is |
|---|---|---|
| In a room | The members the text mentions | A fact about the message |
| In a DM | The other member, whatever the text says | The chat server's decision that a DM message is for the other member |

Five messages from you show the difference. Scout and bob are agents.

| You write | Where | `addressed` today | `mentions`, proposed |
|---|---|---|---|
| `hello` | Your DM with scout | scout | nobody |
| `@scout stop that` | Your DM with scout | scout | scout |
| `hello` | A room with scout and bob | nobody | nobody |
| `@scout hello` | The room | scout | scout |
| `@all hello` | The room | scout, bob | scout, bob |

In a DM the first two rows look the same, so the fact is lost there. That is how this surfaced. Your rule that a person's mention joins the turn an agent is running needs to know whether a DM message mentions the agent, and the event can't say. So the agent reads the text again, with a function the chat server and the agent share through the contract.

It came in with the first contract on 2026-10-03, when only DMs existed and the two jobs looked the same. The plan had said only that the chat server owns "addressing and mentions" and that agents decide what wakes them. A builder filled the gap, and nobody raised it.

## What leaving it costs

- **An agent's rule for DMs is written in the chat server.** The direction you confirmed is that agents decide what wakes them. The chat server does offer every event and filters nothing. But in a DM the label it puts on a message already answers "is this for you", so there is nothing left for the agent to decide. An agent that should treat DMs differently, say one that doesn't wake for another agent's thank-you unless it is mentioned, would need a change to the chat server.
- **Stored messages hold the decision.** Each row keeps `addressed` as the rule of its day worked it out. Change the rule and old messages disagree with new ones. Who a message mentioned stays true.
- **Two programs share a rule for reading text.** The agent works out a mention in a DM with the chat server's own function. If what counts as a mention changes, an agent of another version and the chat server disagree about the same message.
- **Each new reader has to work the fact out again.** The steer rule was the first. The terminal marking what mentions you would be the next.

## What would change

**In the contract.** A message has `mentions` in place of `addressed`: the IDs of the members its text names as `@name`, and everyone in the channel but the author when it says `@all`, as the members were when it was written or last edited. Never its author. In a DM it is empty unless the text names the other member. The function for finding a mention leaves the contract, because only the chat server reads text for mentions.

**In the chat server.** It works out mentions the same way in a DM and a room. The store's `addressed` column becomes `mentions`, and the unused `answers_seq` column of `messages` goes, so the store's version rises from 6 to 7.

**In the agent.** Each rule says what it means, and gives the same answer as today:

| Rule | Today | With `mentions` |
|---|---|---|
| What wakes it in a DM | `addressed` includes it, which is always, because the chat server put it there | It is a DM and the other member wrote the message |
| What wakes it in a room | `addressed` includes it. Or the policy is `people`, a person wrote it and `addressed` is empty. Or the policy is `all` | The same, read from `mentions` |
| A person's mention joins the running turn | In a room, `addressed` includes it. In a DM, the text is read again | `mentions` includes it, in a room and a DM alike |
| `/stop` | For the agent when `addressed` is empty or includes it | In a DM, always. In a room, when `mentions` is empty or includes it |
| An answer wakes whoever asked | The agent's own message was `addressed` to the member who answered | In a room, its own message mentioned them. In a DM the reply wakes it anyway |
| Who a message in a room was for, as the model is told | Worked out from `addressed` | Worked out from `mentions`, in the same words |

**In the terminal and the commands.** The terminal doesn't read the field today. `shrimpy read --json` prints every message whole, so the field's name changes in its output.

## What it costs

- **Code.** 85 lines in 28 files name the field: 44 in the chat server, the contract and the agent, and the rest in tests and test data. One builder, one change.
- **Your chat data resets once.** Nothing converts a chat store, by the repo's rule, so the new chat server refuses a store of version 6 and says so. Your dev setup's `chat/` folder is moved aside, and each agent's records with it, because their cursors and sessions point into the old store. The homes stay: `SOUL.md`, context, skills, trigger files and `wake.json`. What goes is the history of your test conversations, the agents' sessions and any wake-up that was waiting. I would move them to the Trash when nothing is running, on your word, as before.
- **Risk to behavior.** None is meant. The tests of waking, steering, `/stop` and the backlog run on the real chat server and the real engine, and they must pass unchanged.

## What could ride along

The reset happens once either way, so another change to the store's shape could share it. Each is its own decision, and none is needed for this one.

- **The store's ID in an agent's cursor.** Today an agent notices a replaced chat store only when its cursor is past the store's newest position. With the ID it would notice at once and read the new store from its start, so a later reset of chat data shouldn't need the agents' records moved too. I would add this one, since this reset is the case it is for.
- **Request IDs on edits, deletes and reactions, and a version on renaming and archiving a thread.** Both are on the [status list](../STATUS.md#the-contracts-between-them), and the first matters once a chat provider can replay an old edit. I would leave them for the provider interface, where their shape gets decided.

## What it doesn't touch

Nothing you see in a conversation changes: `@name` and `@all`, the wake policies and their default, receipts, rooms and the message tools all work as they do.

The three contracts were read for another field that mixes a fact and a decision, and `addressed` is the only one. A receipt's status is the agent's own statement of what it did. Whether a member is an admin, or reachable, is a fact. The chat server refusing a room to someone who isn't an admin is a permission it enforces over what it owns, which is not the same as deciding what a message means to its reader.

## Other ways to do it

- **Leave it.** The costs above stay, and the next rule that needs to know about a mention in a DM reads the text again.
- **Carry both fields.** `mentions` would fix the lost fact, and the chat server would still decide what a DM message is for. Two fields that mostly agree is more to get wrong.
- **Record neither, and let each reader read the text.** A reader can't do it right later. Names change and members come and go, so who `@maya` or `@all` meant is known only when the message is written, by the program that has the room's members then. That is why mentions are a fact the chat server records.

## If you say yes

- The rule goes into [the contracts' design](../design/2-contracts.md), with this case as its example, and this file leaves.
- The change is built after the reshape of the agent's modules lands, since both touch the agent's side of chat.
- A question to ask of any new field in a contract: could two readers want to treat it differently, or could one want to change how it treats it later? Then the contract carries the fact, and each reader decides.
