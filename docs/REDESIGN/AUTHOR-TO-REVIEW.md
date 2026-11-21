# 🦐 For the Author to Review

What is waiting on you, and nothing else. The coordinator adds an item when a question needs you, or when a build makes a choice that changes the design. An item leaves when you answer it, and its decision moves into the [design](README.md). A small choice a build makes is noted in the [log](history/LOG.md) entry of the change that made it.

## Waiting on you

1. **Two things the CLI still takes from the agent's code.** [The layout](design/code-layout.md#what-may-import-what) lets the CLI use a program's front door only to start it. Since the review's fixes, everything else the CLI and the agent share is in `contracts/`, and two uses are left, each loaded only by its own command:
   - `shrimpy agent context`, which previews what a home would tell its agent with the agent's own code that builds its instructions;
   - signing in to a provider, which runs `pi-ai`'s sign-in, and only the agent may import `pi-ai`.

   Either the rule names these two, as "a program's front door to start it, and the agent's to preview a home and to sign in", or they move: the preview only through an agent that is running, and sign-in into a program that serves it, which is also how a web client could sign in, since it can't import `pi-ai` either. I'd name the two in the rule.

2. **How an agent is removed, or gets a new token.** [Identity](design/3-identity.md) leaves both open, and a way back in for an agent apart whose gateway's key changed. Today an agent's entry and its one token are made together, by joining, and never come apart. Taking the token back leaves the entry and its name with no way in, nothing gives an entry a new token, an invitation is only for a name nobody has, and nothing takes an entry off the roster. Your own entry is already split: it's made once, and your devices come and go as ways in to it.

   I'd give an agent the same split:
   - The entry is made once and keeps its ID. A token is a way in to it, and can be replaced.
   - An invitation can name an agent that exists. Joining with it puts the home's new token on that entry in place of the old one, and gives the home the gateway's current key. That one path covers a leaked token, a gateway whose key changed and a home that moves to another machine.
   - Removing an agent ends its ways in and frees its name, and its ID is never used again. Its home keeps its data, which beside the gateway means the home leaves the Shrimpy folder, or `shrimpy up` starts it again.
   - The roster owns the name: `agent.json` names the agent when it first joins, and renaming it after that takes an admin. Today an agent renames itself each time it links.
   - An agent's address is its ID, so a rename doesn't move it. Today an agent's objects are at `agent({ name })`.
   - The roster has an ID that each home keeps, as chat's store does, so an agent beside the gateway whose token was taken back is refused as unknown, instead of being told its name is taken.

   Gemini 4 Neon reached the same split on 2026-11-20 without seeing this, and added the last two.
