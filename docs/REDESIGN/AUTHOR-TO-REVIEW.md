# 🦐 For the Author to Review

This page collects what you should look at: the questions waiting on you, the visible choices a build made, and the small mechanics it settled. The coordinator adds an item when a build makes a visible choice or a question needs you. An item leaves when you answer it, and its decision moves into the [plan](PLAN.md).

## Waiting on you

1. The reshape of the agent's modules: go or no-go. The proposal is written out in the plan, under [the agent's modules, proposed](proposals/agent-modules.md), with its one open name, `chat/`.
2. A contract carries facts, and what a fact means is the reader's decision. Whether it goes into the plan, and with it the chat store recording only who a message mentions, which resets chat data once. It is written out under [the contracts between them](proposals/facts-and-decisions.md), with what would change and what it costs.
3. Refusals carry their reason inside Pi's error code, and contracts still show Pi's own error types. Nothing is broken. Deciding what a refusal is in Shrimpy's contracts would make it intentional. Not urgent.
