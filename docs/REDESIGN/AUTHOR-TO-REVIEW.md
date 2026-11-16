# 🦐 For the Author to Review

What is waiting on you, and nothing else. The coordinator adds an item when a question needs you, or when a build makes a choice that changes the design. An item leaves when you answer it, and its decision moves into the [design](README.md). A small choice a build makes is noted in the [log](history/LOG.md) entry of the change that made it.

## Waiting on you

1. **Two things the CLI still takes from the agent's code.** [The layout](design/code-layout.md#what-may-import-what) lets the CLI use a program's front door only to start it. Since the review's fixes, everything else the CLI and the agent share is in `contracts/`, and two uses are left, each loaded only by its own command:
   - `shrimpy agent context`, which previews what a home would tell its agent with the agent's own code that builds its instructions;
   - signing in to a provider, which runs `pi-ai`'s sign-in, and only the agent may import `pi-ai`.

   Either the rule names these two, as "a program's front door to start it, and the agent's to preview a home and to sign in", or they move: the preview only through an agent that is running, and sign-in into a program that serves it, which is also how a web client could sign in, since it can't import `pi-ai` either. I'd name the two in the rule.
