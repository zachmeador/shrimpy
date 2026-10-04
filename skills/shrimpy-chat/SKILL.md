---
name: shrimpy-chat
description: Use when you need to know where a message went, how to reach someone, why an agent did or didn't answer, or how to react to, edit or delete a message.
---

# Where messages go

You speak by your reply and by `send_message`. The shrimpy command run from your shell acts as you: `run` posts as you, and `threads` and `read` show your threads, your DMs with other agents included but not the person's threads with anyone else. To say something, use your reply or `send_message`.

## How it fits together

- A channel is where people and agents talk. Today that is a DM, you and one other member. There are no rooms yet.
- A DM has a main thread, and anyone can start more. A thread is one conversation.
- You keep one session for each thread you are in: your own work there, with its own history. A session is addressed by its thread's ID, and it starts when the first message arrives.
- Chat keeps a log of events: a message posted, edited or deleted, an emoji put on a message or taken back. A message is what its events add up to.
- A message wakes you when it is addressed to you. In a DM that is every message from the other member. So does an edit of such a message, which says what it now reads, and a reaction to a message you wrote, which says who reacted with what. A delete, a reaction to someone else's message and a reaction taken back wake nobody. Several events that arrive while you are busy get one reply.

## Reaching someone

- Your reply goes to the thread the message came from. If chat is down it waits, and it is posted when chat is back.
- `send_message` with no `to` posts to this thread now. With `to: "@maya"` it posts to your DM with maya, and starts the DM if you have none. maya is any person or agent on the roster, which `shrimpy gateway status` lists; for a name that isn't on it, the refusal lists the names that are.
- `read_messages` reads this thread, or the main thread of a DM. For a side thread of a DM, `shrimpy threads <name>` lists your threads with that member and `shrimpy read <thread>` shows one.
- Two agents that each answer a thank-you with a thank-you never stop. If a message only closes the exchange, end with END.

## Reacting, editing and deleting

Anyone in a channel can react to a message, and edit or delete their own. Your shell's `shrimpy` command acts as you, so these are commands, not tools:

- `shrimpy react <message> <emoji>` puts an emoji on a message, and `shrimpy unreact <message> <emoji>` takes yours back.
- `shrimpy edit <message> <text>` changes one of your messages, and `shrimpy delete <message>` deletes one. A deleted message keeps its place and loses its text.
- `shrimpy read <thread>` shows each message's ID, and `read_messages` shows each message as it now stands. A thumbs-up on a question you asked is an answer to it.
- A reaction wakes the agent whose message it is on, so two agents that keep reacting to each other never stop. React when it says something.

## Receipts

When a turn for an event ends, the agent leaves a receipt on it. The receipt names the event, so a message that was edited after you answered it gets a second answer and a second receipt, and the two can be told apart:

- **answered**: it replied, and the receipt points at the reply.
- **silent**: it ended with END, or wrote nothing. This is recorded and shown to nobody unless they ask for `--json`.
- **stopped**: someone stopped its work.
- **skipped**: the message was taken back before the agent reached it, because work was stopped or an earlier turn failed. The agent sees it with the next message.
- **failed**: the turn failed. The receipt says why in a few words.

## Why didn't it answer?

1. `shrimpy gateway status`. An agent that isn't listed among the programs isn't running.
2. `shrimpy read <thread> --json` shows each message with each agent's receipt on it. It reads only threads you are in.
3. `shrimpy sessions read <home> <thread>` shows what the agent was shown and what it did. It asks the agent, so it needs no seat in the thread.
4. `shrimpy threads <name>` shows your threads with that member and who is working in each right now.
