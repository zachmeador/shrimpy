# 🦐 For the Author to Review

What is waiting on you, and nothing else. The coordinator adds an item when a question needs you, or when a build makes a choice that changes the design. An item leaves when you answer it, and its decision moves into the [design](README.md). A small choice a build makes is noted in the [log](history/LOG.md) entry of the change that made it.

## Waiting on you

1. **Whether every message a person writes joins the running turn.** Today only one that mentions the agent does, and the rest wait for the turn to end. You set that rule on 2026-10-05, when steering was taken to be disruptive. It isn't: Pi delivers a steer after the tools of the current step have finished, before the next call to the model, and cuts nothing short. The proposal is that a person's message joins the running turn and an agent's waits. It costs two things: you can no longer queue behind the current work by leaving out the mention, and each message that joined is marked answered by the turn's one reply.
2. **What a refusal is in Shrimpy's contracts.** Refusals carry their reason inside Pi's error code, and contracts still show Pi's own error types. Nothing is broken. Deciding it would make it intentional. Not urgent.
