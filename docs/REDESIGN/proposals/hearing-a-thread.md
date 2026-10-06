# 🦐 Hearing a thread while working in it, proposed

**State:** your idea of 2026-10-06, looked into the same day at your request. Nothing is built. It leaves this folder when you have decided.

## The idea

You ask three agents in a room the same thing. One answers while the other two are still working. Today the two don't see that answer until they are next woken, so each answers blind.

The proposal: what anyone says in a thread, while an agent is working in that thread, reaches the agent at its next step, as something it hears. It never wakes an agent. An idle agent gets it as it does today, in what was said since it last looked, when something next wakes it.

## Pi has the piece

Pi takes two kinds of submission. An input is a message for the model that starts a turn or joins one. A write adds an entry to a session and never starts a turn:

- If the session is busy, the write waits in the same inbox a steer waits in and is placed at the next boundary, after the tools of the current step and before the next call to the model.
- If the session is idle, the entry is appended and nothing runs.
- An entry can carry the message the model is shown for it, so a write can put a user message of Shrimpy's own kind in front of the model.

Pi's own guidance says a write is the only right way to add to a session that is busy. Shrimpy uses none today: every message it hands a session is an input. All of this is from Pi's specification and its types. None of it has been run, so the build would start by trying one write on the real engine.

## How it would work

1. The feed brings an event that doesn't wake the agent: a post or an edit by someone else, in a thread where the agent has a session.
2. If that session is busy, the agent writes the message into it, saying who wrote it, when, and who it was for, as the backlog does. If the session is idle, nothing changes from today.
3. In the same step the agent moves where it has looked in that thread, so the next wake doesn't show the message again.
4. What every agent is told gains two sentences: what is said in a thread while you work there reaches you at your next step and isn't addressed to you, and if someone has said what you were going to say, add only what is missing or write END.

## Details to settle

| Detail | What I found | What I'd do |
|---|---|---|
| The entry | An entry has a kind, which can be Shrimpy's own, and the messages the model is shown for it. | A kind of Shrimpy's own, so that what was heard can be told from an input in storage, in the terminal's watch view and in a count of what a turn cost. |
| Once only | A write can't share a commit with the move of the agent's place in the feed: the function that admits a submission inside a commit is not public. A submission's request ID is honoured, and a known one writes nothing. | Name the write for the event. If the agent is killed between the write and the move, the event comes again and the write changes nothing. |
| What is heard | Posts, and edits of them, by anyone else, that the agent isn't taking up as an input. | That, in rooms. In a DM everything the other member writes is an input already. |
| An agent's message that mentions you | It is an input that waits for your turn to end. Under this proposal it would be the one message you don't see as you work. | Hear it too, and still take it up after. The sentence about a message you have already answered covers the second sight of it. |
| An answer that wakes whoever asked | An agent that mentioned another is woken with the answer. If it heard that answer while working, it would get it twice. | Don't wake it for an answer it has already heard. |
| A message during the last call to the model | It is placed after the answer, so the turn that just ended never reads it. It stays in the session, and the next turn has it above its input. | Nothing. It is neither lost nor repeated. |
| How much | A busy thread could pour into a working agent. | The backlog's limit: 20,000 characters heard in one turn, then one line that says more was said and that `read_messages` shows it. |
| A session that went idle meanwhile | The write is appended and wakes nobody. | Nothing. |
| A Pi edge | A write to an idle session whose inbox still holds inputs left by a failed turn places them and starts a turn. | Nothing new: the agent already takes such inputs back, and only writes to a busy session. |
| A room's wake policy | The policy says what wakes an agent. Hearing wakes nobody. | Hear in every room the agent works in, whatever its policy. A choice per room can come if a room proves too loud. |

## What it costs

- **Tokens.** An agent working in a busy thread reads what is said there as it works.
- **Behaviour nobody has seen.** Agents may build on each other, or herd to the first answer and drop their own. A demo with three agents in a room will show which.
- **It helps only a turn with a step left,** as with a person's message. Three agents that finish together still answer blind.
- **Code.** One file of the agent's side of chat does the writing, with words for what was heard, the session view learning one more kind of entry, and three or four tests. No contract changes.

## The version with no mechanism

One sentence in what every agent is told: before you answer a message that went to everyone, read the thread to see what has been said. An agent can do that today with `read_messages`, and scout did it unasked on 2026-10-06. It costs a tool call for each answer, and it only helps an agent that remembers to look.

## Not proposed, but it follows

The backlog could become writes too: every message in a thread written into the session of each agent there as it happens, idle or not. That would retire the marker of where an agent last looked and the fetch at each wake. It would also put every message of every room into every member's session, read or not, so it is left out.
