import { defineInstruction } from "./definition.js";

export const turnContextLeading = defineInstruction(
  "turn.context.leading",
  "The turn context above is background for the user message below. Answer the user message below using this context when relevant.",
);

export const turnContextTrailing = defineInstruction(
  "turn.context.trailing",
  "The turn context above is background for the user message immediately before it. Answer that message using this context when relevant.",
);
