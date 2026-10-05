# 🦐 Facts and decisions, proposed

**Facts and decisions, proposed on 2026-10-05 and not reviewed.**

The rule: a contract carries facts. What a fact means to whoever reads it is the reader's decision.

*The case that showed it.* The chat server marks every message with who it is `addressed` to: "the others in a DM, or those mentioned in a room". That is one field doing two jobs. Who a message mentions is a fact, worked out once when the message is written, by the program that knows the room's members and the roster at that moment. That a message in a DM is for the other member is a decision, and the chat server makes it for every reader. It came in with the first contract on 2026-10-03, when only DMs existed and the two looked the same. The plan had said only that the chat server owns "addressing and mentions" and that agents decide what wakes them.

*What would change.*

- A message records `mentions`: the members its text names, with `@all` as everyone in the room then. In a DM that is empty unless a name was written.
- The agent's wake policy says what it already means: in a DM every message from the other member wakes it, and in a room a mention does, or a person's message that mentions nobody.
- The rule that a person's mention joins the running turn reads the mention off the event, in a DM as in a room. The function the chat server and the agent share for this today goes.
- The terminal decides for itself what to mark as for you.

*What it costs.* The chat store holds something different, so its version rises and a store from before is refused. Your chat data resets once, and the agents' records with it. One unused column goes in the same change. The contract's field is renamed, so the chat server, the agent, the terminal and the commands change together. Nothing you see in a conversation changes.

*What else the rule touches today:* nothing. The three contracts were read for another field that mixes the two, and `addressed` is the only one. A receipt's status is the agent's own statement of what it did. Whether a member is an admin, or reachable, is a fact. The chat server refusing a room to someone who isn't an admin is a permission it enforces, which is not the same as deciding what a message means.
