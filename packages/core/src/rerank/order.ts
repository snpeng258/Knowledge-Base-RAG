import type { SearchCard } from "../retrieve/types.ts";
import type { RerankScore } from "./types.ts";

export function cardRerankText(card: SearchCard): string {
  const snippet = card.hits[0]?.snippet ?? "";
  return [card.title, card.description ?? "", snippet].filter((part) => part.length > 0).join("\n");
}

export function reorderCards(cards: SearchCard[], ranked: RerankScore[]): SearchCard[] {
  const used = new Set<number>();
  const ordered: SearchCard[] = [];
  const sorted = [...ranked].sort((left, right) => right.score - left.score);
  for (const row of sorted) {
    const card = cards[row.index];
    if (card === undefined || used.has(row.index)) {
      continue;
    }
    used.add(row.index);
    ordered.push(card);
  }
  cards.forEach((card, index) => {
    if (!used.has(index)) {
      ordered.push(card);
    }
  });
  return ordered;
}
