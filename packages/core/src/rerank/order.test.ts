import assert from "node:assert/strict";
import { test } from "node:test";
import { cardRerankText, reorderCards } from "./order.ts";
import type { SearchCard } from "../retrieve/types.ts";

function card(id: string, title: string): SearchCard {
  return {
    id,
    kind: "file",
    title,
    description: `${id} desc`,
    tags: [],
    occurredAt: null,
    sourceUrl: null,
    score: 0.1,
    hits: [
      {
        chunkOrd: 0,
        snippet: `${title} snippet`,
        charStart: 0,
        charEnd: 8,
        speaker: null,
        tsStart: null,
      },
    ],
  };
}

test("reorderCards keeps the same ids and only changes order", () => {
  const cards = [card("a", "Alpha"), card("b", "Beta"), card("c", "Gamma")];
  const reordered = reorderCards(cards, [
    { index: 2, score: 0.9 },
    { index: 0, score: 0.2 },
    { index: 1, score: 0.1 },
  ]);
  assert.deepEqual(
    reordered.map((row) => row.id),
    ["c", "a", "b"],
  );
  assert.deepEqual([...reordered.map((row) => row.id)].sort(), ["a", "b", "c"]);
  assert.equal(reordered.length, cards.length);
});

test("cardRerankText uses title description and first snippet", () => {
  const text = cardRerankText(card("a", "Alpha"));
  assert.match(text, /Alpha/);
  assert.match(text, /a desc/);
  assert.match(text, /snippet/);
});
