import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { repoRootFrom } from "../db/env.ts";
import { documentFromUtterances, parseMinutesTranscript, timestampToSeconds } from "./lark-transcript.ts";

const fixture = resolve(repoRootFrom(import.meta.url), "fixtures/eval/sample-minutes-transcript.txt");

test("parses speaker lines and relative timestamps", async () => {
  const raw = await readFile(fixture, "utf8");
  const utterances = parseMinutesTranscript(raw);
  assert.equal(utterances.length, 2);
  assert.equal(utterances[0]?.speaker, "说话人甲");
  assert.equal(utterances[0]?.tsStart, 1);
  assert.match(utterances[0]?.text ?? "", /产品力/);
  assert.equal(utterances[1]?.speaker, "说话人乙");
  assert.equal(utterances[1]?.tsStart, 18);
  assert.equal(timestampToSeconds("01:02:03.9"), 3723);
});

test("utterance offsets match concatenated content", async () => {
  const raw = await readFile(fixture, "utf8");
  const { content, pieces } = documentFromUtterances(parseMinutesTranscript(raw));
  assert.ok(pieces.length >= 2);
  for (const piece of pieces) {
    assert.equal(content.slice(piece.charStart, piece.charEnd), piece.text);
    assert.ok(piece.speaker.length > 0);
    assert.ok(piece.tsStart >= 0);
  }
});
