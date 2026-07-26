export interface InstructionDefinition<Args extends readonly unknown[] = readonly unknown[]> {
  id: string;
  source: "shrimpy";
  render: (...args: Args) => string;
}

export function defineInstruction(
  id: string,
  content: string,
): InstructionDefinition<[]>;
export function defineInstruction<Args extends readonly unknown[]>(
  id: string,
  render: (...args: Args) => string,
): InstructionDefinition<Args>;
export function defineInstruction<Args extends readonly unknown[]>(
  id: string,
  content: string | ((...args: Args) => string),
): InstructionDefinition<Args> {
  return {
    id,
    source: "shrimpy",
    render: typeof content === "string"
      ? () => content
      : content,
  };
}
