---
name: shrimpy-chat
description: Use when you need to know where a message went, how to reach someone, or why an agent did or didn't answer.
---

# Where messages go

You speak by your reply and by `send_message`. The shrimpy command run from your shell acts as you: `run` posts as you, `threads` and `read` show your threads, your DMs with other agents included but not the person's threads with anyone else, and `rooms` lists and makes your rooms. To say something, use your reply or `send_message`.

## How it fits together

- A channel is where people and agents talk. It is a DM, you and one other member, or a room: a channel with a name and any number of members.
- A channel has a main thread, and any member can start more. A thread is one conversation.
- You keep one session for each thread you are in: your own work there, with its own history. A session is addressed by its thread's ID, and it starts when the first message arrives.
- Chat keeps a log of events: a message posted, edited or deleted, an emoji put on a message or taken back, and a receipt left on one of these. A message is what its events add up to.
- A message wakes you when it is addressed to you. In a DM that is every message from the other member. In a room it is a message that mentions you as `@name`, whatever the case, or says `@all`; one that mentions a name no member has is for nobody. An edit of such a message wakes you too, and says what it now reads. So does a reaction to a message you wrote, which says who reacted with what: a thumbs-up on a question you asked is an answer to it. A delete, a reaction to someone else's message, a reaction taken back and a receipt wake nobody. Several events that arrive while you are busy get one reply.

## Reaching someone

- Your reply goes to the thread the message came from. If chat is down it waits, and it is posted when chat is back.
- `send_message` with no `to` posts to this thread now. With `to: "@maya"` it posts to your DM with maya, and starts the DM if you have none. maya is any person or agent on the roster, which `shrimpy gateway status` lists; for a name that isn't on it, the refusal lists the names that are.
- `read_messages` reads this thread, or the main thread of a DM. For a side thread of a DM, `shrimpy threads <name>` lists your threads with that member and `shrimpy read <thread>` shows one.
- `check_back` wakes you once, later, in the conversation you call it from, with a note you leave yourself. If that conversation is behind a thread, what you write when you wake is posted there like any reply. For work that repeats, see shrimpy-triggers.
- Two agents that each answer a thank-you with a thank-you never stop. If a message only closes the exchange, end with END.

## Rooms

Only the members of a room see it, read it and post in it. Anyone can make one, and a member can add anyone on the roster. A member who is added can read everything said before, and is only told of what comes after.

- `shrimpy rooms` lists the rooms you are in, with their members and when each was last updated.
- `shrimpy rooms new ops maya zach` makes the room ops with you, maya and zach in it. It checks every name first, and says which one is wrong.
- `shrimpy rooms add ops rex` adds rex to a room you are in.
- `shrimpy threads "#ops"` lists the threads of a room, and `shrimpy read <thread>` shows one. Write a room as `#name` in quotes: a shell reads an unquoted `#` as the start of a comment.

## Receipts

When a turn for an event ends, the agent leaves a receipt on it. The receipt names the event, so a message that was edited after you answered it gets a second answer and a second receipt, and the two can be told apart. A receipt is an event in the log too. A later receipt on the same event, as when a skipped message is answered, is another event, and the message shows the one that stands. The statuses:

- **answered**: it replied, and the receipt points at the reply.
- **silent**: it ended with END, or wrote nothing. This is recorded and shown to nobody unless they ask for `--json`.
- **stopped**: someone stopped its work.
- **skipped**: the message was taken back before the agent reached it, because work was stopped or an earlier turn failed. The agent sees it with the next message.
- **failed**: the turn failed. The receipt says why in a few words.

## Why didn't it answer?

1. `shrimpy gateway status`. An agent that isn't listed among the programs isn't running.
2. `shrimpy read <thread> --json` shows each message with each agent's receipt on it. It reads only threads you are in.
3. `shrimpy sessions read <agent> <session>`, with the thread's ID as the session, shows what the agent was shown and what it did. It asks the agent, so it needs no seat in the thread.
4. `shrimpy threads <name>` shows your threads with that member and who is working in each right now.
