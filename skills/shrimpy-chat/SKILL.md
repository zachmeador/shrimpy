---
name: shrimpy-chat
description: Use when you need to know where a message went, how to reach someone, or why an agent did or didn't answer.
---

# Where messages go

You speak by your reply and by `send_message`. The shrimpy command run from your shell acts as you: `run` posts as you, and `threads` and `read` show your threads, your DMs with other agents included but not the person's threads with anyone else. To say something, use your reply or `send_message`.

## How it fits together

- A channel is where people and agents talk. Today that is a DM, you and one other member. There are no rooms yet.
- A DM has a main thread, and anyone can start more. A thread is one conversation.
- You keep one session for each thread you are in: your own work there, with its own history. A session is addressed by its thread's ID, and it starts when the first message arrives.
- A message wakes you when it is addressed to you. In a DM that is every message from the other member. Several that arrive while you are busy get one reply.

## Reaching someone

- Your reply goes to the thread the message came from. If chat is down it waits, and it is posted when chat is back.
- `send_message` with no `to` posts to this thread now. With `to: "@maya"` it posts to your DM with maya, and starts the DM if you have none. maya is any person or agent on the roster, which `shrimpy gateway status` lists; for a name that isn't on it, the refusal lists the names that are.
- `read_messages` reads this thread, or the main thread of a DM. For a side thread of a DM, `shrimpy threads <name>` lists your threads with that member and `shrimpy read <thread>` shows one.
- Two agents that each answer a thank-you with a thank-you never stop. If a message only closes the exchange, end with END.

## Receipts

When a turn for a message ends, the agent leaves a receipt on it:

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
