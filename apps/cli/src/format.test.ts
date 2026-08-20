import assert from "node:assert/strict";
import { test } from "node:test";
import type { SearchResponse } from "@summer-sum/core";
import { countHumanSearchResults, formatSearchHuman, formatSearchJson } from "./format.ts";

const sample: SearchResponse = {
  query: "demo",
  stage: "fulltext",
  degraded: false,
  total: 2,
  results: [
    {
      id: "doc-a",
      kind: "file",
      title: "Alpha",
      description: "desc a",
      tags: [],
      occurredAt: null,
      sourceUrl: null,
      score: 1,
      hits: [
        {
          chunkOrd: 0,
          snippet: "snippet a",
          charStart: 0,
          charEnd: 9,
          speaker: null,
          tsStart: null,
        },
      ],
    },
    {
      id: "doc-b",
      kind: "meeting",
      title: "Beta",
      description: null,
      tags: ["rag"],
      occurredAt: "2026-08-12T00:00:00.000Z",
      sourceUrl: null,
      score: 0.5,
      hits: [],
    },
  ],
};

test("json and human formatters report the same result count", () => {
  const json = formatSearchJson(sample) as { results: unknown[] };
  const human = formatSearchHuman(sample);
  assert.equal(json.results.length, sample.results.length);
  assert.equal(countHumanSearchResults(human), sample.results.length);
  assert.equal(countHumanSearchResults(formatSearchHuman({ ...sample, results: [], total: 0 })), 0);
});

test("search json cards do not include document content", () => {
  const json = formatSearchJson(sample) as { results: Record<string, unknown>[] };
  const first = json.results[0];
  assert.ok(first);
  assert.equal(Object.hasOwn(first, "content"), false);
  assert.equal(Object.hasOwn(first, "occurred_at"), true);
});
