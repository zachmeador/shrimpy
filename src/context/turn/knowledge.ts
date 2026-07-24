import {
  searchWorkspaceKnowledge,
  type WorkspaceSearchResultItem,
} from "../../search/workspace.js";
import type {
  TurnContextInput,
  TurnContextItem,
} from "./types.js";

const SEARCH_RESULT_MULTIPLIER = 4;

export async function buildKnowledgeBreadcrumbItems(
  input: TurnContextInput,
): Promise<TurnContextItem[]> {
  const config = input.runtime.resolved.context.turn.knowledge;
  const query = knowledgeQuery(input);
  if (!query) return [];

  let results: WorkspaceSearchResultItem[];
  try {
    results = (await searchWorkspaceKnowledge(input.runtime, {
      query,
      limit: config.maxItems * SEARCH_RESULT_MULTIPLIER,
    })).results;
  } catch {
    return [];
  }

  const seenPaths = new Set<string>();
  const items: TurnContextItem[] = [];
  for (const result of results) {
    if (result.score < config.minScore || seenPaths.has(result.path)) continue;
    seenPaths.add(result.path);

    const heading = result.headingTrail.length > 0
      ? ` — ${result.headingTrail.join(" > ")}`
      : "";
    items.push({
      id: `knowledge:${result.path}`,
      summary: `workspace knowledge (relevance ${result.score.toFixed(2)}): ${result.path}:${result.lineStart}${heading}`,
      inspect: `${result.path}:${result.lineStart}`,
    });
    if (items.length >= config.maxItems) break;
  }
  return items;
}

function knowledgeQuery(input: TurnContextInput): string {
  const prompt = input.currentPrompt?.trim();
  if (prompt) return prompt;
  if (input.currentMessage?.content.type !== "text") return "";
  return input.currentMessage.content.data.text.trim();
}
