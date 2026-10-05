# 🦐 For the Author to Review

What is waiting on you, and nothing else. The coordinator adds an item when a question needs you, or when a build makes a choice that changes the design. An item leaves when you answer it, and its decision moves into the [design](README.md). A small choice a build makes is noted in the [log](history/LOG.md) entry of the change that made it.

## Waiting on you

1. **The reshape of the agent's modules: go or no-go.** [The proposal](proposals/agent-modules.md) has the modules, what moves, how it would be done, and its one open name, `chat/`.
2. **A contract carries facts, and what a fact means is the reader's decision.** Whether it goes into the design, and with it the chat store recording only who a message mentions, which resets chat data once. [The proposal](proposals/facts-and-decisions.md) has what would change and what it costs.
3. **What a refusal is in Shrimpy's contracts.** Refusals carry their reason inside Pi's error code, and contracts still show Pi's own error types. Nothing is broken. Deciding it would make it intentional. Not urgent.
